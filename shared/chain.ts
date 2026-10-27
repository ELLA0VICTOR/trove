import { bcs } from "@mysten/sui/bcs";
export const ClockBcs = bcs.struct("Clock", {
  id: bcs.Address,
  timestamp_ms: bcs.u64(),
});
export const QuoteBcs = bcs.struct("Quote", {
  domain: bcs.vector(bcs.u8()),
  package_id: bcs.Address,
  account: bcs.Address,
  symbol: bcs.vector(bcs.u8()),
  buy: bcs.bool(),
  requested: bcs.u64(),
  amount: bcs.u64(),
  units: bcs.u64(),
  price: bcs.u64(),
  expires_at: bcs.u64(),
  revision: bcs.u64(),
  sequence: bcs.u64(),
  market_day: bcs.u64(),
  snapshot: bcs.vector(bcs.u8()),
  commitment: bcs.vector(bcs.u8()),
  nonce: bcs.vector(bcs.u8()),
});
export const CreatedBcs = bcs.struct("Created", {
  account: bcs.Address,
  guardian: bcs.Address,
  learner: bcs.Address,
});
export const FundedBcs = bcs.struct("Funded", {
  account: bcs.Address,
  id: bcs.vector(bcs.u8()),
  amount: bcs.u64(),
  cash: bcs.u64(),
  sequence: bcs.u64(),
});
export const CorporateTermsBcs = bcs.struct("CorporateTerms", {
  domain: bcs.vector(bcs.u8()),
  package_id: bcs.Address,
  account: bcs.Address,
  event_id: bcs.vector(bcs.u8()),
  symbol: bcs.vector(bcs.u8()),
  kind: bcs.u8(),
  effective_day: bcs.u64(),
  numerator: bcs.u64(),
  denominator: bcs.u64(),
  dividend: bcs.u64(),
  price: bcs.u64(),
  units_before: bcs.u64(),
  sequence: bcs.u64(),
  revision: bcs.u64(),
  from_snapshot: bcs.vector(bcs.u8()),
  to_snapshot: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
});
export const CorporateAppliedBcs = bcs.struct("CorporateApplied", {
  account: bcs.Address,
  event_id: bcs.vector(bcs.u8()),
  symbol: bcs.vector(bcs.u8()),
  kind: bcs.u8(),
  effective_day: bcs.u64(),
  units_before: bcs.u64(),
  units_after: bcs.u64(),
  cash_delta: bcs.u64(),
  cost_released: bcs.u64(),
  sequence: bcs.u64(),
  from_snapshot: bcs.vector(bcs.u8()),
  to_snapshot: bcs.vector(bcs.u8()),
});
export const ExecutedBcs = bcs.struct("Executed", {
  account: bcs.Address,
  nonce: bcs.vector(bcs.u8()),
  symbol: bcs.vector(bcs.u8()),
  buy: bcs.bool(),
  amount: bcs.u64(),
  units: bcs.u64(),
  price: bcs.u64(),
  sequence: bcs.u64(),
  revision: bcs.u64(),
  cash: bcs.u64(),
  day_spent: bcs.u64(),
  spend_day: bcs.u64(),
  commitment: bcs.vector(bcs.u8()),
  snapshot: bcs.vector(bcs.u8()),
});
export const AccountBcs = bcs.struct("Account", {
  id: bcs.Address,
  guardian: bcs.Address,
  learner: bcs.Address,
  attestor: bcs.vector(bcs.u8()),
  cash: bcs.u64(),
  positions: bcs.vector(
    bcs.struct("Position", {
      symbol: bcs.vector(bcs.u8()),
      units: bcs.u64(),
      cost: bcs.u64(),
    }),
  ),
  per_trade: bcs.u64(),
  daily: bcs.u64(),
  paused: bcs.bool(),
  allowed: bcs.vector(bcs.vector(bcs.u8())),
  revision: bcs.u64(),
  sequence: bcs.u64(),
  day_spent: bcs.u64(),
  spend_day: bcs.u64(),
  approval: bcs.vector(bcs.u8()),
});
export type ChainStatus = {
  ready: boolean;
  fundingReady?: boolean;
  network: "testnet";
  account?: string;
  wallet?: string;
  guardian?: string;
  learner?: string;
  pending?: { id: string; state: string; digest: string }[];
};
