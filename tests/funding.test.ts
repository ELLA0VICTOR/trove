import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DemoStore } from "../server/store.ts";
import { Accounts } from "../server/auth.ts";
import { createApp } from "../server/app.ts";
import { MarketService, accountHistory } from "../server/market.ts";
import {
  applyFunding,
  fundingAmount,
  practiceCapital,
} from "../shared/funding.ts";
import { seedState, instruments } from "../shared/fixtures.ts";
import { portfolioValue } from "../shared/model.ts";

async function setup() {
  const store = new DemoStore(":memory:"),
    accounts = new Accounts(store);
  const parent = await accounts.register({
    username: "fund_parent",
    password: "synthetic-test-password",
  });
  const invitation = await accounts.invite(parent.member);
  const learner = await accounts.join({
    code: invitation.code,
    username: "fund_learner",
    password: "synthetic-test-password",
  });
  const app = createApp(store);
  const request = (token: string | undefined, input: unknown) =>
    app.request("/api/account/funds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Cookie: `trove_session=${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
  return { store, accounts, parent, learner, request, app };
}
test("only the parent can replenish the shared learner portfolio and retries credit cash once", async () => {
  const f = await setup();
  try {
    const input = { id: randomUUID(), amount: "4000" };
    assert.equal((await f.request(undefined, input)).status, 403);
    assert.equal((await f.request(f.learner.token, input)).status, 403);
    const responses = await Promise.all([
      f.request(f.parent.token, input),
      f.request(f.parent.token, input),
    ]);
    assert.ok(responses.every((response) => response.status === 200));
    const state = await f.store.get(f.parent.member.family);
    assert.equal(state.cash, "5000000000");
    assert.equal(state.funding!.length, 1);
    assert.equal(practiceCapital(state), 5000000000n);
    const learner = await f.app.request("/api/state", {
      headers: { Cookie: `trove_session=${f.learner.token}` },
    });
    assert.equal((await learner.json()).cash, state.cash);
    assert.equal(
      (await f.request(f.parent.token, { ...input, amount: "5000" })).status,
      400,
    );
    for (const amount of ["0", "-1", "0.001", "1000000.01", "NaN", "1e6"])
      assert.equal(
        (await f.request(f.parent.token, { id: randomUUID(), amount })).status,
        400,
        amount,
      );
    const guest = await (await f.app.request("/api/state")).json();
    assert.deepEqual(guest.funding, []);
  } finally {
    await f.store.db.close();
  }
});
test("refills preserve losses, positions, learning, limits, pause and daily spending", async () => {
  const state = seedState(randomUUID());
  state.cash = "0";
  state.holdings = [];
  state.daySpent = "200000000";
  state.policy.paused = true;
  const previous = structuredClone(state);
  applyFunding(state, {
    id: randomUUID(),
    amount: "1000000000",
    recordedAt: new Date().toISOString(),
  });
  assert.equal(state.cash, "1000000000");
  assert.equal(
    portfolioValue(state, instruments) - practiceCapital(state),
    -1000000000n,
  );
  assert.equal(state.daySpent, previous.daySpent);
  assert.equal(state.spendDay, previous.spendDay);
  assert.deepEqual(state.policy, previous.policy);
  assert.deepEqual(state.holdings, previous.holdings);
  assert.deepEqual(state.decisions, previous.decisions);
  assert.deepEqual(state.memories, previous.memories);
  assert.equal(state.sequence, previous.sequence + 1);
});
test("funding histories are dated and new contributions never count as investment profit", () => {
  const state = seedState(randomUUID());
  state.cash = "1000000000";
  state.holdings = [];
  state.decisions = [];
  state.portfolio = {
    id: randomUUID(),
    initialCash: "1000000000",
    datasetId: "data",
    startedAt: "2026-09-23T00:00:00Z",
  };
  applyFunding(state, {
    id: randomUUID(),
    amount: "4000000000",
    recordedAt: "2026-09-24T12:00:00Z",
  });
  const history = accountHistory(state, instruments)!;
  assert.equal(
    history.find((point) => point.date === "2026-09-23")!.value,
    1000,
  );
  assert.equal(
    history.find((point) => point.date === "2026-09-24")!.value,
    5000,
  );
  assert.equal(portfolioValue(state, instruments) - practiceCapital(state), 0n);
  assert.equal(fundingAmount("0.01"), 10000n);
});
test("market enrollment carries forward supplied practice capital and archives the previous ledger", async () => {
  const f = await setup();
  try {
    await f.request(f.parent.token, { id: randomUUID(), amount: "4000" });
    const market = new MarketService(f.store, {
      histories: async () =>
        instruments.map((instrument) => ({
          symbol: instrument.symbol,
          provider: "Marketstack",
          basis: "raw-close",
          receivedAt: new Date().toISOString(),
          excluded: 0,
          prices: [3, 2, 1, 0].map((ago) => ({
            date: new Date(Date.now() - ago * 86400000)
              .toISOString()
              .slice(0, 10),
            sourceTimestamp: new Date(Date.now() - ago * 86400000)
              .toISOString()
              .slice(0, 10),
            price: "100000000",
            adjustedPrice: "100000000",
            splitFactor: 1,
            dividend: 0,
          })),
        })),
    });
    await market.refresh();
    const state = await market.enroll(f.parent.member.family, true);
    assert.equal(state.portfolio!.initialCash, "5000000000");
    assert.equal(state.cash, "5000000000");
    assert.equal(practiceCapital(state), 5000000000n);
    assert.equal(
      (await f.store.db
        .prepare("SELECT count(*) AS n FROM portfolio_archives WHERE family=?")
        .get(state.id))!.n,
      1,
    );
  } finally {
    await f.store.db.close();
  }
});
test("wallet-backed and pending portfolios cannot bypass signed funding through the local endpoint", async () => {
  const f = await setup();
  try {
    await f.store.db
      .prepare("INSERT INTO chain_accounts VALUES(?,?,?)")
      .run(f.parent.member.family, "0x" + "1".repeat(64), "created");
    assert.equal(
      (await f.request(f.parent.token, { id: randomUUID(), amount: "100" }))
        .status,
      409,
    );
    assert.equal(
      (await f.store.get(f.parent.member.family)).cash,
      "1000000000",
    );
    await f.store.db.prepare("DELETE FROM chain_accounts").run();
    await f.store.db
      .prepare("INSERT INTO chain_intents VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        f.parent.member.family,
        f.parent.member.id,
        "create",
        "{}",
        null,
        "",
        null,
        "building",
        Date.now() + 60000,
        null,
      );
    assert.equal(
      (await f.request(f.parent.token, { id: randomUUID(), amount: "100" }))
        .status,
      409,
    );
  } finally {
    await f.store.db.close();
  }
});
