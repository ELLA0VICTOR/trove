import { InputError, parseDollars, USD_SCALE } from "./model.ts";
import type { DemoState } from "./model.ts";

export const STARTING_CAPITAL = 1000n * USD_SCALE;
export const MAX_PRACTICE_CAPITAL = 1_000_000_000n * USD_SCALE;
export function fundingAmount(input: string) {
  const amount = parseDollars(input);
  if (amount < 10000n || amount > 1_000_000n * USD_SCALE)
    throw new InputError("Add between $0.01 and $1,000,000 in practice funds.");
  return amount;
}
export function practiceCapital(state: DemoState) {
  return (
    BigInt(state.portfolio?.initialCash ?? STARTING_CAPITAL) +
    (state.funding ?? [])
      .filter(
        (entry) => entry.portfolioId === (state.portfolio?.id ?? state.id),
      )
      .reduce((sum, entry) => sum + BigInt(entry.amount), 0n)
  );
}
export function applyFunding(
  state: DemoState,
  input: {
    id: string;
    amount: string;
    recordedAt: string;
    transactionDigest?: string;
  },
) {
  const existing = state.funding?.find((entry) => entry.id === input.id);
  if (existing) {
    if (existing.amount !== input.amount)
      throw new InputError(
        "This funding request was already used for a different amount.",
      );
    return false;
  }
  const amount = BigInt(input.amount);
  if (amount < 10000n || amount > 1_000_000n * USD_SCALE)
    throw new InputError("Invalid practice funding amount.");
  if (
    practiceCapital(state) + amount > MAX_PRACTICE_CAPITAL ||
    BigInt(state.cash) + amount > MAX_PRACTICE_CAPITAL
  )
    throw new InputError("The practice capital limit is $1,000,000,000.");
  state.cash = String(BigInt(state.cash) + amount);
  state.funding = [
    { ...input, portfolioId: state.portfolio?.id ?? state.id },
    ...(state.funding ?? []),
  ];
  state.sequence++;
  state.approvals = state.approvals.map((approval) =>
    approval.state === "requested" || approval.state === "approved"
      ? { ...approval, state: "declined" }
      : approval,
  );
  return true;
}
