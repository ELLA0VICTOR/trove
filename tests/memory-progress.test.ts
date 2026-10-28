import test from "node:test";
import assert from "node:assert/strict";
import { seedState, instruments } from "../shared/fixtures.ts";
import type { AppSnapshot } from "../shared/model.ts";
import {
  applyMemoryProgress,
  retainMemoryConfirmations,
  waitingForMemory,
} from "../src/lib/memory-progress.ts";
const snapshot = () =>
  ({
    ...seedState("progress-test"),
    instruments,
    session: {
      mode: "account",
      role: "learner",
      memoryEnabled: true,
      servicesReady: true,
    },
    memories: [
      {
        id: "correction",
        kind: "correction",
        text: "Different names can share risks.",
        active: true,
        origin: "local",
        recordedAt: new Date().toISOString(),
        syncStatus: "accepted",
      },
    ],
  }) as AppSnapshot;
test("background progress confirms only matching active records and leaves investment state untouched", () => {
  const before = snapshot();
  assert.equal(waitingForMemory(before), true);
  const next = applyMemoryProgress(before, {
    records: [
      {
        id: "correction",
        status: "confirmed",
        blobId: "mainnet-evidence",
        withdrawn: false,
      },
      {
        id: "foreign-record",
        status: "confirmed",
        blobId: "foreign",
        withdrawn: false,
      },
    ],
  });
  assert.equal(next.memories.length, 1);
  assert.equal(next.memories[0].blobId, "mainnet-evidence");
  assert.equal(waitingForMemory(next), false);
  assert.equal(next.cash, before.cash);
  assert.deepEqual(next.policy, before.policy);
  assert.deepEqual(next.holdings, before.holdings);
  assert.equal(
    applyMemoryProgress(next, {
      records: [{ id: "correction", status: "accepted", withdrawn: false }],
    }),
    next,
  );
});
test("old snapshots cannot erase confirmation or revive a corrected record, and another family never inherits it", () => {
  const old = snapshot();
  const confirmed = applyMemoryProgress(old, {
    records: [
      {
        id: "correction",
        status: "confirmed",
        blobId: "evidence",
        withdrawn: false,
      },
    ],
  });
  assert.equal(
    retainMemoryConfirmations(confirmed, old).memories[0].blobId,
    "evidence",
  );
  const removed = structuredClone(old);
  removed.memories[0].active = false;
  assert.equal(
    retainMemoryConfirmations(confirmed, removed).memories[0].blobId,
    undefined,
  );
  const other = { ...old, id: "another-family" };
  assert.equal(retainMemoryConfirmations(confirmed, other), other);
  assert.equal(
    applyMemoryProgress(old, {
      records: [
        {
          id: "correction",
          status: "confirmed",
          blobId: "withdrawn",
          withdrawn: true,
        },
      ],
    }),
    old,
  );
});
