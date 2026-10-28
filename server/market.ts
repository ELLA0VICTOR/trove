import { practiceCapital } from "../shared/funding.ts";
import { createHash, randomUUID } from "node:crypto";
import type { DemoStore } from "./store.ts";
import type {
  DemoState,
  Instrument,
  CorporateAction,
} from "../shared/model.ts";
import {
  applyAdjustment,
  decimalMicro,
  decimalRatio,
} from "../shared/corporate-actions.ts";
import { instruments as samples } from "../shared/fixtures.ts";
import type { MarketGateway } from "./integrations/market-data.ts";
import { DomainError } from "./domain.ts";
import { portfolioValue } from "../shared/model.ts";
export interface Dataset {
  id: string;
  asOf: string;
  receivedAt: string;
  instruments: Instrument[];
  excluded?: number;
  actions?: CorporateAction[];
  rawInstruments?: Instrument[];
  provider?: string;
  quoteMode?: "close" | "intraday";
  quoteAt?: string;
  marketOpen?: boolean;
  nextOpen?: string;
  nextClose?: string;
  unsupportedActions?: { symbol: string; date: string }[];
}
// Marketstack counts each symbol against the monthly allowance, including batches.
// A four-day import cadence keeps 12 symbols below 100 symbol-requests/month.
const TTL = 96 * 60 * 60000;
export const marketStale = (asOf: string, now = Date.now()) =>
  now - Date.parse(asOf + "T21:00:00Z") > 5 * 86400000;
