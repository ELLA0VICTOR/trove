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
import { seededFamily } from "./helpers/family.ts";
const day = (ago: number) =>
  new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);

test("configured market outages never return example prices as connected data", async () => {
  const { store } = setup();
  const market = new MarketService(store, {
    histories: async () => {
      throw new Error("Provider unavailable");
    },
  });
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
    const { learner } = await seededFamily(store);
    const order = await app.request("/api/orders/preview", {
      method: "POST",
      headers: { ...headers, Cookie: `trove_session=${learner.token}` },
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

test("cached prices let app requests finish without waiting for an unrelated market-provider import", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    let imports = 0;
    const fast = new MarketService(store, {
      source: "alpaca-iex",
      refreshMs: 60000,
      histories: async () => {
        imports++;
        throw new Error("Provider is unavailable");
      },
    });
    const response = await createApp(store, { market: fast }).request(
      "/api/state",
    );
    assert.equal(response.status, 200);
    assert.equal(imports, 0);
    assert.equal((await response.json()).instruments.length, 12);
  } finally {
    await store.db.close();
  }
});
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
test("new price snapshots revalue a wallet-backed portfolio and its API chart in both directions without changing shares or cash", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    const { family, learner } = await seededFamily(store);
    const initial = await market.enroll(family, true, true);
    initial.cash = "897000000";
    initial.holdings = [
      { symbol: "AAPL", units: "100000000", cost: "103000000" },
    ];
    initial.portfolio!.startedAt = new Date(Date.now() - 3600000).toISOString();
    await store.set(initial);
    await store.db
      .prepare("INSERT INTO chain_accounts VALUES(?,?,?)")
      .run(family, "0x" + "1".repeat(64), "test-fixture");
    const app = createApp(store, { market });
    const base = await market.dataset(initial.portfolio!.datasetId);
    for (const [index, price, expected] of [
      [1, 113, 1010],
      [2, 93, 990],
    ] as const) {
      const next = structuredClone(base);
      next.id = randomUUID();
      next.receivedAt = new Date(Date.now() + index * 1000).toISOString();
      next.instruments.find((i) => i.symbol === "AAPL")!.prices.at(-1)!.price =
        String(price * 1000000);
      await store.db
        .prepare("INSERT INTO market_snapshots VALUES(?,?,?,?)")
        .run(next.id, next.asOf, next.receivedAt, JSON.stringify(next));
      const response = await app.request("/api/state", {
        headers: { Cookie: `trove_session=${learner.token}` },
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.portfolio.datasetId, next.id);
      assert.equal(result.portfolioObservations.at(-1).value, expected);
      assert.equal(result.portfolioObservations.at(-1).capital, 1000);
      assert.equal(result.portfolioHistory.at(-1).value, expected);
      assert.equal(result.cash, initial.cash);
      assert.deepEqual(result.holdings, initial.holdings);
      assert.equal(result.sequence, initial.sequence);
    }
  } finally {
    await store.db.close();
  }
});

test("first-day observations begin at the opening balance, keep price changes, and separate added capital", async () => {
  const { store, market } = setup();
  try {
    await market.refresh();
    const state = await market.enroll(randomUUID(), true);
    state.portfolio!.startedAt = new Date(Date.now() - 3600000).toISOString();
    const now = Date.now();
    const initial = await market.observations(state, now);
    assert.equal(initial!.length, 2);
    assert.equal(initial![0].value, 1000);
    assert.equal(initial!.at(-1)!.value, 1000);
    const count = () =>
      store.db
        .prepare("SELECT COUNT(*) AS n FROM portfolio_observations")
        .get();
    const before = (await count())!.n;
    await market.observations(state, now + 30000);
    assert.equal((await count())!.n, before);
    state.holdings = [
      { symbol: "AAPL", units: "100000000", cost: "103000000" },
    ];
    state.cash = "897000000";
    state.sequence++;
    await market.observations(state, now + 60000);
    const data = await market.dataset(state.portfolio!.datasetId);
    const changed = structuredClone(data);
    changed.id = randomUUID();
    changed.receivedAt = new Date(now + 120000).toISOString();
    changed.instruments.find((i) => i.symbol === "AAPL")!.prices.at(-1)!.price =
      "113000000";
    await store.db
      .prepare("INSERT INTO market_snapshots VALUES(?,?,?,?)")
      .run(
        changed.id,
        changed.asOf,
        changed.receivedAt,
        JSON.stringify(changed),
      );
    state.portfolio!.datasetId = changed.id;
    const gained = await market.observations(state, now + 120000);
    assert.equal(gained!.at(-1)!.value, 1010);
    assert.equal(gained!.at(-1)!.capital, 1000);
    state.cash = String(BigInt(state.cash) + 500000000n);
    state.funding = [
      {
        id: randomUUID(),
        portfolioId: state.portfolio!.id,
        amount: "500000000",
        recordedAt: new Date(now + 150000).toISOString(),
      },
    ];
    state.sequence++;
    const funded = await new MarketService(store).observations(
      state,
      now + 180000,
    );
    assert.equal(funded!.at(-1)!.value, 1510);
    assert.equal(funded!.at(-1)!.capital, 1500);
    assert.equal(funded![0].value, 1000);
    assert.equal(
      funded!.at(-1)!.value -
        funded![0].value -
        (funded!.at(-1)!.capital - funded![0].capital),
      10,
    );
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
    assert.equal(state.cash, "0");
    assert.deepEqual(state.holdings, []);
    assert.equal(state.decisions.length, 0);
    assert.equal((await store.get(family)).decisions[0].reason, q.reason);
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
    const { learner } = await seededFamily(store);
    const quoted = await app.request("/api/orders/preview", {
      method: "POST",
      headers: {
        Cookie: `trove_session=${learner.token}`,
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
    assert.equal(direct.status, 403);
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
