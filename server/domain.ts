import { randomUUID } from "node:crypto";
import type { DemoState, Quote, Instrument } from "../shared/model.ts";
import {
  buy,
  sell,
  parseDollars,
  latest,
  SHARE_SCALE,
} from "../shared/model.ts";
import { instruments } from "../shared/fixtures.ts";
import type { DemoStore } from "./store.ts";

export class DomainError extends Error {
  status = 409;
}
export function rolledState(state: DemoState): DemoState {
  const today = new Date().toISOString().slice(0, 10);
  if (state.spendDay !== today) {
    state.spendDay = today;
    state.daySpent = "0";
  }
  return state;
}
function nonBypassable(
  state: DemoState,
  quote: Pick<Quote, "symbol" | "side" | "amount" | "units">,
) {
  if (state.policy.paused)
    throw new DomainError(
      "Practice investing is paused. Your parent can resume it.",
    );
  if (!state.policy.allowed.includes(quote.symbol))
    throw new DomainError(
      "This company is outside your current practice boundaries.",
    );
  if (quote.side === "buy" && BigInt(quote.amount) > BigInt(state.cash))
    throw new DomainError("There is not enough practice cash for this order.");
  if (
    quote.side === "sell" &&
    BigInt(quote.units) >
      BigInt(
        state.holdings.find((h) => h.symbol === quote.symbol)?.units ?? "0",
      )
  )
    throw new DomainError(
      "You do not have enough shares for this practice sale.",
    );
}
export function preview(
  state: DemoState,
  input: {
    symbol: string;
    side: "buy" | "sell";
    amount: string;
    reason: string;
  },
  prices: Instrument[] = instruments,
): Quote {
  rolledState(state);
  const instrument = prices.find((i) => i.symbol === input.symbol);
  if (!instrument)
    throw new DomainError("This company is not available in this sample.");
  const point = latest(instrument);
  const requested = parseDollars(input.amount);
  let order;
  if (input.side === "buy") order = buy(requested, BigInt(point.price));
  else {
    // Selling is entered as dollar value in the consumer form; fix share units at preview.
    const units = (requested * SHARE_SCALE) / BigInt(point.price);
    order = sell(units, BigInt(point.price));
  }
  const quote: Quote = {
    id: randomUUID(),
    symbol: input.symbol,
    side: input.side,
    requested: String(requested),
    ...{ amount: String(order.amount), units: String(order.units) },
    price: point.price,
    reason: input.reason.trim(),
    expiresAt: Date.now() + 120_000,
    revision: state.policy.revision,
    sequence: state.sequence,
    violations: [],
    marketDate: point.date,
    datasetId: state.portfolio?.datasetId,
    portfolioId: state.portfolio?.id,
  };
  nonBypassable(state, quote);
  if (quote.side === "buy" && requested > BigInt(state.policy.perTrade))
    quote.violations.push("This is above your per-investment limit.");
  if (
    quote.side === "buy" &&
    BigInt(state.daySpent) + order.amount > BigInt(state.policy.daily)
  )
    quote.violations.push("This would go above your daily practice allowance.");
  return quote;
}
export function execute(
  store: DemoStore,
  family: string,
  quoteId: string,
  actorRole?: "learner" | "parent",
) {
  return store.atomic(() => {
    const { quote, decision: existing } = store.getQuote(family, quoteId);
    const state = rolledState(store.get(family));
    if (existing) return state;
    if ((actorRole ?? state.role) !== "learner")
      throw new DomainError(
        "Switch to the learner preview to make a practice investment.",
      );
    if (Date.now() >= quote.expiresAt)
      throw new DomainError(
        "This preview has expired. Review a fresh price before continuing.",
      );
    if (
      quote.revision !== state.policy.revision ||
      quote.sequence !== state.sequence ||
      quote.datasetId !== state.portfolio?.datasetId ||
      quote.portfolioId !== state.portfolio?.id
    )
      throw new DomainError(
        "Your account changed since this preview. Please review the order again.",
      );
    if (
      state.portfolio &&
      Date.now() - Date.parse(quote.marketDate + "T21:00:00Z") > 5 * 86400_000
    )
      throw new DomainError(
        "Prices are stale. Review a fresh daily close before continuing.",
      );
    nonBypassable(state, quote);
    const approval = state.approvals.find(
      (a) => a.quote.id === quote.id && a.state === "approved",
    );
    const over =
      quote.side === "buy" &&
      (BigInt(quote.requested) > BigInt(state.policy.perTrade) ||
        BigInt(state.daySpent) + BigInt(quote.amount) >
          BigInt(state.policy.daily));
    if (over && !approval)
      throw new DomainError("This action needs your parent’s approval.");
    let holding = state.holdings.find((h) => h.symbol === quote.symbol);
    if (quote.side === "buy") {
      state.cash = String(BigInt(state.cash) - BigInt(quote.amount));
      state.daySpent = String(BigInt(state.daySpent) + BigInt(quote.amount));
      if (!holding) {
        holding = { symbol: quote.symbol, units: "0", cost: "0" };
        state.holdings.push(holding);
      }
      holding.units = String(BigInt(holding.units) + BigInt(quote.units));
      holding.cost = String(BigInt(holding.cost) + BigInt(quote.amount));
    } else {
      if (!holding) throw new DomainError("This holding could not be found.");
      const costReleased =
        (BigInt(holding.cost) * BigInt(quote.units)) / BigInt(holding.units);
      state.cash = String(BigInt(state.cash) + BigInt(quote.amount));
      holding.cost = String(BigInt(holding.cost) - costReleased);
      holding.units = String(BigInt(holding.units) - BigInt(quote.units));
      state.holdings = state.holdings.filter((h) => BigInt(h.units) > 0n);
    }
    const id = randomUUID(),
      now = new Date().toISOString();
    state.decisions.unshift({
      id,
      symbol: quote.symbol,
      side: quote.side,
      amount: quote.amount,
      units: quote.units,
      price: quote.price,
      reason: quote.reason,
      recordedAt: now,
      marketDate: quote.marketDate,
      origin: "local",
      memoryStatus: "local",
      portfolioId: quote.portfolioId,
      datasetId: quote.datasetId,
    });
    if (quote.reason)
      state.memories.unshift({
        id: randomUUID(),
        kind: "decision",
        decisionId: id,
        text: quote.reason,
        recordedAt: now,
        active: true,
        origin: "local",
      });
    if (approval) approval.state = "consumed";
    state.sequence++;
    store.consumeQuote(quote.id, id);
    store.set(state);
    return state;
  });
}
