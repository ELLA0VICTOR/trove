import type { AppSnapshot } from "../../shared/model.ts";
/** Display sub-cent rounding residue as zero; ledger values retain full precision. */
export const displayedReturn = (value: bigint) =>
  value > -5000n && value < 5000n ? 0n : value;
export const priceLabel = (market: AppSnapshot["market"]) =>
  market?.quoteMode === "intraday"
    ? "IEX price"
    : market?.mode === "market"
      ? "Daily close"
      : "Sample price";
export const priceTime = (value: string) =>
  value.includes("T")
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : value;
