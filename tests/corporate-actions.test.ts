import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { decimalMicro, decimalRatio, adjustmentAmounts, applyAdjustment, } from "../shared/corporate-actions.ts";
import type { CorporateAction, DemoState } from "../shared/model.ts";
import { portfolioValue } from "../shared/model.ts";
import { seedState, instruments } from "../shared/fixtures.ts";
import { MarketService, corporateActions, accountHistory, } from "../server/market.ts";
import { preview } from "../server/domain.ts";
import type { Dataset } from "../server/market.ts";
import { DemoStore } from "../server/store.ts";
const action = (kind: CorporateAction["kind"], change: Partial<CorporateAction> = {}): CorporateAction => ({
    id: kind.padEnd(64, "0"),
    symbol: "AAPL",
    kind,
    date: "2026-10-20",
    numerator: kind === "split" ? "2" : "1",
    denominator: "1",
    dividend: kind === "dividend" ? "1000000" : "0",
    price: "50000000",
    ...change,
});
function account(): DemoState {
    const state = seedState(randomUUID());
    state.portfolio = {
        id: randomUUID(),
        startedAt: "2026-10-19T12:00:00Z",
        initialCash: "1000000000",
        datasetId: "old",
    };
    state.cash = "975000000";
    state.holdings = [{ symbol: "AAPL", units: "25000000", cost: "25000000" }];
    state.sequence = 0;
    state.daySpent = "25000000";
    return state;
}
test("provider decimal factors normalize to exact integer ratios, including recurring reverse splits", () => {
    assert.deepEqual(decimalRatio(2), { numerator: "2", denominator: "1" });
    assert.deepEqual(decimalRatio(0.5), { numerator: "1", denominator: "2" });
    assert.deepEqual(decimalRatio(1 / 3), { numerator: "1", denominator: "3" });
    assert.equal(decimalMicro(0.2275), "227500");
    for (const n of [0, -1, Infinity, NaN])
        assert.throws(() => decimalRatio(n));
    assert.throws(() => decimalMicro(-1));
});
test("forward and reverse splits preserve cost basis and explicitly settle share-precision remainders", () => {
    const holding = account().holdings[0];
    assert.deepEqual(adjustmentAmounts(holding, action("split")), {
        units: 50000000n,
        cashDelta: 0n,
        costReleased: 0n,
    });
    const reverse = adjustmentAmounts(holding, action("split", { numerator: "1", denominator: "3", price: "300000000" }));
    assert.deepEqual(reverse, {
        units: 8333333n,
        cashDelta: 1n,
        costReleased: 1n,
    });
    assert.equal(975000000n + reverse.cashDelta + (reverse.units * 300000000n) / 100000000n, 1000000000n);
});
test("dividends credit fractional holdings exactly once without changing basis or daily permission", () => {
    const state = account(), policy = JSON.stringify(state.policy), spent = state.daySpent, cost = state.holdings[0].cost;
    const dividend = action("dividend");
    const entry = applyAdjustment(state, dividend, "old", "new")!;
    assert.equal(entry.cashDelta, "250000");
    assert.equal(state.cash, "975250000");
    assert.equal(state.holdings[0].cost, cost);
    assert.equal(state.daySpent, spent);
    assert.equal(JSON.stringify(state.policy), policy);
    assert.equal(applyAdjustment(state, dividend, "old", "new"), undefined);
    assert.equal(state.cash, "975250000");
    state.holdings = [];
    assert.equal(applyAdjustment(state, action("dividend", { id: "absent" }), "old", "new"), undefined);
});
test("same-day splits precede dividends and raw corporate dates survive chart-calendar alignment", () => {
    const raw = instruments.map((i) => ({
        ...i,
        prices: [
            { date: "2026-10-19", price: "100000000", splitFactor: 1, dividend: 0 },
            {
                date: "2026-10-20",
                price: "50000000",
                splitFactor: i.symbol === "AAPL" ? 2 : 1,
                dividend: i.symbol === "AAPL" ? 1 : 0,
            },
            { date: "2026-10-21", price: "50000000", splitFactor: 1, dividend: 0 },
        ],
    }));
    const events = corporateActions(raw);
    assert.deepEqual(events.map((e) => e.kind), ["split", "dividend"]);
    const state = account();
    for (const event of events)
        applyAdjustment(state, event, "old", "new");
    assert.equal(state.holdings[0].units, "50000000");
    assert.equal(state.cash, "975500000");
    assert.equal(state.adjustments!.length, 2);
});
async function snapshots(store: DemoStore, from: string, to: string) {
    const date = new Date().toISOString().slice(0, 10), prior = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const raw = instruments.map((i) => ({
        ...i,
        prices: [
            { date: prior, price: "100000000", splitFactor: 1, dividend: 0 },
            {
                date,
                price: i.symbol === "AAPL" ? "50000000" : "100000000",
                splitFactor: i.symbol === "AAPL" ? 2 : 1,
                dividend: i.symbol === "AAPL" ? 1 : 0,
            },
        ],
    }));
    const old: Dataset = {
        id: from,
        asOf: prior,
        receivedAt: prior + "T22:00:00Z",
        instruments: raw.map((i) => ({ ...i, prices: [i.prices[0]] })),
    };
    const next: Dataset = {
        id: to,
        asOf: date,
        receivedAt: date + "T22:00:00Z",
        instruments: raw.map((i) => ({ ...i, prices: [i.prices[0], i.prices[1]] })),
        rawInstruments: raw,
        actions: corporateActions(raw),
    };
    for (const data of [old, next])
        await store.db
            .prepare("INSERT INTO market_snapshots VALUES(?,?,?,?)")
            .run(data.id, data.asOf, data.receivedAt, JSON.stringify(data));
    return { old, next };
}
test("local portfolios post split/dividend entries and advance the price version atomically", async () => {
    const store = new DemoStore(":memory:"), market = new MarketService(store);
    try {
        const { old, next } = await snapshots(store, "old", "new"), state = account();
        state.portfolio!.datasetId = old.id;
        await store.set(state);
        const after = await market.advance(state.id);
        assert.equal(after.portfolio!.datasetId, next.id);
        assert.equal(after.holdings[0].units, "50000000");
        assert.equal(after.cash, "975500000");
        assert.equal(after.holdings[0].cost, "25000000");
        assert.equal(portfolioValue(after, next.instruments), 1000500000n);
        assert.equal((await market.advance(state.id)).cash, after.cash);
        assert.equal((await market.status(after)).blocked, false);
    }
    finally {
        await store.db.close();
    }
});
test("a failed corporate journal write rolls back cash, shares, and snapshot advancement", async () => {
    const store = new DemoStore(":memory:"), market = new MarketService(store);
    try {
        await snapshots(store, "old", "new");
        const state = account();
        await store.set(state);
        const set = store.set.bind(store);
        store.set = () => {
            throw new Error("disk write failed");
        };
        await assert.rejects(async () => await market.advance(state.id), /disk write failed/);
        store.set = set;
        const after = await store.get(state.id);
        assert.equal(after.cash, state.cash);
        assert.equal(after.holdings[0].units, "25000000");
        assert.equal(after.portfolio!.datasetId, "old");
        assert.equal(after.adjustments, undefined);
    }
    finally {
        await store.db.close();
    }
});
test("persisted portfolio marks retain their pre-split value after a subsequent adjustment", async () => {
    const store = new DemoStore(":memory:"), market = new MarketService(store);
    try {
        const { old } = await snapshots(store, "old", "new"), state = account();
        state.portfolio!.startedAt = old.asOf + "T12:00:00Z";
        await store.set(state);
        await store.db
            .prepare("INSERT INTO portfolio_marks VALUES(?,?,?,?,?)")
            .run(state.id, state.portfolio!.id, old.asOf, "1000000000", "old");
        const after = await market.advance(state.id), history = (await market.history(after))!;
        assert.equal(history[0].value, 1000);
        assert.equal(history.at(-1)!.value, 1000.5);
    }
    finally {
        await store.db.close();
    }
});
test("history reconstructs split and dividend postings against their original price basis", () => {
    const state = account();
    state.decisions = [];
    state.cash = "1000000000";
    state.holdings = [];
    const old = instruments.map((i) => ({
        ...i,
        prices: [{ date: "2026-10-19", price: "100000000" }],
    }));
    const next = instruments.map((i) => ({
        ...i,
        prices: [
            { date: "2026-10-19", price: "100000000" },
            { date: "2026-10-20", price: "50000000" },
        ],
    }));
    const quote = preview(state, { symbol: "AAPL", side: "buy", amount: "25", reason: "Learn about shares" }, old);
    state.decisions = [
        {
            ...quote,
            id: quote.id,
            recordedAt: "2026-10-19T13:00:00Z",
            origin: "local",
            memoryStatus: "local",
        },
    ];
    state.cash = "975000000";
    state.holdings = [{ symbol: "AAPL", units: "25000000", cost: "25000000" }];
    for (const event of [action("split"), action("dividend")])
        applyAdjustment(state, event, "old", "new", "2026-10-20T22:00:00Z");
    const series = accountHistory(state, next, () => old)!;
    assert.equal(series.find((p) => p.date === "2026-10-19")!.value, 1000);
    assert.equal(series.find((p) => p.date === "2026-10-20")!.value, 1000.5);
    assert.equal(series.at(-1)!.value, 1000.5);
});
test("inactive portfolios receive archived actions after those dates leave the latest feed", async () => {
    const store = new DemoStore(":memory:"), market = new MarketService(store);
    try {
        const { next } = await snapshots(store, "old", "new"), state = account();
        await store.set(state);
        const later = {
            ...next,
            id: "latest",
            receivedAt: next.receivedAt.replace("22:00", "23:00"),
            actions: [],
            rawInstruments: undefined,
            instruments: next.instruments.map((i) => ({
                ...i,
                prices: i.prices.map((p) => ({ ...p, splitFactor: 1, dividend: 0 })),
            })),
        };
        await store.db
            .prepare("INSERT INTO market_snapshots VALUES(?,?,?,?)")
            .run(later.id, later.asOf, later.receivedAt, JSON.stringify(later));
        const after = await market.advance(state.id);
        assert.equal(after.holdings[0].units, "50000000");
        assert.equal(after.cash, "975500000");
        assert.equal(after.portfolio!.datasetId, "latest");
    }
    finally {
        await store.db.close();
    }
});
