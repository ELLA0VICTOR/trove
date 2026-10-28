import { z } from "zod";
import { decimalMicro, decimalRatio } from "../../shared/corporate-actions.ts";
import type { MarketGateway, MarketHistory } from "./market-data.ts";

const timestamp = z
  .string()
  .refine((v) => Number.isFinite(Date.parse(v)), "Invalid price time");
const bar = z.object({
  t: timestamp,
  o: z.number().positive(),
  h: z.number().positive(),
  l: z.number().positive(),
  c: z.number().positive(),
});
const page = z.object({
  bars: z.record(z.string(), z.array(bar)),
  next_page_token: z.string().nullish(),
});
const snapshots = z.record(
  z.string(),
  z.object({
    latestTrade: z.object({ t: timestamp, p: z.number().positive() }),
  }),
);
const action = z.object({
  symbol: z.string(),
  process_date: z.string(),
  ex_date: z.string(),
  new_rate: z.number().positive().optional(),
  old_rate: z.number().positive().optional(),
  rate: z.number().positive().optional(),
  foreign: z.boolean().optional(),
});
const actionsPage = z.object({
  corporate_actions: z.record(z.string(), z.array(z.unknown())),
  next_page_token: z.string().nullish(),
});
const clockSchema = z.object({
  is_open: z.boolean(),
  timestamp,
  next_open: timestamp,
  next_close: timestamp,
});
const tradingDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
function micro(value: number) {
  const n = Math.round(value * 1000000);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new Error("Alpaca price precision is unsupported.");
  return String(n);
}

