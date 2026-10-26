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

function setup() {
  const store = new DemoStore(":memory:"),
    app = createApp(store),
    family = randomUUID();
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    app.request(`/api${path}`, {
      method,
      headers: {
        Cookie: `trove_demo=${family}`,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { store, app, family, request };
}

test("invalid practice amounts return a useful client error without changing state", async () => {
  const { request, store, family } = setup();
  const before = store.get(family);
  for (const amount of ["0", "-1", "1e3", "1.001", "10000001"]) {
    const response = await request("/orders/preview", "POST", {
      symbol: "KO",
      side: "buy",
      amount,
    });
    assert.equal(response.status, 400);
    assert.equal(
      typeof ((await response.json()) as { error: unknown }).error,
      "string",
    );
  }
  assert.deepEqual(store.get(family), before);
});

test("reset invalidates old reviewed orders even when the new sample has the same sequence", () => {
  const { store, family } = setup();
  const initialCash = store.get(family).cash;
  const quote = preview(store.get(family), {
    symbol: "KO",
    side: "buy",
    amount: "25",
    reason: "Before reset",
  });
  store.putQuote(family, quote);
  store.reset(family);
  assert.throws(() => execute(store, family, quote.id), /not found/);
  assert.equal(store.get(family).sequence, 0);
  assert.equal(store.get(family).cash, initialCash);
});

test("the guide uses the most recent active correction rather than an older one", async () => {
  const { request, store, family } = setup();
  for (const text of [
    "I was exploring technology.",
    "My current goal is understanding different sectors.",
  ]) {
    await request("/memories", "POST", { kind: "correction", text });
  }
  const state = store.get(family);
  const reply = localGuide(state, instruments, "What about risk?");
  assert.deepEqual(reply.sources, [state.memories[0].id]);
  assert.match(reply.text, /My current goal/);
  assert.doesNotMatch(reply.text, /I was exploring/);
});
test("execution debits once when the same reviewed quote is submitted twice", () => {
  const { store, family } = setup(),
    state = store.get(family);
  const quote = preview(state, {
    symbol: "KO",
    side: "buy",
    amount: "25",
    reason: "I want to understand another sector.",
  });
  store.putQuote(family, quote);
  const first = execute(store, family, quote.id),
    second = execute(store, family, quote.id);
  assert.equal(first.cash, second.cash);
  assert.equal(second.sequence, 1);
  assert.equal(second.decisions.filter((d) => d.origin === "local").length, 1);
});
test("stale policy revision, changed sequence, and expired quotes cannot execute", () => {
  for (const variant of ["revision", "sequence", "expiry"]) {
    const { store, family } = setup(),
      state = store.get(family),
      quote = preview(state, {
        symbol: "KO",
        side: "buy",
        amount: "25",
        reason: "",
      });
    if (variant === "revision") state.policy.revision++;
    if (variant === "sequence") state.sequence++;
    if (variant === "expiry") quote.expiresAt = 0;
    store.set(state);
    store.putQuote(family, quote);
    assert.throws(() => execute(store, family, quote.id));
  }
});
test("a parent approval does not bypass insufficient cash or a paused account", () => {
  for (const variant of ["cash", "paused"]) {
    const { store, family } = setup(),
      state = store.get(family),
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
    store.set(state);
    store.putQuote(family, quote);
    assert.throws(() => execute(store, family, quote.id));
  }
});
test("one-time approval is bound to one exact quote and never widens a policy", () => {
  const { store, family } = setup(),
    state = store.get(family);
  state.policy.perTrade = String(10n * USD_SCALE);
  store.set(state);
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
  store.set(state);
  store.putQuote(family, approved);
  store.putQuote(family, changed);
  assert.throws(() => execute(store, family, changed.id));
  const result = execute(store, family, approved.id);
  assert.equal(result.policy.perTrade, String(10n * USD_SCALE));
  assert.equal(result.approvals[0].state, "consumed");
});
test("different sample-family sessions cannot see or execute one another’s quote", () => {
  const { store, family } = setup(),
    quote = preview(store.get(family), {
      symbol: "KO",
      side: "buy",
      amount: "25",
      reason: "private sample thought",
    });
  store.putQuote(family, quote);
  assert.throws(() => execute(store, randomUUID(), quote.id));
});
test("API blocks policy edits in learner preview and accepts them in explicit parent preview", async () => {
  const { request } = setup();
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
    200,
  );
  const saved = await request("/policy", "POST", {
    perTrade: "100",
    daily: "250",
    paused: true,
  });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as AppSnapshot).policy.paused, true);
});
test("cross-origin state-changing requests are rejected", async () => {
  const { request } = setup();
  assert.equal(
    (await request("/reset", "POST", {}, { Origin: "https://other.example" }))
      .status,
    403,
  );
});
test("correction deactivates the superseded thought and changes the guide", async () => {
  const { request, store, family } = setup(),
    original = store.get(family).memories[0];
  const response = await request("/memories", "POST", {
    kind: "correction",
    text: "I understand that these companies share technology exposure.",
    supersedes: original.id,
  });
  assert.equal(response.status, 200);
  const current = store.get(family);
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
  const { request, store, family } = setup(),
    initial = store.get(family),
    policy = JSON.stringify(initial.policy);
  assert.equal(nextExercise(initial).concept, "concentration");
  const response = await request("/exercise", "POST", {
    answer: 1,
    concept: "concentration",
  });
  assert.equal(response.status, 200);
  assert.equal(nextExercise(store.get(family)).concept, "horizon");
  assert.equal(JSON.stringify(store.get(family).policy), policy);
});
test("live integration status cannot be confused with local record counts", async () => {
  const { request } = setup(),
    response = await request("/integrations"),
    status = (await response.json()) as {
      mode: string;
      memory: { confirmed: number };
      chain: { connected: boolean };
    };
  assert.equal(status.mode, "local-demo");
  assert.equal(status.memory.confirmed, 0);
  assert.equal(status.chain.connected, false);
});
test("selling does not replenish the daily gross-buy allowance", () => {
  const { store, family } = setup(),
    state = seedState(family);
  state.daySpent = "100000000";
  store.set(state);
  const quote = preview(state, {
    symbol: "AAPL",
    side: "sell",
    amount: "25",
    reason: "A practice change",
  });
  store.putQuote(family, quote);
  assert.equal(execute(store, family, quote.id).daySpent, "100000000");
});
