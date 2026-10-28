import type { AppSnapshot } from "../../shared/model.ts";
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
