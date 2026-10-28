import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AlpacaGateway } from "../server/integrations/alpaca.ts";
import { MarketService, corporateActions } from "../server/market.ts";
import { DemoStore } from "../server/store.ts";
import { preview } from "../server/domain.ts";
import { instruments } from "../shared/fixtures.ts";
import type { MarketGateway } from "../server/integrations/market-data.ts";
const day = (ago: number) =>
  new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
function fixture(
  options: {
    missing?: boolean;
    future?: boolean;
    actions?: Record<string, unknown[]>;
    status?: number;
  } = {},
) {
  const paths: string[] = [];
  const http: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(init?.method, undefined);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("APCA-API-KEY-ID"), "test-key");
    assert.equal(headers.get("APCA-API-SECRET-KEY"), "test-secret");
    assert.equal(url.searchParams.has("access_key"), false);
    if (options.status)
      return Response.json(
        { error: "sensitive provider detail" },
        { status: options.status },
      );
    if (url.pathname === "/v2/clock")
      return Response.json({
        is_open: false,
        timestamp: new Date().toISOString(),
        next_open: new Date(Date.now() + 86400000).toISOString(),
        next_close: new Date(Date.now() + 2 * 86400000).toISOString(),
      });
    if (url.pathname === "/v2/stocks/snapshots") {
      assert.equal(url.searchParams.get("feed"), "iex");
      return Response.json(
        options.missing
          ? {}
          : {
              AAPL: {
                latestTrade: {
                  t: options.future
                    ? new Date(Date.now() + 3600000).toISOString()
                    : day(1) + "T19:59:00Z",
                  p: 105,
                },
              },
            },
      );
    }
    if (url.pathname === "/v1/corporate-actions")
      return Response.json({
        corporate_actions: options.actions ?? {},
        next_page_token: null,
      });
    assert.equal(url.pathname, "/v2/stocks/bars");
    assert.equal(url.searchParams.get("feed"), "iex");
    const adjusted = url.searchParams.get("adjustment") === "all";
    return Response.json({
      bars: {
        AAPL: [3, 2, 1].map((ago) => ({
          t: day(ago) + "T04:00:00Z",
          o: 100,
          h: 120,
          l: 40,
          c: adjusted ? 50 : 100,
        })),
      },
      next_page_token: null,
    });
  };
  return { gateway: new AlpacaGateway("test-key", "test-secret", http), paths };
}
test("IEX history retains real latest-trade timestamps, adjusted comparisons, splits, and dividends", async () => {
  const { gateway, paths } = fixture({
    actions: {
      forward_splits: [
        {
          symbol: "AAPL",
          process_date: day(1),
          ex_date: day(1),
          new_rate: 2,
          old_rate: 1,
        },
      ],
      cash_dividends: [
        {
          symbol: "AAPL",
          process_date: day(1),
          ex_date: day(1),
          rate: 0.25,
          foreign: false,
        },
        {
          symbol: "AAPL",
          process_date: day(1),
          ex_date: day(100),
          rate: 0.2,
          foreign: false,
        },
      ],
    },
  });
  const [result] = await gateway.histories(["AAPL"], day(90), day(0));
  assert.equal(result.prices.at(-1)!.price, "105000000");
  assert.equal(result.prices[0].adjustedPrice, "50000000");
  assert.equal(result.prices.at(-1)!.sourceTimestamp, day(1) + "T19:59:00Z");
  const actions = corporateActions([
    { ...instruments[0], prices: result.prices },
  ]);
  assert.deepEqual(
    actions.map((a) => a.kind),
    ["split", "dividend"],
  );
  assert.equal(actions[0].numerator, "2");
  assert.equal(actions[1].dividend, "250000");
  assert.equal(paths.length, 5);
  assert.ok(
    paths.every((p) => !p.includes("orders") && !p.includes("funding")),
  );
});
test("missing and future prices fail closed, and provider errors do not reveal credentials or raw messages", async () => {
  for (const options of [{ missing: true }, { future: true }])
    await assert.rejects(
      () => fixture(options).gateway.histories(["AAPL"], day(90), day(0)),
      /invalid or missing/,
    );
  await assert.rejects(
    () => fixture({ status: 401 }).gateway.histories(["AAPL"], day(90), day(0)),
    (error) => {
      const text = String(error);
      assert.match(text, /401/);
      assert.ok(
        !text.includes("test-secret") &&
          !text.includes("sensitive provider detail"),
      );
      return true;
    },
  );
});
test("unsupported corporate events are carried forward for affected portfolios to pause", async () => {
  const [result] = await fixture({
    actions: {
      spin_offs: [
        { source_symbol: "AAPL", process_date: day(1), ex_date: day(1) },
      ],
    },
  }).gateway.histories(["AAPL"], day(90), day(0));
  assert.deepEqual(result.unsupportedActions, [
    { symbol: "AAPL", date: day(1) },
  ]);
});

test("one-minute imports are shared across processes, bypass the old cache, and keep reviewed quotes stable", async () => {
  const store = new DemoStore(":memory:");
  let calls = 0,
    price = "100000000";
  const gateway: MarketGateway = {
    source: "alpaca-iex",
    refreshMs: 60000,
    histories: async () => {
      calls++;
      return instruments.map((i) => ({
        symbol: i.symbol,
        provider: "Alpaca IEX",
        basis: "raw-price",
        receivedAt: new Date().toISOString(),
        quoteAt: day(1) + "T19:59:00Z",
        marketOpen: false,
        nextOpen: new Date(Date.now() + 86400000).toISOString(),
        nextClose: new Date(Date.now() + 2 * 86400000).toISOString(),
        prices: [
          { date: day(2), price: "100000000" },
          { date: day(1), price, sourceTimestamp: day(1) + "T19:59:00Z" },
        ],
      }));
    },
  };
  try {
    await store.db
      .prepare("INSERT INTO market_refresh VALUES(1,?,'ready')")
      .run(Date.now() + 96 * 3600000);
    const market = new MarketService(store, gateway);
    await market.refresh();
    await new MarketService(store, gateway).refresh();
    assert.equal(calls, 1);
    const state = await market.enroll(randomUUID(), true, true);
    const status = await market.status(state);
    assert.equal(status.provider, "Alpaca IEX");
    assert.equal(status.quoteMode, "intraday");
    const quote = preview(
      state,
      {
        symbol: "AAPL",
        side: "buy",
        amount: "25",
        reason: "Compare companies",
      },
      await market.instruments(state),
    );
    await store.putQuote(state.id, quote);
    price = "110000000";
    await store.db
      .prepare("UPDATE market_provider_refresh SET next_at=0")
      .run();
    await market.refresh();
    assert.equal(calls, 2);
    assert.equal(
      (await market.advance(state.id)).portfolio!.datasetId,
      state.portfolio!.datasetId,
    );
    quote.expiresAt = Date.now() - 1;
    await store.db
      .prepare("UPDATE quotes SET payload=? WHERE id=?")
      .run(JSON.stringify(quote), quote.id);
    assert.notEqual(
      (await market.advance(state.id)).portfolio!.datasetId,
      state.portfolio!.datasetId,
    );
    await store.db
      .prepare("UPDATE market_provider_refresh SET status='failed'")
      .run();
    assert.equal((await market.status(await store.get(state.id))).stale, true);
  } finally {
    await store.db.close();
  }
});
