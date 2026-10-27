export interface Instrument {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  color: string;
  prices: {
    date: string;
    price: string;
    adjustedPrice?: string;
    splitFactor?: number | null;
    dividend?: number | null;
  }[];
}
export interface Holding {
  symbol: string;
  units: string;
  cost: string;
}
export interface CorporateAction {
  id: string;
  symbol: string;
  kind: "split" | "dividend";
  date: string;
  numerator: string;
  denominator: string;
  dividend: string;
  price: string;
}
export interface Adjustment extends CorporateAction {
  portfolioId: string;
  fromDataset: string;
  toDataset: string;
  unitsBefore: string;
  unitsAfter: string;
  cashDelta: string;
  costReleased: string;
  recordedAt: string;
  transactionDigest?: string;
}
export interface Decision {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  amount: string;
  units: string;
  price: string;
  reason: string;
  recordedAt: string;
  marketDate: string;
  origin: "sample" | "local";
  memoryStatus: "local" | "queued" | "confirmed";
  portfolioId?: string;
  datasetId?: string;
  transactionDigest?: string;
}
export interface Memory {
  id: string;
  kind: "decision" | "reflection" | "correction" | "learning";
  text: string;
  recordedAt: string;
  decisionId?: string;
  supersedes?: string;
  active: boolean;
  origin: "sample" | "local";
  blobId?: string;
  syncStatus?: string;
}
export interface Policy {
  perTrade: string;
  daily: string;
  paused: boolean;
  revision: number;
  allowed: string[];
}
export interface Quote {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  requested: string;
  amount: string;
  units: string;
  price: string;
  reason: string;
  expiresAt: number;
  revision: number;
  sequence: number;
  violations: string[];
  marketDate: string;
  datasetId?: string;
  portfolioId?: string;
}
export interface Approval {
  id: string;
  quote: Quote;
  state: "requested" | "approved" | "declined" | "consumed";
  createdAt: string;
}
export interface Attempt {
  id: string;
  concept: string;
  answer: number;
  correct: boolean;
  recordedAt: string;
  variant?: string;
  phase?: "foundation" | "transfer";
}
export interface DemoState {
  id: string;
  role: "learner" | "parent";
  learner: string;
  cash: string;
  holdings: Holding[];
  sequence: number;
  policy: Policy;
  decisions: Decision[];
  memories: Memory[];
  approvals: Approval[];
  attempts: Attempt[];
  daySpent: string;
  spendDay: string;
  adjustments?: Adjustment[];
  portfolio?: {
    id: string;
    startedAt: string;
    initialCash: string;
    datasetId: string;
  };
}
export interface AppSnapshot extends DemoState {
  chain?: import("./chain.ts").ChainStatus;
  instruments: Instrument[];
  market?: {
    mode: "sample" | "market";
    provider: string;
    asOf: string;
    receivedAt?: string;
    datasetId?: string;
    stale: boolean;
    blocked?: boolean;
    status: string;
  };
  portfolioHistory?: { date: string; value: number }[];
  session?: {
    mode: "sample" | "account";
    username?: string;
    role: "parent" | "learner";
    memoryEnabled: boolean;
    servicesReady: boolean;
    recovery?: {
      ready: boolean;
      email?: string;
      pendingEmail?: string;
      delivery?: "pending" | "sent" | "failed" | "expired";
      guardianRecovery?: boolean;
    };
  };
}
export interface GuideReply {
  text: string;
  sources: string[];
  concept: string;
  mode: "local" | "live";
  evidence?: { id: string; kind: string; blobId: string }[];
  cached?: boolean;
}

export const USD_SCALE = 1_000_000n;
export const SHARE_SCALE = 100_000_000n;

export class InputError extends Error {}

export function parseDollars(input: string): bigint {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(input))
    throw new InputError("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = input.split(".");
  return BigInt(whole) * USD_SCALE + BigInt(fraction.padEnd(6, "0"));
}
export function money(value: string | bigint, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) / Number(USD_SCALE));
}
export function shares(value: string | bigint): string {
  return (Number(value) / Number(SHARE_SCALE)).toLocaleString("en-US", {
    maximumFractionDigits: 5,
  });
}
export function buy(budget: bigint, price: bigint) {
  if (budget <= 0n || price <= 0n || budget > 10_000_000n * USD_SCALE)
    throw new InputError(
      "The practice amount or price is outside the supported range.",
    );
  const units = (budget * SHARE_SCALE) / price;
  if (!units)
    throw new InputError("That amount is too small for a practice order.");
  return { units, amount: (units * price + SHARE_SCALE - 1n) / SHARE_SCALE };
}
export function sell(units: bigint, price: bigint) {
  if (units <= 0n || price <= 0n)
    throw new InputError("Choose a positive quantity to sell.");
  return { units, amount: (units * price) / SHARE_SCALE };
}
export function valueOf(holding: Holding, price: string): bigint {
  return (BigInt(holding.units) * BigInt(price)) / SHARE_SCALE;
}
export function latest(instrument: Instrument) {
  return instrument.prices[instrument.prices.length - 1];
}
export function portfolioValue(
  state: Pick<DemoState, "cash" | "holdings">,
  instruments: Instrument[],
): bigint {
  return (
    BigInt(state.cash) +
    state.holdings.reduce((total, holding) => {
      const instrument = instruments.find((i) => i.symbol === holding.symbol);
      return (
        total + (instrument ? valueOf(holding, latest(instrument).price) : 0n)
      );
    }, 0n)
  );
}
export function portfolioSeries(
  holdings: Holding[],
  cash: string,
  instruments: Instrument[],
) {
  return instruments[0].prices.map((point, index) => ({
    date: point.date,
    value:
      Number(
        BigInt(cash) +
          holdings.reduce((sum, holding) => {
            const instrument = instruments.find(
              (i) => i.symbol === holding.symbol,
            );
            return (
              sum +
              (instrument
                ? valueOf(holding, instrument.prices[index].price)
                : 0n)
            );
          }, 0n),
      ) / Number(USD_SCALE),
  }));
}
export function replay(
  instruments: Instrument[],
  weights: Record<string, number>,
  start: number,
  end: number,
  capital = 1000,
) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end >= instruments[0].prices.length
  )
    throw new Error("Choose a valid comparison period.");
  const entries = Object.entries(weights);
  if (
    entries.some(
      ([symbol, weight]) =>
        !instruments.some((i) => i.symbol === symbol) ||
        !Number.isInteger(weight) ||
        weight < 0 ||
        weight > 100,
    ) ||
    entries.reduce((sum, [, w]) => sum + w, 0) > 100
  )
    throw new Error(
      "Allocations must be whole percentages adding up to no more than 100%.",
    );
  let cash = BigInt(capital) * USD_SCALE;
  const holdings: Holding[] = [];
  for (const [symbol, weight] of entries) {
    if (!weight) continue;
    const instrument = instruments.find((i) => i.symbol === symbol)!;
    const order = buy(
      (BigInt(capital) * USD_SCALE * BigInt(weight)) / 100n,
      BigInt(instrument.prices[start].price),
    );
    cash -= order.amount;
    holdings.push({
      symbol,
      units: String(order.units),
      cost: String(order.amount),
    });
  }
  return instruments[0].prices.slice(start, end + 1).map((point, offset) => ({
    date: point.date,
    value:
      Number(
        cash +
          holdings.reduce(
            (sum, holding) =>
              sum +
              valueOf(
                holding,
                instruments.find((i) => i.symbol === holding.symbol)!.prices[
                  start + offset
                ].price,
              ),
            0n,
          ),
      ) / Number(USD_SCALE),
  }));
}