/** Data-only adapter. No order, account-funding, or brokerage endpoints are exposed. */
export class AlpacaGateway implements MarketGateway {
  readonly source = "alpaca-iex";
  readonly refreshMs = 60000;
  private readonly key: string;
  private readonly secret: string;
  private readonly http: typeof fetch;
  constructor(key: string, secret: string, http: typeof fetch = fetch) {
    if (!key.trim() || !secret.trim())
      throw new Error("Both Alpaca server-side keys are required.");
    this.key = key;
    this.secret = secret;
    this.http = http;
  }
  private async get(
    path: string,
    query: Record<string, string>,
    clock = false,
  ): Promise<unknown> {
    const url = new URL(
      path,
      clock
        ? "https://paper-api.alpaca.markets"
        : "https://data.alpaca.markets",
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await this.http(url, {
      headers: {
        "APCA-API-KEY-ID": this.key,
        "APCA-API-SECRET-KEY": this.secret,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Alpaca market-data request failed (${response.status}).`,
      );
    return response.json();
  }
  private async bars(
    symbols: string[],
    from: string,
    to: string,
    adjustment: string,
  ) {
    const result = new Map<string, z.infer<typeof bar>[]>();
    let token: string | undefined;
    for (let i = 0; i < 8; i++) {
      const data = page.parse(
        await this.get("/v2/stocks/bars", {
          symbols: symbols.join(","),
          timeframe: "1Day",
          start: from + "T00:00:00Z",
          end: new Date(
            Math.min(Date.parse(to + "T23:59:59Z"), Date.now()),
          ).toISOString(),
          feed: "iex",
          adjustment,
          sort: "asc",
          limit: "10000",
          ...(token ? { page_token: token } : {}),
        }),
      );
      for (const [symbol, values] of Object.entries(data.bars)) {
        if (!symbols.includes(symbol))
          throw new Error("Alpaca returned an unexpected symbol.");
        result.set(symbol, [...(result.get(symbol) ?? []), ...values]);
      }
      if (!data.next_page_token) return result;
      if (data.next_page_token === token)
        throw new Error("Alpaca pagination did not advance.");
      token = data.next_page_token;
    }
    throw new Error("Alpaca history exceeded the import limit.");
  }
  private async actions(symbols: string[], from: string, to: string) {
    const groups: Record<string, unknown[]> = {};
    let token: string | undefined;
    for (let i = 0; i < 8; i++) {
      const data = actionsPage.parse(
        await this.get("/v1/corporate-actions", {
          symbols: symbols.join(","),
          start: from,
          end: to,
          limit: "1000",
          sort: "asc",
          ...(token ? { page_token: token } : {}),
        }),
      );
      for (const [kind, values] of Object.entries(data.corporate_actions))
        groups[kind] = [...(groups[kind] ?? []), ...values];
      if (!data.next_page_token) return groups;
      if (data.next_page_token === token)
        throw new Error("Alpaca action pagination did not advance.");
      token = data.next_page_token;
    }
    throw new Error("Alpaca corporate actions exceeded the import limit.");
  }
  async histories(
    symbols: string[],
    from: string,
    to: string,
  ): Promise<MarketHistory[]> {
    if (
      !symbols.length ||
      symbols.length > 12 ||
      new Set(symbols).size !== symbols.length ||
      symbols.some((s) => !/^[A-Z.]{1,8}$/.test(s)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from >= to
    )
      throw new Error("Invalid Alpaca history request.");
    const receivedAt = new Date().toISOString();
    const [raw, adjusted, groups, latest, clock] = await Promise.all([
      this.bars(symbols, from, to, "raw"),
      this.bars(symbols, from, to, "all"),
      this.actions(symbols, from, to),
      this.get("/v2/stocks/snapshots", {
        symbols: symbols.join(","),
        feed: "iex",
      }).then((v) => snapshots.parse(v)),
      this.get("/v2/clock", {}, true).then((v) => clockSchema.parse(v)),
    ]);
    const unsupportedActions: { symbol: string; date: string }[] = [];
    for (const [kind, values] of Object.entries(groups))
      if (
        !["forward_splits", "reverse_splits", "cash_dividends"].includes(kind)
      ) {
        for (const v of values)
          if (typeof v === "object" && v !== null) {
            const r = v as Record<string, unknown>;
            const symbol = String(
              r.symbol ??
                r.source_symbol ??
                r.old_symbol ??
                r.acquiree_symbol ??
                "",
            );
            const date = String(
              r.ex_date ?? r.effective_date ?? r.process_date,
            );
            if (symbols.includes(symbol) && /^\d{4}-\d{2}-\d{2}$/.test(date))
              unsupportedActions.push({ symbol, date });
          }
      }
    return symbols.map((symbol) => {
      const tick = latest[symbol]?.latestTrade;
      if (
        !tick ||
        Date.parse(tick.t) > Date.now() + 60000 ||
        tradingDate(tick.t) < from ||
        tradingDate(tick.t) > to
      )
        throw new Error("Alpaca returned an invalid or missing latest price.");
      const rows = raw.get(symbol) ?? [],
        adj = adjusted.get(symbol) ?? [];
      const seen = new Set<string>();
      const prices = rows
        .map((row) => {
          const date = tradingDate(row.t);
          if (
            seen.has(date) ||
            date < from ||
            date > to ||
            row.h < row.l ||
            row.c < row.l ||
            row.c > row.h
          )
            throw new Error("Alpaca history failed consistency checks.");
          seen.add(date);
          const adjustedBar = adj.find((v) => tradingDate(v.t) === date);
          if (!adjustedBar)
            throw new Error("Alpaca adjusted history is incomplete.");
          return {
            date,
            price: micro(row.c),
            adjustedPrice: micro(adjustedBar.c),
            sourceTimestamp: row.t,
            splitFactor: 1,
            dividend: 0,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      const tickDate = tradingDate(tick.t),
        tickPrice = micro(tick.p);
      if (tickDate < (prices.at(-1)?.date ?? from))
        throw new Error("The latest Alpaca trade precedes its history.");
      const last = prices.find((v) => v.date === tickDate);
      if (last) {
        last.price = tickPrice;
        last.adjustedPrice = tickPrice;
        last.sourceTimestamp = tick.t;
      } else
        prices.push({
          date: tickDate,
          price: tickPrice,
          adjustedPrice: tickPrice,
          sourceTimestamp: tick.t,
          splitFactor: 1,
          dividend: 0,
        });
      for (const [kind, values] of Object.entries(groups)) {
        if (
          !["forward_splits", "reverse_splits", "cash_dividends"].includes(kind)
        )
          continue;
        for (const value of values) {
          const event = action.parse(value);
          if (
            event.symbol !== symbol ||
            event.ex_date < from ||
            event.ex_date > tickDate
          )
            continue;
          const point = prices.find((v) => v.date === event.ex_date);
          if (!point)
            throw new Error(
              `A corporate-action date is missing from ${symbol} history (${event.ex_date}).`,
            );
          if (kind === "cash_dividends") {
            if (!event.rate || event.foreign)
              throw new Error("Unsupported dividend currency or amount.");
            decimalMicro(event.rate);
            point.dividend =
              Number(
                BigInt(decimalMicro(point.dividend)) +
                  BigInt(decimalMicro(event.rate)),
              ) / 1000000;
          } else {
            if (!event.new_rate || !event.old_rate)
              throw new Error("An Alpaca split ratio is incomplete.");
            point.splitFactor *= event.new_rate / event.old_rate;
            decimalRatio(point.splitFactor);
          }
        }
      }
      if (prices.length < 2) throw new Error("Insufficient Alpaca history.");
      return {
        symbol,
        provider: "Alpaca IEX",
        basis: "raw-price",
        receivedAt,
        excluded: 0,
        prices,
        quoteAt: tick.t,
        marketOpen: clock.is_open,
        nextOpen: clock.next_open,
        nextClose: clock.next_close,
        unsupportedActions: unsupportedActions.filter(
          (a) => a.symbol === symbol,
        ),
      };
    });
  }
}
