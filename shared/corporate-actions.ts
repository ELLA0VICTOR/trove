import type {
  Adjustment,
  CorporateAction,
  DemoState,
  Holding,
} from "./model.ts";
import { SHARE_SCALE } from "./model.ts";
const U64 = (1n << 64n) - 1n;

/** Decimal provider fields become exact rationals before any ledger calculation. */
export function decimalRatio(value: number | string) {
  const text = String(value);
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    !/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(text)
  ) {
    let x = value,
      hn = 1,
      hp = 0,
      kn = 0,
      kp = 1;
    for (let i = 0; i < 32; i++) {
      const a = Math.floor(x),
        h = a * hn + hp,
        k = a * kn + kp;
      if (
        !Number.isSafeInteger(h) ||
        !Number.isSafeInteger(k) ||
        h > 1e9 ||
        k > 1e9
      )
        break;
      if (
        h > 0 &&
        k > 0 &&
        Math.abs(h / k - value) <= Math.max(1e-15, value * 1e-12)
      )
        return { numerator: String(h), denominator: String(k) };
      [hp, hn, kp, kn] = [hn, h, kn, k];
      if (x === a) break;
      x = 1 / (x - a);
    }
    throw new Error(
      "The provider split factor cannot be represented reliably.",
    );
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(text))
    throw new Error("Invalid corporate-action ratio.");
  const [whole, fraction = ""] = text.split(".");
  let n = BigInt(whole + fraction),
    d = 10n ** BigInt(fraction.length);
  const gcd = (a: bigint, b: bigint): bigint => (b ? gcd(b, a % b) : a);
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (n <= 0n || n > 1_000_000_000n || d > 1_000_000_000n)
    throw new Error(
      "Corporate-action ratio is outside the supported integer range.",
    );
  return { numerator: String(n), denominator: String(d) };
}
export function decimalMicro(value: number | string) {
  const text = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(text))
    throw new Error("Invalid USD distribution precision.");
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (result > U64)
    throw new Error("USD distribution is outside the supported range.");
  return String(result);
}
export function adjustmentAmounts(holding: Holding, action: CorporateAction) {
  const before = BigInt(holding.units),
    cost = BigInt(holding.cost),
    n = BigInt(action.numerator),
    d = BigInt(action.denominator),
    price = BigInt(action.price),
    dividend = BigInt(action.dividend);
  if (
    before < 0n ||
    before > U64 ||
    cost < 0n ||
    cost > U64 ||
    n <= 0n ||
    n > 1_000_000_000n ||
    d <= 0n ||
    d > 1_000_000_000n ||
    price <= 0n ||
    price > U64 ||
    dividend < 0n ||
    dividend > U64
  )
    throw new Error("Invalid corporate-action amounts.");
  if (action.kind === "split") {
    if (dividend !== 0n)
      throw new Error("A split cannot contain a dividend credit.");
    const scaled = before * n,
      units = scaled / d,
      remainder = scaled % d;
    if (units > U64)
      throw new Error("Split quantity exceeds the supported share range.");
    return {
      units,
      cashDelta: (remainder * price) / (d * SHARE_SCALE),
      costReleased: scaled ? (cost * remainder) / scaled : 0n,
    };
  }
  if (n !== 1n || d !== 1n || dividend <= 0n)
    throw new Error("Invalid dividend terms.");
  return {
    units: before,
    cashDelta: (before * dividend) / SHARE_SCALE,
    costReleased: 0n,
  };
}
export function applyAdjustment(
  state: DemoState,
  action: CorporateAction,
  fromDataset: string,
  toDataset: string,
  recordedAt = new Date().toISOString(),
): Adjustment | undefined {
  if (!state.portfolio) throw new Error("A market portfolio is required.");
  const applied = state.adjustments ?? [];
  if (
    applied.some(
      (a) => a.portfolioId === state.portfolio!.id && a.id === action.id,
    )
  )
    return undefined;
  const holding = state.holdings.find((h) => h.symbol === action.symbol);
  if (!holding || BigInt(holding.units) === 0n) return undefined;
  const result = adjustmentAmounts(holding, action),
    cash = BigInt(state.cash) + result.cashDelta;
  if (cash > U64) throw new Error("Adjusted cash exceeds the supported range.");
  const entry: Adjustment = {
    ...action,
    portfolioId: state.portfolio.id,
    fromDataset,
    toDataset,
    unitsBefore: holding.units,
    unitsAfter: String(result.units),
    cashDelta: String(result.cashDelta),
    costReleased: String(result.costReleased),
    recordedAt,
  };
  holding.units = entry.unitsAfter;
  holding.cost = String(BigInt(holding.cost) - result.costReleased);
  state.holdings = state.holdings.filter((h) => BigInt(h.units) > 0n);
  state.cash = String(cash);
  state.adjustments = [entry, ...applied];
  state.sequence++;
  // Only an exact, unchanged quote can have an exception. A ledger event invalidates it.
  state.approvals = state.approvals.map((a) =>
    a.state === "approved" || a.state === "requested"
      ? { ...a, state: "declined" }
      : a,
  );
  return entry;
}