/** One shared, private, persisted import. No browser requests ever call the provider. */
export class MarketService {
  private active?: Promise<void>;
  readonly store: DemoStore;
  readonly gateway?: MarketGateway;
  constructor(store: DemoStore, gateway?: MarketGateway) {
    this.store = store;
    this.gateway = gateway;
  }
  async latest(): Promise<Dataset | undefined> {
    const row = (await this.store.db
      .prepare(
        "SELECT payload FROM market_snapshots ORDER BY received_at DESC LIMIT 1",
      )
      .get()) as
      | {
          payload: string;
        }
      | undefined;
    return row && JSON.parse(row.payload);
  }
  async dataset(id: string): Promise<Dataset> {
    const row = (await this.store.db
      .prepare("SELECT payload FROM market_snapshots WHERE id=?")
      .get(id)) as
      | {
          payload: string;
        }
      | undefined;
    if (!row)
      throw new DomainError(
        "This market snapshot is unavailable. Refresh your account before continuing.",
      );
    return JSON.parse(row.payload);
  }
  async status(state: DemoState) {
    if (!state.portfolio)
      return {
        mode: "sample" as const,
        provider: "Authored samples",
        asOf: samples[0].prices.at(-1)!.date,
        stale: false,
        status: this.gateway
          ? "Market prices available for a new practice portfolio"
          : "Market prices not configured",
      };
    const data = await this.dataset(state.portfolio.datasetId);
    const current = await this.latest(),
      needsReview = Boolean(
        current && this.unsupportedPending(state, data, current),
      ),
      actionPending = Boolean(
        current &&
        current.id !== data.id &&
        (await this.hasCorporateAction(state, data, current)),
      );
    const now = Date.now();
    const sessionOpen =
      data.quoteMode === "intraday" &&
      (data.marketOpen
        ? now < Date.parse(data.nextClose ?? "")
        : now >= Date.parse(data.nextOpen ?? "") &&
          now < Date.parse(data.nextClose ?? ""));
    const providerRefresh =
      data.quoteMode === "intraday"
        ? await this.store.db
            .prepare(
              "SELECT status FROM market_provider_refresh WHERE provider=?",
            )
            .get("alpaca-iex")
        : undefined;
    const stale =
      marketStale(data.asOf) ||
      providerRefresh?.status === "failed" ||
      Boolean(
        sessionOpen &&
        (now - Date.parse(data.receivedAt) > 5 * 60000 ||
          now - Date.parse(data.quoteAt ?? "") > 10 * 60000),
      );
    return {
      mode: "market" as const,
      provider: data.provider ?? "Marketstack daily close",
      asOf: data.asOf,
      receivedAt: data.receivedAt,
      datasetId: data.id,
      stale,
      quoteMode: data.quoteMode ?? "close",
      quoteAt: data.quoteAt,
      marketOpen:
        data.quoteMode === "intraday" ? Boolean(sessionOpen) : undefined,
      blocked: actionPending || needsReview,
      status: needsReview
        ? "A corporate action needs review before practice continues."
        : actionPending
          ? "Applying automatic split and dividend entries."
          : stale
            ? "Prices are stale. New practice orders are paused."
            : data.quoteMode === "intraday"
              ? sessionOpen
                ? "IEX prices refreshed about once a minute"
                : "Market closed · last available IEX prices"
              : "Daily closing prices, not real-time quotes",
    };
  }
  async instruments(state: DemoState) {
    return state.portfolio
      ? (await this.dataset(state.portfolio.datasetId)).instruments
      : samples;
  }
  async history(state: DemoState) {
    if (!state.portfolio) return undefined;
    const date = new Date().toISOString().slice(0, 10);
    const existing = (await this.store.db
      .prepare(
        "SELECT date,value FROM portfolio_marks WHERE family=? AND portfolio=? ORDER BY date",
      )
      .all(state.id, state.portfolio.id)) as {
      date: string;
      value: string;
    }[];
    if (!existing.length) {
      // Backfill existing local ledgers before the first persisted observation.
      // Earlier marks are preserved when a later snapshot changes share units.
      const bases = new Map<string, Instrument[]>();
      for (const entry of state.adjustments ?? [])
        bases.set(
          entry.fromDataset,
          (await this.dataset(entry.fromDataset)).instruments,
        );
      const prices = await this.instruments(state);
      for (const point of accountHistory(
        state,
        prices,
        (id) => bases.get(id) ?? prices,
      ) ?? []) {
        if (point.date >= date) continue;
        await this.store.db
          .prepare("INSERT OR IGNORE INTO portfolio_marks VALUES(?,?,?,?,?)")
          .run(
            state.id,
            state.portfolio.id,
            point.date,
            String(BigInt(Math.round(point.value * 1000000))),
            state.portfolio.datasetId,
          );
      }
    }
    const value = portfolioValue(state, await this.instruments(state));
    await this.store.db
      .prepare(
        "INSERT INTO portfolio_marks VALUES(?,?,?,?,?) ON CONFLICT(family,portfolio,date) DO UPDATE SET value=excluded.value,dataset=excluded.dataset",
      )
      .run(
        state.id,
        state.portfolio.id,
        date,
        String(value),
        state.portfolio.datasetId,
      );
    return (
      (await this.store.db
        .prepare(
          "SELECT date,value FROM portfolio_marks WHERE family=? AND portfolio=? ORDER BY date",
        )
        .all(state.id, state.portfolio.id)) as {
        date: string;
        value: string;
      }[]
    ).map((p) => ({ date: p.date, value: Number(p.value) / 1000000 }));
  }
  async observations(state: DemoState, now = Date.now()) {
    if (!state.portfolio) return undefined;
    const portfolio = state.portfolio;
    const stamp = (time: number) =>
      new Date(Math.floor(time / 1000) * 1000).toISOString();
    const initialAt = stamp(Date.parse(portfolio.startedAt));
    const observedAt = stamp(Math.max(now, Date.parse(portfolio.startedAt)));
    const value = String(portfolioValue(state, await this.instruments(state)));
    const capital = String(practiceCapital(state));
    await this.store.atomic(async () => {
      await this.store.db.lock(
        `portfolio-observations:${state.id}:${portfolio.id}`,
      );
      // The initial cash is an actual opening balance, even before the first trade.
      await this.store.db
        .prepare(
          "INSERT OR IGNORE INTO portfolio_observations VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          state.id,
          portfolio.id,
          initialAt,
          portfolio.initialCash,
          portfolio.initialCash,
          portfolio.datasetId,
          0,
        );
      const last = await this.store.db
        .prepare(
          "SELECT * FROM portfolio_observations WHERE family=? AND portfolio=? ORDER BY observed_at DESC LIMIT 1",
        )
        .get(state.id, portfolio.id);
      if (
        !last ||
        (observedAt >= String(last.observed_at) &&
          (last.value !== value ||
            last.capital !== capital ||
            last.dataset !== portfolio.datasetId ||
            Number(last.sequence) !== state.sequence))
      ) {
        await this.store.db
          .prepare(
            "INSERT INTO portfolio_observations VALUES(?,?,?,?,?,?,?) ON CONFLICT(family,portfolio,observed_at) DO UPDATE SET value=excluded.value,capital=excluded.capital,dataset=excluded.dataset,sequence=excluded.sequence",
          )
          .run(
            state.id,
            portfolio.id,
            observedAt,
            value,
            capital,
            portfolio.datasetId,
            state.sequence,
          );
      }
      // Daily marks preserve long-term history; retain one week of detailed samples.
      await this.store.db
        .prepare(
          "DELETE FROM portfolio_observations WHERE family=? AND portfolio=? AND observed_at<? AND observed_at<>?",
        )
        .run(state.id, portfolio.id, stamp(now - 7 * 86400000), initialAt);
    });
    const records = await this.store.db
      .prepare(
        "SELECT observed_at,value,capital FROM portfolio_observations WHERE family=? AND portfolio=? ORDER BY observed_at",
      )
      .all(state.id, portfolio.id);
    const points = records.map((row) => ({
      date: String(row.observed_at),
      value: Number(row.value) / 1000000,
      capital: Number(row.capital) / 1000000,
    }));
    // A current valuation can extend a flat line without writing identical rows on every refresh.
    if (points.at(-1)!.date < observedAt)
      points.push({
        date: observedAt,
        value: Number(value) / 1000000,
        capital: Number(capital) / 1000000,
      });
    return points;
  }
  async refresh() {
    if (!this.gateway) return;
    if (this.active) return this.active;
    this.active = this.import().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async import() {
    const provider = this.gateway!.source;
    const claimed = await this.store.atomic(async () => {
      await this.store.db.lock("market-import");
      const row = (await (provider
        ? this.store.db
            .prepare(
              "SELECT next_at FROM market_provider_refresh WHERE provider=?",
            )
            .get(provider)
        : this.store.db
            .prepare("SELECT next_at FROM market_refresh WHERE id=1")
            .get())) as
        | {
            next_at: number;
          }
        | undefined;
      if (row && row.next_at > Date.now()) return false;
      // Reserve before network I/O; restarts cannot consume the provider quota in a loop.
      if (provider)
        await this.store.db
          .prepare(
            "INSERT INTO market_provider_refresh VALUES(?,?,'loading') ON CONFLICT(provider) DO UPDATE SET next_at=excluded.next_at,status='loading'",
          )
          .run(provider, Date.now() + (this.gateway!.refreshMs ?? TTL));
      else
        await this.store.db
          .prepare(
            "INSERT INTO market_refresh VALUES(1,?,'loading') ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at,status='loading'",
          )
          .run(Date.now() + TTL);
      return true;
    });
    if (!claimed) return;
    try {
      const now = new Date(),
        from = new Date(now.getTime() - 90 * 86400000)
          .toISOString()
          .slice(0, 10);
      const results = await this.gateway!.histories(
        samples.map((i) => i.symbol),
        from,
        now.toISOString().slice(0, 10),
      );
      const common = results[0].prices
        .map((p) => p.date)
        .filter((date) =>
          results.every((r) => r.prices.some((p) => p.date === date)),
        );
      if (common.length < 2)
        throw new Error("Insufficient aligned market history.");
      const rawInstruments = samples.map((sample) => ({
        ...sample,
        prices: results.find((r) => r.symbol === sample.symbol)!.prices,
      }));
      const instruments = rawInstruments.map((sample) => ({
        ...sample,
        prices: results
          .find((r) => r.symbol === sample.symbol)!
          .prices.filter((p) => common.includes(p.date)),
      }));
      const asOf = common.at(-1)!;
      if (marketStale(asOf))
        throw new Error("The provider returned stale market history.");
      const receivedAt = new Date().toISOString(),
        id = createHash("sha256")
          .update(
            JSON.stringify(
              provider
                ? [
                    provider,
                    rawInstruments,
                    results.flatMap((r) => r.unsupportedActions ?? []),
                    results[0].marketOpen,
                    results[0].nextOpen,
                    results[0].nextClose,
                  ]
                : rawInstruments,
            ),
          )
          .digest("hex");
      const data: Dataset = {
        id,
        asOf,
        receivedAt,
        instruments,
        rawInstruments,
        actions: corporateActions(rawInstruments),
        excluded: results.reduce((sum, r) => sum + (r.excluded ?? 0), 0),
        ...(provider
          ? {
              provider: results[0].provider,
              quoteMode: "intraday" as const,
              quoteAt: results
                .map((r) => r.quoteAt)
                .filter((v): v is string => Boolean(v))
                .sort()[0],
              marketOpen: results[0].marketOpen,
              nextOpen: results[0].nextOpen,
              nextClose: results[0].nextClose,
              unsupportedActions: results.flatMap(
                (r) => r.unsupportedActions ?? [],
              ),
            }
          : {}),
      };
      await this.store.db
        .prepare("INSERT OR IGNORE INTO market_snapshots VALUES(?,?,?,?)")
        .run(id, asOf, receivedAt, JSON.stringify(data));
      if (provider)
        await this.store.db
          .prepare(
            "UPDATE market_provider_refresh SET status='ready' WHERE provider=?",
          )
          .run(provider);
      else
        await this.store.db
          .prepare("UPDATE market_refresh SET status='ready' WHERE id=1")
          .run();
    } catch {
      if (provider)
        await this.store.db
          .prepare(
            "UPDATE market_provider_refresh SET status='failed' WHERE provider=?",
          )
          .run(provider);
      else
        await this.store.db
          .prepare("UPDATE market_refresh SET status='failed' WHERE id=1")
          .run();
      console.error(
        "[trove] Market import failed; cached prices remain labelled and stale prices cannot execute.",
      );
    }
  }
  async enroll(
    family: string,
    allowArchive = false,
    clearExamples = false,
    allowStale = false,
  ) {
    const data = await this.latest();
    if (!data || (!allowStale && marketStale(data.asOf)))
      throw new DomainError("Fresh market prices are not available yet.");
    return await this.store.atomic(async () => {
      const state = await this.store.get(family);
      if (state.portfolio) return state;
      if ((state.holdings.length || state.decisions.length) && !allowArchive)
        return state;
      await this.store.db
        .prepare("INSERT INTO portfolio_archives VALUES(?,?,?,?)")
        .run(
          randomUUID(),
          family,
          JSON.stringify(state),
          new Date().toISOString(),
        );
      state.portfolio = {
        id: randomUUID(),
        startedAt: new Date().toISOString(),
        initialCash: String(practiceCapital(state)),
        datasetId: data.id,
      };
      state.cash = state.portfolio.initialCash;
      state.holdings = [];
      if (clearExamples) {
        state.decisions = state.decisions.filter((d) => d.origin !== "sample");
        state.memories = state.memories.filter((m) => m.origin !== "sample");
      }
      state.approvals = [];
      state.daySpent = "0";
      state.sequence++;
      await this.store.set(state);
      return state;
    });
  }
  async advance(family: string) {
    const data = await this.latest(),
      state = await this.store.get(family);
    if (!data || !state.portfolio || state.portfolio.datasetId === data.id)
      return state;
    if (
      this.unsupportedPending(
        state,
        await this.dataset(state.portfolio.datasetId),
        data,
      )
    )
      return state;
    if (
      await this.store.db
        .prepare(
          "SELECT 1 FROM chain_intents WHERE family=? AND state IN ('building','prepared','submitting','pending')",
        )
        .get(family)
    )
      return state;
    const onchain = await this.store.db
      .prepare("SELECT 1 FROM chain_accounts WHERE family=?")
      .get(family);
    const plan = await this.plan(state);
    if (!plan.entries.length) {
      // Keep an already reviewed price stable through its short signing window.
      const activeQuote = await this.store.db
        .prepare(
          "SELECT 1 FROM quotes WHERE family=? AND decision IS NULL AND json_extract(payload,'$.datasetId')=? AND CAST(json_extract(payload,'$.expiresAt') AS BIGINT)>? AND CAST(json_extract(payload,'$.sequence') AS BIGINT)=? AND CAST(json_extract(payload,'$.revision') AS BIGINT)=? LIMIT 1",
        )
        .get(
          family,
          state.portfolio.datasetId,
          Date.now(),
          state.sequence,
          state.policy.revision,
        );
      if (activeQuote) return state;
    }
    if (onchain && plan.entries.length) return state;
    return await this.store.atomic(async () => {
      for (const entry of plan.entries)
        applyAdjustment(state, entry, state.portfolio!.datasetId, data.id);
      state.portfolio!.datasetId = data.id;
      if (!onchain && !plan.entries.length) state.sequence++;
      await this.store.set(state);
      return state;
    });
  }
  async plan(state: DemoState) {
    const target = await this.latest(),
      before =
        state.portfolio && (await this.dataset(state.portfolio.datasetId));
    const projected = structuredClone(state);
    const entries = [] as import("../shared/model.ts").Adjustment[];
    if (target && before && this.unsupportedPending(state, before, target))
      return { from: before, target, entries, projected };
    if (target && before && target.id !== before.id) {
      const actions = await this.actionsBetween(before, target);
      for (const action of actions.filter(
        (a) => a.date > before.asOf && a.date <= target.asOf,
      )) {
        const entry = applyAdjustment(projected, action, before.id, target.id);
        if (entry) entries.push(entry);
      }
    }
    return { from: before, target, entries, projected };
  }
  private async hasCorporateAction(
    state: DemoState,
    old: Dataset,
    data: Dataset,
  ) {
    return (await this.actionsBetween(old, data)).some(
      (a) =>
        a.date > old.asOf &&
        a.date <= data.asOf &&
        state.holdings.some(
          (h) => h.symbol === a.symbol && BigInt(h.units) > 0n,
        ),
    );
  }
  private unsupportedPending(state: DemoState, old: Dataset, target: Dataset) {
    return (target.unsupportedActions ?? []).some(
      (a) =>
        a.date > old.asOf &&
        a.date <= target.asOf &&
        state.holdings.some(
          (h) => h.symbol === a.symbol && BigInt(h.units) > 0n,
        ),
    );
  }
  private async actionsBetween(old: Dataset, target: Dataset) {
    // Retain actions that have rolled out of the provider's current history window.
    const snapshots = (await this.store.db
      .prepare(
        "SELECT payload FROM market_snapshots WHERE as_of>? AND as_of<=? AND received_at<=? ORDER BY received_at",
      )
      .all(old.asOf, target.asOf, target.receivedAt)) as {
      payload: string;
    }[];
    const events = new Map<string, CorporateAction>();
    for (const { payload } of snapshots) {
      const data = JSON.parse(payload) as Dataset;
      for (const event of data.actions ??
        corporateActions(data.rawInstruments ?? data.instruments))
        events.set(event.id, event);
    }
    return [...events.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.symbol.localeCompare(b.symbol) ||
        (a.kind === b.kind ? 0 : a.kind === "split" ? -1 : 1),
    );
  }
  async assertTradable(state: DemoState) {
    if ((await this.status(state)).blocked)
      throw new DomainError(
        "Your portfolio is applying automatic split and dividend entries. Please try again shortly.",
      );
    if (state.portfolio && (await this.status(state)).stale)
      throw new DomainError(
        "Prices are stale. Wait for a fresh price before making a practice order.",
      );
  }
}
export function corporateActions(instruments: Instrument[]): CorporateAction[] {
  const actions: CorporateAction[] = [];
  for (const instrument of instruments)
    for (const point of instrument.prices) {
      const base = {
        symbol: instrument.symbol,
        date: point.date,
        price: point.price,
      };
      if (point.splitFactor != null && point.splitFactor !== 1)
        actions.push({
          ...base,
          id: createHash("sha256")
            .update(`Marketstack:split:${instrument.symbol}:${point.date}`)
            .digest("hex"),
          kind: "split",
          ...decimalRatio(point.splitFactor),
          dividend: "0",
        });
      if ((point.dividend ?? 0) > 0)
        actions.push({
          ...base,
          id: createHash("sha256")
            .update(`Marketstack:dividend:${instrument.symbol}:${point.date}`)
            .digest("hex"),
          kind: "dividend",
          numerator: "1",
          denominator: "1",
          dividend: decimalMicro(point.dividend!),
        });
    }
  return actions.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.symbol.localeCompare(b.symbol) ||
      (a.kind === b.kind ? 0 : a.kind === "split" ? -1 : 1),
  );
}
/** Value the positions held at each actual observation, never today's positions in the past. */
export function accountHistory(
  state: DemoState,
  instruments: Instrument[],
  resolveDataset?: (id: string) => Instrument[],
) {
  if (!state.portfolio) return undefined;
  const start = state.portfolio.startedAt.slice(0, 10);
  const days = new Set(
    instruments[0].prices.filter((p) => p.date >= start).map((p) => p.date),
  );
  days.add(start);
  days.add(new Date().toISOString().slice(0, 10));
  const decisions = state.decisions
    .filter((d) => d.portfolioId === state.portfolio!.id)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const adjustments = (state.adjustments ?? []).filter(
    (a) => a.portfolioId === state.portfolio!.id,
  );
  const funding = (state.funding ?? []).filter(
    (entry) => entry.portfolioId === state.portfolio!.id,
  );
  const events = [
    ...funding.map((entry) => ({
      time: entry.recordedAt,
      type: "funding" as const,
      value: entry,
    })),
    ...decisions.map((d) => ({
      time: d.recordedAt,
      type: "trade" as const,
      value: d,
    })),
    ...adjustments.map((a) => ({
      time: a.recordedAt,
      type: "adjustment" as const,
      value: a,
    })),
  ].sort(
    (a, b) =>
      a.time.localeCompare(b.time) ||
      (a.type === "adjustment" && b.type === "adjustment"
        ? a.value.date.localeCompare(b.value.date) ||
          a.value.symbol.localeCompare(b.value.symbol) ||
          (a.value.kind === b.value.kind
            ? 0
            : a.value.kind === "split"
              ? -1
              : 1)
        : a.type === b.type
          ? 0
          : a.type === "adjustment"
            ? -1
            : 1),
  );
  for (const event of events) days.add(event.time.slice(0, 10));
  return [...days].sort().map((date) => {
    let cash = BigInt(state.portfolio!.initialCash);
    const positions = new Map<string, bigint>();
    // Before a booked adjustment, value old units against that exact old snapshot.
    const futureAdjustment = adjustments
      .filter((a) => a.recordedAt.slice(0, 10) > date)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
    const history =
      futureAdjustment && resolveDataset
        ? resolveDataset(futureAdjustment.fromDataset)
        : instruments;
    for (const event of events.filter((e) => e.time.slice(0, 10) <= date)) {
      if (event.type === "trade") {
        const d = event.value;
        cash += BigInt(d.amount) * (d.side === "buy" ? -1n : 1n);
        positions.set(
          d.symbol,
          (positions.get(d.symbol) ?? 0n) +
            BigInt(d.units) * (d.side === "buy" ? 1n : -1n),
        );
      } else if (event.type === "funding") {
        cash += BigInt(event.value.amount);
      } else {
        const a = event.value;
        cash += BigInt(a.cashDelta);
        positions.set(a.symbol, BigInt(a.unitsAfter));
      }
    }
    for (const [symbol, units] of positions) {
      const price = history
        .find((i) => i.symbol === symbol)!
        .prices.filter((p) => p.date <= date)
        .at(-1);
      if (price) cash += (units * BigInt(price.price)) / 100000000n;
    }
    return { date, value: Number(cash) / 1000000 };
  });
}
