import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DemoStore } from "../server/store.ts";
import {
  MarketService,
  accountHistory,
  marketStale,
} from "../server/market.ts";
import { MarketstackGateway } from "../server/integrations/marketstack.ts";
import { instruments } from "../shared/fixtures.ts";
import { execute, preview } from "../server/domain.ts";
import { portfolioValue } from "../shared/model.ts";
import { createApp } from "../server/app.ts";
const day = (ago: number) =>
  new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);

test("configured market outages never return example prices as connected data", async () => {
  const { store, market } = setup();
  try {
    const response = await createApp(store, { market }).request("/api/state");
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.match(result.error, /Market prices are temporarily unavailable/);
    assert.equal(result.instruments, undefined);
  } finally {
    await store.db.close();
  }
});

test("stale cached prices remain visible while new practice orders are refused", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    const dataset = (await market.latest())!;
    dataset.asOf = day(10);
    await store.db
      .prepare("UPDATE market_snapshots SET as_of=?,payload=? WHERE id=?")
      .run(dataset.asOf, JSON.stringify(dataset), dataset.id);
    const family = randomUUID(),
      app = createApp(store, { market });
    const headers = {
      Cookie: `trove_demo=${family}`,
      "Content-Type": "application/json",
    };
    const response = await app.request("/api/state", { headers });
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.equal(state.market.mode, "market");
    assert.equal(state.market.stale, true);
    assert.equal(state.instruments[0].prices.at(-1).price, "103000000");
    const order = await app.request("/api/orders/preview", {
      method: "POST",
      headers,
      body: JSON.stringify({
        symbol: "AAPL",
        side: "buy",
        amount: "25",
        reason: "Wait for a fresh close",
      }),
    });
    assert.equal(order.status, 409);
    assert.match((await order.json()).error, /stale/);
  } finally {
    await store.db.close();
  }
});
function setup() {
  const store = new DemoStore(":memory:");
  let calls = 0;
  const gateway = {
    histories: async () => {
      calls++;
      return instruments.map((i) => ({
        symbol: i.symbol,
        provider: "Marketstack",
        basis: "raw-close",
        receivedAt: new Date().toISOString(),
        excluded: 0,
        prices: [3, 2, 1, 0].map((n) => ({
          date: day(n),
          price: String((100 + 3 - n) * 1000000),
          adjustedPrice: String((100 + 3 - n) * 1000000),
          sourceTimestamp: day(n),
          splitFactor: 1,
          dividend: 0,
        })),
      }));
    },
  };
  return {
    store,
    market: new MarketService(store, gateway),
    calls: () => calls,
  };
}
test("market adapter excludes foreign/unknown currencies and rejects conflicting USD observations", async () => {
  const bar = (date: string, currency: string | null = "USD") => ({
    symbol: "AAPL",
    date,
    open: 99,
    high: 102,
    low: 98,
    close: 100,
    adj_close: 100,
    price_currency: currency,
    exchange: "XNAS",
  });
  const data = [
    bar("2026-10-20"),
    bar("2026-10-21", "MXN"),
    bar("2026-10-22", null),
    bar("2026-10-23"),
  ];
  const http: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        pagination: { total: data.length, count: data.length },
        data,
      }),
    );
  const history = await new MarketstackGateway("test", http).history(
    "AAPL",
    "2026-10-01",
    "2026-10-26",
  );
  assert.equal(history.excluded, 2);
  assert.deepEqual(
    history.prices.map((p) => p.date),
    ["2026-10-20", "2026-10-23"],
  );
  data.push(bar("2026-10-23"));
  await assert.rejects(
    () =>
      new MarketstackGateway("test", http).history(
        "AAPL",
        "2026-10-01",
        "2026-10-26",
      ),
    /consistency/,
  );
  data.pop();
  data.push(bar("2026-02-31"));
  await assert.rejects(
    () =>
      new MarketstackGateway("test", http).history(
        "AAPL",
        "2026-10-01",
        "2026-10-26",
      ),
    /consistency/,
  );
});
test("one persisted market import is shared across callers and archived sample trades are not repriced", async () => {
  const { store, market, calls } = setup();
  try {
    await Promise.all([market.refresh(), market.refresh()]);
    await market.refresh();
    assert.equal(calls(), 1);
    const family = randomUUID(),
      original = await store.get(family),
      originalDecision = original.decisions[0];
    assert.equal((await market.enroll(family)).portfolio, undefined);
    const upgraded = await market.enroll(family, true);
    assert.equal(upgraded.cash, "1000000000");
    assert.equal(upgraded.holdings.length, 0);
    assert.deepEqual(upgraded.decisions[0], originalDecision);
    assert.equal(
      (
        (await store.db
          .prepare("SELECT COUNT(*) AS n FROM portfolio_archives")
          .get()) as {
          n: number;
        }
      ).n,
      1,
    );
    assert.equal((await market.status(upgraded)).mode, "market");
    assert.equal((await market.instruments(upgraded))[0].prices.length, 4);
  } finally {
    await store.db.close();
  }
});
test("reviewed real-price orders bind the snapshot and account history uses actual decisions", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    const family = randomUUID(),
      state = await market.enroll(family, true);
    const q = preview(
      state,
      {
        symbol: "AAPL",
        side: "buy",
        amount: "50",
        reason: "Practice with a dated close.",
      },
      await market.instruments(state),
    );
    assert.equal(q.price, "103000000");
    assert.equal(q.datasetId, state.portfolio!.datasetId);
    await store.putQuote(family, q);
    const after = await execute(store, family, q.id);
    assert.equal(after.decisions[0].portfolioId, state.portfolio!.id);
    const series = accountHistory(after, await market.instruments(after))!;
    assert.equal(series.length, 1);
    assert.equal(
      series[0].value,
      Number(portfolioValue(after, await market.instruments(after))) / 1000000,
    );
    const changed = await store.get(family);
    changed.portfolio!.datasetId = "other";
    await store.set(changed);
    const second = preview(
      after,
      { symbol: "KO", side: "buy", amount: "20", reason: "" },
      await market.instruments(after),
    );
    await store.putQuote(family, second);
    await assert.rejects(
      async () => await execute(store, family, second.id),
      /changed/,
    );
  } finally {
    await store.db.close();
  }
});
test("stale prices stop execution even when a previously reviewed quote has not expired", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    const family = randomUUID(),
      state = await market.enroll(family, true),
      q = preview(
        state,
        { symbol: "KO", side: "buy", amount: "20", reason: "" },
        await market.instruments(state),
      );
    q.marketDate = day(10);
    await store.putQuote(family, q);
    await assert.rejects(
      async () => await execute(store, family, q.id),
      /stale/,
    );
    assert.equal(marketStale(day(10)), true);
    assert.equal(marketStale(day(1)), false);
  } finally {
    await store.db.close();
  }
});
test("connected guest entry uses real-price snapshots without sign-in and archives the old sample basis", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    const family = randomUUID(),
      before = await store.get(family);
    const q = preview(before, {
      symbol: "AAPL",
      side: "buy",
      amount: "25",
      reason: "My original thought stays saved.",
    });
    await store.putQuote(family, q);
    const prior = await execute(store, family, q.id);
    const app = await createApp(store, { market });
    const response = await app.request("/api/state", {
        headers: { Cookie: `trove_demo=${family}` },
      }),
      state = await response.json();
    assert.equal(response.status, 200);
    assert.equal(state.session.mode, "sample");
    assert.equal(state.market.mode, "market");
    assert.equal(state.instruments[0].prices.at(-1).price, "103000000");
    assert.equal(state.cash, "1000000000");
    assert.deepEqual(state.holdings, []);
    assert.equal(state.decisions.length, 1);
    assert.equal(state.decisions[0].reason, q.reason);
    assert.ok(
      state.memories.every((m: { origin: string }) => m.origin !== "sample"),
    );
    const archive = JSON.parse(
      (
        (await store.db
          .prepare("SELECT payload FROM portfolio_archives WHERE family=?")
          .get(family)) as {
          payload: string;
        }
      ).payload,
    );
    assert.equal(archive.cash, prior.cash);
    assert.deepEqual(archive.holdings, prior.holdings);
    const quoted = await app.request("/api/orders/preview", {
      method: "POST",
      headers: {
        Cookie: `trove_demo=${family}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "AAPL",
        side: "buy",
        amount: "25",
        reason: "Real dated observation",
      }),
    });
    assert.equal(quoted.status, 200);
    assert.equal((await quoted.json()).price, "103000000");
    const fresh = await (await app.request("/api/state")).json();
    assert.equal(fresh.market.mode, "market");
    assert.equal(fresh.decisions.length, 0);
    assert.equal(fresh.memories.length, 0);
    const direct = await app.request("/api/orders/preview", {
      method: "POST",
      headers: {
        Cookie: `trove_demo=${randomUUID()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: "AAPL",
        side: "buy",
        amount: "25",
        reason: "A direct first request",
      }),
    });
    assert.equal(direct.status, 200);
    assert.equal((await direct.json()).price, "103000000");
    assert.equal(
      (await store.db
        .prepare("SELECT COUNT(*) AS n FROM portfolio_archives WHERE family=?")
        .get(family))!.n,
      1,
    );
  } finally {
    await store.db.close();
  }
});
