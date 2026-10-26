import { z } from "zod";
const bar = z.object({
  symbol: z.string(),
  date: z.string(),
  close: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  open: z.number().positive(),
  price_currency: z.string().nullish(),
  split_factor: z.number().nullish(),
  dividend: z.number().nullish(),
});
const pageSchema = z.object({
  pagination: z.object({
    total: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
  }),
  data: z.array(bar),
});
export class MarketstackGateway {
  private readonly http: typeof fetch;
  constructor(privateKey: string, http: typeof fetch = fetch) {
    this.http = http;
    this.key = privateKey;
    if (!privateKey.trim())
      throw new Error("A market-data API key is required.");
  }
  private key: string;
  async history(symbol: string, from: string, to: string) {
    if (
      !/^[A-Z.]{1,8}$/.test(symbol) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from >= to
    )
      throw new Error("Invalid history request.");
    const bars: z.infer<typeof bar>[] = [],
      receivedAt = new Date().toISOString();
    for (let offset = 0; offset < 10_000; offset += 1000) {
      const url = new URL("https://api.marketstack.com/v2/eod");
      for (const [key, value] of Object.entries({
        access_key: this.key,
        symbols: symbol,
        date_from: from,
        date_to: to,
        sort: "ASC",
        limit: "1000",
        offset: String(offset),
      }))
        url.searchParams.set(key, value);
      // Do not log URLs: this provider authenticates with a query parameter.
      const response = await this.http(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error(`Market-data request failed (${response.status}).`);
      const parsed = pageSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error(
          "Market data is incomplete, unsupported by this plan, or invalid.",
        );
      bars.push(...parsed.data.data);
      if (offset + parsed.data.pagination.count >= parsed.data.pagination.total)
        break;
      if (!parsed.data.pagination.count)
        throw new Error("Market-data pagination did not make progress.");
      if (offset === 9000)
        throw new Error("This history exceeds the bounded import size.");
    }
    const dates = new Set<string>();
    const prices = bars
      .map((point) => {
        const date = point.date.slice(0, 10);
        if (
          point.symbol !== symbol ||
          dates.has(date) ||
          (point.price_currency && point.price_currency !== "USD") ||
          point.high < point.low ||
          point.close > point.high ||
          point.close < point.low
        )
          throw new Error("Market data failed consistency checks.");
        dates.add(date);
        return {
          date,
          price: String(BigInt(Math.round(point.close * 1_000_000))),
          sourceTimestamp: point.date,
          splitFactor: point.split_factor ?? null,
          dividend: point.dividend ?? null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    if (prices.length < 2)
      throw new Error("There is insufficient history for a comparison.");
    return {
      symbol,
      provider: "Marketstack",
      basis: "raw-close",
      receivedAt,
      prices,
    };
  }
}
