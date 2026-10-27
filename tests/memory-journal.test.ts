import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemoStore } from "../server/store.ts";
import { createApp } from "../server/app.ts";
import { execute, preview } from "../server/domain.ts";
import type { MemoryGateway } from "../server/integrations/walrus.ts";
import { seededFamily } from "./helpers/family.ts";
async function setup(authenticated = true) {
  const store = new DemoStore(":memory:");
  const { family, learner } = authenticated
    ? await seededFamily(store)
    : { family: randomUUID(), learner: undefined };
  const app = await createApp(store);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    actor = family,
  ) =>
    app.request(`/api${path}`, {
      method,
      headers: {
        Cookie:
          actor === family && learner
            ? `trove_session=${learner.token}`
            : `trove_demo=${actor}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { store, family, request };
}
test("sample seeds never enter the journal and local decisions cannot dispatch", async () => {
  const { store, family } = await setup(false);
  assert.equal((await store.memoryStatus(family)).heldLocally, 0);
  assert.equal((await store.memoryStatus(family)).sampleExcluded, 5);
  const quote = preview(await store.get(family), {
    symbol: "KO",
    side: "buy",
    amount: "25",
    reason: "Compare another industry.",
  });
  await store.putQuote(family, quote);
  const first = await execute(store, family, quote.id);
  await execute(store, family, quote.id);
  const status = await store.memoryStatus(family);
  assert.equal(status.heldLocally, 1);
  assert.equal(status.confirmedMainnet, 0);
  assert.equal(status.submissionEligible, false);
  assert.equal(status.dispatchEnabled, false);
  assert.equal(status.records[0].decisionId, first.decisions[0].id);
  const gateway: MemoryGateway = {
    submit: async () => {
      assert.fail("Local records must not be uploaded");
    },
    status: async () => {
      assert.fail("Local records have no remote job");
    },
  };
  assert.equal(await store.memoryOutbox.processOne(gateway), false);
  await store.db.close();
});
test("a failed journal write rolls back accounting, quote consumption, and domain history", async () => {
  const { store, family } = await setup();
  const before = await store.get(family);
  const quote = preview(before, {
    symbol: "KO",
    side: "buy",
    amount: "25",
    reason: "A reason that must be retained.",
  });
  await store.putQuote(family, quote);
  await store.db
    .exec(`CREATE TRIGGER fail_journal BEFORE INSERT ON memory_outbox
    BEGIN SELECT RAISE(ABORT,'Simulated journal failure'); END`);
  await assert.rejects(
    async () => await execute(store, family, quote.id),
    /journal failure/,
  );
  assert.deepEqual(await store.get(family), before);
  assert.equal((await store.getQuote(family, quote.id)).decision, undefined);
  assert.equal((await store.memoryStatus(family)).heldLocally, 0);
  await store.db.exec("DROP TRIGGER fail_journal");
  assert.equal((await execute(store, family, quote.id)).sequence, 1);
  await store.db.close();
});
test("reflections, linked corrections, and lesson results share the durable journal", async () => {
  const { store, family, request } = await setup();
  const decision = (await store.get(family)).decisions[0];
  assert.equal(
    (
      await request("/memories", "POST", {
        kind: "reflection",
        text: "Different names still shared a sector.",
        decisionId: decision.id,
      })
    ).status,
    200,
  );
  const original = (await store.get(family)).memories[0];
  assert.equal(
    (
      await request("/memories", "POST", {
        kind: "correction",
        text: "I want to compare sectors, not only names.",
        supersedes: original.id,
      })
    ).status,
    200,
  );
  const current = (await store.get(family)).memories[0];
  assert.equal(current.decisionId, decision.id);
  assert.equal((await store.memoryStatus(family)).heldLocally, 1);
  assert.equal(
    (await store.memoryStatus(family)).records[0].kind,
    "correction",
  );
  assert.equal((await store.get(family)).decisions[0].reason, decision.reason);
  assert.equal(
    (
      await request("/exercise", "POST", {
        concept: "concentration",
        answer: 1,
      })
    ).status,
    200,
  );
  assert.equal((await store.memoryStatus(family)).heldLocally, 2);
  assert.deepEqual(
    new Set(
      (await store.memoryStatus(family)).records.map((record) => record.kind),
    ),
    new Set(["correction", "learning"]),
  );
  await store.db.close();
});
test("cross-linked and stale corrections are refused without changing either history", async () => {
  const { store, family, request } = await setup();
  const initial = await store.get(family);
  const original = initial.memories[0];
  assert.equal(
    (
      await request("/memories", "POST", {
        kind: "correction",
        text: "Wrong association.",
        supersedes: original.id,
        decisionId: initial.decisions[1].id,
      })
    ).status,
    409,
  );
  assert.deepEqual(await store.get(family), initial);
  assert.equal(
    (
      await request("/memories", "POST", {
        kind: "correction",
        text: "Current explanation.",
        supersedes: original.id,
      })
    ).status,
    200,
  );
  const corrected = await store.get(family);
  assert.equal(
    (
      await request("/memories", "POST", {
        kind: "correction",
        text: "A stale second correction.",
        supersedes: original.id,
      })
    ).status,
    409,
  );
  assert.deepEqual(await store.get(family), corrected);
  await store.db.close();
});
test("deletion and reset remove never-dispatched payloads and status is family-scoped", async () => {
  const { store, family, request } = await setup();
  await request("/memories", "POST", {
    kind: "reflection",
    text: "Private local thought.",
  });
  const id = (await store.get(family)).memories[0].id;
  const ownStatus = await (await request("/memory/status")).json();
  assert.equal(ownStatus.heldLocally, 1);
  assert.ok(!JSON.stringify(ownStatus).includes("Private local thought"));
  const otherStatus = await (
    await request("/memory/status", "GET", undefined, randomUUID())
  ).json();
  assert.equal(otherStatus.heldLocally, 0);
  assert.ok(!JSON.stringify(otherStatus).includes(id));
  await request(`/memories/${id}`, "DELETE");
  assert.equal((await store.memoryStatus(family)).heldLocally, 0);
  await request("/memories", "POST", {
    kind: "reflection",
    text: "Another thought.",
  });
  await store.reset(family);
  assert.equal((await store.memoryStatus(family)).heldLocally, 0);
  assert.equal((await store.memoryStatus(family)).confirmedMainnet, 0);
  await store.db.close();
});
test("a persisted local record is immutable under its stable event identity", async () => {
  const { store, family } = await setup();
  const state = await store.get(family);
  state.memories.unshift({
    id: randomUUID(),
    kind: "reflection",
    text: "Original text.",
    recordedAt: new Date().toISOString(),
    active: true,
    origin: "local",
  });
  await store.set(state);
  const original = await store.get(family);
  state.memories[0].text = "Mutated under the same event ID.";
  await assert.rejects(async () => await store.set(state), /changed content/);
  assert.deepEqual(await store.get(family), original);
  await store.db.close();
});
test("memory journal and domain state survive a real database close and reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "trove-memory-journal-"));
  const filename = join(directory, "local.sqlite");
  const family = randomUUID();
  let store = new DemoStore(filename);
  try {
    const state = await store.get(family);
    state.memories.unshift({
      id: randomUUID(),
      kind: "reflection",
      text: "Remember after a restart.",
      recordedAt: new Date().toISOString(),
      active: true,
      origin: "local",
    });
    await store.set(state);
    await store.db.close();
    store = new DemoStore(filename);
    assert.deepEqual(await store.get(family), state);
    assert.equal((await store.memoryStatus(family)).heldLocally, 1);
    assert.equal(
      (await store.memoryStatus(family)).records[0].id,
      state.memories[0].id,
    );
  } finally {
    await store.db.close();
    rmSync(filename, { force: true });
    rmdirSync(directory);
  }
});
