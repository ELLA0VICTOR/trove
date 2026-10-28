import type { Instrument } from "../../shared/model.ts";
export interface MarketHistory {
  symbol: string;
  provider: string;
  basis: string;
  receivedAt: string;
  excluded?: number;
  prices: Instrument["prices"];
  quoteAt?: string;
  marketOpen?: boolean;
  nextOpen?: string;
  nextClose?: string;
  unsupportedActions?: { symbol: string; date: string }[];
}
export interface MarketGateway {
  source?: string;
  refreshMs?: number;
  histories(
    symbols: string[],
    from: string,
    to: string,
  ): Promise<MarketHistory[]>;
}
