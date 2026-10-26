import test from "node:test";
import assert from "node:assert/strict";
import {
  buy,
  sell,
  parseDollars,
  replay,
  SHARE_SCALE,
  USD_SCALE,
  portfolioValue,
} from "../shared/model.ts";
import { instruments, seedState } from "../shared/fixtures.ts";

test("dollar parsing is exact and rejects ambiguous or unsupported input", () => {
  assert.equal(parseDollars("10.01"), 10_010_000n);
  for (const value of ["-1", "1.001", "1e3", "NaN", "", "00.01"])
    assert.throws(() => parseDollars(value));
});
test("a buy rounds units down and debit up without exceeding its budget", () => {
  const order = buy(10n * USD_SCALE, 3n * USD_SCALE);
  assert.equal(order.units, 333_333_333n);
  assert.equal(order.amount, 10_000_000n);
});
test("a sale rounds proceeds down and rejects zero/negative amounts", () => {
  assert.equal(sell(333_333_333n, 3n * USD_SCALE).amount, 9_999_999n);
  assert.throws(() => sell(0n, USD_SCALE));
  assert.throws(() => buy(0n, USD_SCALE));
});
test("rounding cannot create value in 2,000 distinct immediate round trips", () => {
  for (let index = 1n; index <= 2000n; index++) {
    const price = index * 1_791_293n + 997n,
      budget = index * 920_039n + 100_000_000n;
    const order = buy(budget, price),
      proceeds = sell(order.units, price);
    assert.ok(order.amount <= budget);
    assert.ok(proceeds.amount <= order.amount);
  }
});
test("the initial sample cash plus cost basis is exactly $1,000", () => {
  const state = seedState("fixture");
  assert.equal(
    BigInt(state.cash) +
      state.holdings.reduce((sum, h) => sum + BigInt(h.cost), 0n),
    1000n * USD_SCALE,
  );
  assert.ok(portfolioValue(state, instruments) > 0n);
});
test("replay has equal initial capital, includes cash, and uses one price path", () => {
  const fixture = [
    {
      ...instruments[0],
      prices: [
        { date: "2026-01-01", price: String(100n * USD_SCALE) },
        { date: "2026-01-02", price: String(120n * USD_SCALE) },
      ],
    },
  ];
  const result = replay(fixture, { AAPL: 50 }, 0, 1);
  assert.equal(result[0].value, 1000);
  assert.equal(result[1].value, 1100);
  assert.equal(replay(fixture, {}, 0, 1)[1].value, 1000);
  assert.equal(buy(500n * USD_SCALE, 100n * USD_SCALE).units, 5n * SHARE_SCALE);
});
test("replay rejects missing symbols, future indices, and overallocated mixes", () => {
  assert.throws(() => replay(instruments, { AAPL: 110 }, 0, 20));
  assert.throws(() => replay(instruments, { MISSING: 50 }, 0, 20));
  assert.throws(() => replay(instruments, {}, 0, 60));
  assert.throws(() => replay(instruments, {}, 3, 1));
});
