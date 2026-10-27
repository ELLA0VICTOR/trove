import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { DemoStore } from "../server/store.ts";
import { execute, preview } from "../server/domain.ts";
import { randomUUID } from "node:crypto";
import { seedState } from "../shared/fixtures.ts";
import { localGuide, nextExercise } from "../shared/learning.ts";
import { instruments } from "../shared/fixtures.ts";
import { USD_SCALE } from "../shared/model.ts";
import type { AppSnapshot } from "../shared/model.ts";
import { seededFamily } from "./helpers/family.ts";
import { ChainService } from "../server/chain.ts";
import { MarketService } from "../server/market.ts";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { TatumSuiGateway } from "../server/integrations/tatum.ts";
async function setup() {
  const store = new DemoStore(":memory:"),
    app = await createApp(store);
  const { family, parent, learner } = await seededFamily(store);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    app.request(`/api${path}`, {
      method,
      headers: {
        Cookie: `trove_session=${learner.token}`,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const parentRequest = (path: string, body: unknown) =>
    request(path, "POST", body, { Cookie: `trove_session=${parent.token}` });
  return { store, app, family, request, parentRequest };
}
test("invalid practice amounts return a useful client error without changing state", async () => {
  const { request, store, family } = await setup();
  const before = await store.get(family);
  for (const amount of ["0", "-1", "1e3", "1.001", "10000001"]) {
    const response = await request("/orders/preview", "POST", {
      symbol: "KO",
      side: "buy",
      amount,
    });
    assert.equal(response.status, 400);
    assert.equal(
      typeof (
        (await response.json()) as {
          error: unknown;
        }
      ).error,
      "string",
    );
  }
  assert.deepEqual(await store.get(family), before);
});
test("reset invalidates old reviewed orders even when the new sample has the same sequence", async () => {
  const { store, family } = await setup();
  const initialCash = (await store.get(family)).cash;
  const quote = preview(await store.get(family), {
    symbol: "KO",
    side: "buy",
    amount: "25",
    reason: "Before reset",
  });
  await store.putQuote(family, quote);
  await store.reset(family);
  await assert.rejects(
    async () => await execute(store, family, quote.id),
    /not found/,
  );
  assert.equal((await store.get(family)).sequence, 0);
  assert.equal((await store.get(family)).cash, initialCash);
});
test("the guide uses the most recent active correction rather than an older one", async () => {
  const { request, store, family } = await setup();
  for (const text of [
    "I was exploring technology.",
    "My current goal is understanding different sectors.",
  ]) {
    await request("/memories", "POST", { kind: "correction", text });
  }
  const state = await store.get(family);
  const reply = localGuide(state, instruments, "What about risk?");
  assert.deepEqual(reply.sources, [state.memories[0].id]);
  assert.match(reply.text, /My current goal/);
  assert.doesNotMatch(reply.text, /I was exploring/);
});
test("execution debits once when the same reviewed quote is submitted twice", async () => {
  const { store, family } = await setup(),
    state = await store.get(family);
  const quote = preview(state, {
    symbol: "KO",
    side: "buy",
    amount: "25",
    reason: "I want to understand another sector.",
  });
  await store.putQuote(family, quote);
  const first = await execute(store, family, quote.id),
    second = await execute(store, family, quote.id);
  assert.equal(first.cash, second.cash);
  assert.equal(second.sequence, 1);
  assert.equal(second.decisions.filter((d) => d.origin === "local").length, 1);
});

test("unsigned trading and parent approval cannot change a practice portfolio", async () => {
  const { store, family, request, parentRequest } = await setup();
  try {
    const before = await store.get(family);
    const quote = preview(before, {
      symbol: "KO",
      side: "buy",
      amount: "150",
      reason: "A wallet is required.",
    });
    await store.putQuote(family, quote);
    const state = await store.get(family);
    state.approvals.push({
      id: randomUUID(),
      quote,
      state: "approved",
      createdAt: new Date().toISOString(),
    });
    await store.set(state);
    const approvalId = state.approvals[0].id;
    const replies = await Promise.all([
      request("/orders/execute", "POST", { quoteId: quote.id }),
      request("/orders/execute", "POST", { quoteId: quote.id }),
      parentRequest(`/approvals/${approvalId}`, { approve: true }),
      request("/approvals", "POST", { quoteId: quote.id }),
    ]);
    assert.deepEqual(
      replies.map((r) => r.status),
      [409, 409, 409, 409],
    );
    const after = await store.get(family);
    assert.equal(after.cash, before.cash);
    assert.equal(after.sequence, before.sequence);
    assert.deepEqual(after.holdings, before.holdings);
    assert.deepEqual(after.decisions, before.decisions);
  } finally {
    await store.db.close();
  }
});

test("only the owning parent can decline a pending wallet request and declining never trades", async () => {
  const { store, family, request, parentRequest } = await setup();
  try {
    const before = await store.get(family);
    const quote = preview(before, {
      symbol: "KO",
      side: "buy",
      amount: "150",
      reason: "Family-scoped request.",
    });
    const id = randomUUID();
    before.approvals.push({
      id,
      quote,
      state: "requested",
      createdAt: new Date().toISOString(),
    });
    await store.set(before);
    const path = `/approvals/${id}`;
    assert.equal((await request(path, "POST", { approve: false })).status, 403);
    const other = await seededFamily(store);
    assert.equal(
      (
        await request(
          path,
          "POST",
          { approve: false },
          { Cookie: `trove_session=${other.parent.token}` },
        )
      ).status,
      409,
    );
    assert.equal((await parentRequest(path, { approve: false })).status, 200);
    const after = await store.get(family);
    assert.equal(after.approvals[0].state, "declined");
    assert.equal(after.cash, before.cash);
    assert.equal(after.sequence, before.sequence);
    assert.deepEqual(after.holdings, before.holdings);
  } finally {
    await store.db.close();
  }
});

test("a wallet-backed request preserves signed quote expiry and duplicate requests do not extend it", async () => {
  const store = new DemoStore(":memory:");
  try {
    const { family, learner } = await seededFamily(store);
    const chain = new ChainService(store, new MarketService(store), {
      packageId: "0x" + "1".repeat(64),
      sponsorKey: Ed25519Keypair.generate().getSecretKey(),
      attestorKey: Ed25519Keypair.generate().getSecretKey(),
      gateway: { network: "testnet" } as TatumSuiGateway,
    });
    await store.db
      .prepare("INSERT INTO chain_accounts VALUES(?,?,?)")
      .run(family, "0x" + "2".repeat(64), "synthetic-create");
    const app = createApp(store, { chain });
    const state = await store.get(family);
    const quote = preview(state, {
      symbol: "KO",
      side: "buy",
      amount: "150",
      reason: "Exact signed terms.",
    });
    await store.putQuote(family, quote);
    const request = (quoteId: string) =>
      app.request("/api/approvals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `trove_session=${learner.token}`,
        },
        body: JSON.stringify({ quoteId }),
      });
    const first = await request(quote.id);
    assert.equal(first.status, 200);
    const again = await request(quote.id);
    assert.equal(again.status, 200);
    const after = await store.get(family);
    assert.equal(after.approvals.length, 1);
    assert.equal(after.approvals[0].quote.expiresAt, quote.expiresAt);
    assert.equal(
      (await store.getQuote(family, quote.id)).quote.expiresAt,
      quote.expiresAt,
    );
    assert.equal(after.cash, state.cash);
    const expired = { ...quote, id: randomUUID(), expiresAt: 0 };
    await store.putQuote(family, expired);
    assert.equal((await request(expired.id)).status, 409);
  } finally {
    await store.db.close();
  }
});

test("stale policy revision, changed sequence, and expired quotes cannot execute", async () => {
  for (const variant of ["revision", "sequence", "expiry"]) {
    const { store, family } = await setup(),
      state = await store.get(family),
      quote = preview(state, {
        symbol: "KO",
        side: "buy",
        amount: "25",
        reason: "",
      });
    if (variant === "revision") state.policy.revision++;
    if (variant === "sequence") state.sequence++;
    if (variant === "expiry") quote.expiresAt = 0;
    await store.set(state);
    await store.putQuote(family, quote);
    await assert.rejects(async () => await execute(store, family, quote.id));
  }
});
test("a parent approval does not bypass insufficient cash or a paused account", async () => {
  for (const variant of ["cash", "paused"]) {
    const { store, family } = await setup(),
      state = await store.get(family),
      quote = preview(state, {
        symbol: "KO",
        side: "buy",
        amount: "25",
        reason: "",
      });
    state.approvals.push({
      id: randomUUID(),
      quote,
      state: "approved",
      createdAt: new Date().toISOString(),
    });
    if (variant === "cash") state.cash = "0";
    else state.policy.paused = true;
    await store.set(state);
    await store.putQuote(family, quote);
    await assert.rejects(async () => await execute(store, family, quote.id));
  }
});
test("one-time approval is bound to one exact quote and never widens a policy", async () => {
  const { store, family } = await setup(),
    state = await store.get(family);
  state.policy.perTrade = String(10n * USD_SCALE);
  await store.set(state);
  const approved = preview(state, {
      symbol: "KO",
      side: "buy",
      amount: "25",
      reason: "",
    }),
    changed = preview(state, {
      symbol: "JNJ",
      side: "buy",
      amount: "25",
      reason: "",
    });
  state.approvals.push({
    id: randomUUID(),
    quote: approved,
    state: "approved",
    createdAt: new Date().toISOString(),
  });
  await store.set(state);
  await store.putQuote(family, approved);
  await store.putQuote(family, changed);
  await assert.rejects(async () => await execute(store, family, changed.id));
  const result = await execute(store, family, approved.id);
  assert.equal(result.policy.perTrade, String(10n * USD_SCALE));
  assert.equal(result.approvals[0].state, "consumed");
});
test("different sample-family sessions cannot see or execute one another’s quote", async () => {
  const { store, family } = await setup(),
    quote = preview(await store.get(family), {
      symbol: "KO",
      side: "buy",
      amount: "25",
      reason: "private sample thought",
    });
  await store.putQuote(family, quote);
  await assert.rejects(
    async () => await execute(store, randomUUID(), quote.id),
  );
});
test("API blocks learner policy edits and requires the actual parent session", async () => {
  const { request, parentRequest } = await setup();
  assert.equal(
    (
      await request("/policy", "POST", {
        perTrade: "100",
        daily: "250",
        paused: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/preview-role", "POST", { role: "parent" })).status,
    403,
  );
  const saved = await parentRequest("/policy", {
    perTrade: "100",
    daily: "250",
    paused: true,
  });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as AppSnapshot).policy.paused, true);
});
test("cross-origin state-changing requests are rejected", async () => {
  const { request } = await setup();
  assert.equal(
    (await request("/reset", "POST", {}, { Origin: "https://other.example" }))
      .status,
    403,
  );
});
test("correction deactivates the superseded thought and changes the guide", async () => {
  const { request, store, family } = await setup(),
    original = (await store.get(family)).memories[0];
  const response = await request("/memories", "POST", {
    kind: "correction",
    text: "I understand that these companies share technology exposure.",
    supersedes: original.id,
  });
  assert.equal(response.status, 200);
  const current = await store.get(family);
  assert.equal(
    current.memories.find((m) => m.id === original.id)!.active,
    false,
  );
  assert.match(
    localGuide(current, instruments, "What do you remember?").text,
    /I understand that these companies share/,
  );
});
test("learning changes the next exercise without increasing financial permission", async () => {
  const { request, store, family } = await setup(),
    initial = await store.get(family),
    policy = JSON.stringify(initial.policy);
  assert.equal(nextExercise(initial).concept, "concentration");
  const response = await request("/exercise", "POST", {
    answer: 1,
    concept: "concentration",
  });
  assert.equal(response.status, 200);
  assert.equal(nextExercise(await store.get(family)).concept, "horizon");
  assert.equal(JSON.stringify((await store.get(family)).policy), policy);
});
test("live integration status cannot be confused with local record counts", async () => {
  const { request } = await setup(),
    response = await request("/integrations"),
    status = (await response.json()) as {
      mode: string;
      memory: {
        confirmed: number;
      };
      chain: {
        connected: boolean;
      };
    };
  assert.equal(status.mode, "family-practice");
  assert.equal(status.memory.confirmed, 0);
  assert.equal(status.chain.connected, false);
});
test("selling does not replenish the daily gross-buy allowance", async () => {
  const { store, family } = await setup(),
    state = seedState(family);
  state.daySpent = "100000000";
  await store.set(state);
  const quote = preview(state, {
    symbol: "AAPL",
    side: "sell",
    amount: "25",
    reason: "A practice change",
  });
  await store.putQuote(family, quote);
  assert.equal((await execute(store, family, quote.id)).daySpent, "100000000");
});
