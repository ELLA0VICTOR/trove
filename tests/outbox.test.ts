import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MemoryOutbox } from "../server/jobs/memory-outbox.ts";
import type { MemoryEnvelope, MemoryGateway, } from "../server/integrations/walrus.ts";
const record: MemoryEnvelope = {
    schemaVersion: 1,
    eventId: "decision-1",
    learnerScope: "sample-1",
    kind: "decision",
    text: "I want to compare companies across different industries.",
    recordedAt: "2026-10-26T12:00:00Z",
};
test("outbox retains one operation key and refuses conflicting payloads", async () => {
    const db = new DatabaseSync(":memory:"), queue = new MemoryOutbox(db);
    const key = await queue.enqueue(record);
    assert.equal(await queue.enqueue(record), key);
    await assert.rejects(async () => await queue.enqueue({ ...record, text: "Changed after the fact" }));
});
test("accepted job survives worker reconstruction and is not resubmitted", async () => {
    const db = new DatabaseSync(":memory:");
    let queue = new MemoryOutbox(db), submitted = 0, polls = 0;
    const key = await queue.enqueue(record);
    const gateway: MemoryGateway = {
        submit: async () => {
            submitted++;
            return "job-1";
        },
        status: async () => {
            polls++;
            return polls === 1
                ? { state: "waiting" }
                : { state: "confirmed", blobId: "blob-1" };
        },
    };
    await queue.processOne(gateway, 0);
    assert.equal((await queue.get(key))!.state, "accepted");
    assert.equal((await queue.get(key))!.blob_id, null);
    queue = new MemoryOutbox(db);
    await queue.processOne(gateway, 2000);
    await queue.processOne(gateway, 8000);
    assert.equal(submitted, 1);
    assert.equal((await queue.get(key))!.state, "confirmed");
    assert.equal((await queue.get(key))!.blob_id, "blob-1");
});
test("a lost acceptance response retries the exact same persisted key", async () => {
    const queue = new MemoryOutbox(new DatabaseSync(":memory:")), keys: string[] = [];
    await queue.enqueue(record);
    const gateway: MemoryGateway = {
        submit: async (_, key) => {
            keys.push(key);
            if (keys.length === 1)
                throw new Error("response lost");
            return "existing-job";
        },
        status: async () => ({ state: "waiting" }),
    };
    await queue.processOne(gateway, 0);
    await queue.processOne(gateway, 2000);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
});
test("a polling timeout keeps the accepted job and never fabricates confirmation", async () => {
    const queue = new MemoryOutbox(new DatabaseSync(":memory:")), key = await queue.enqueue(record);
    const gateway: MemoryGateway = {
        submit: async () => "job-1",
        status: async () => {
            throw new Error("timeout");
        },
    };
    await queue.processOne(gateway, 0);
    await queue.processOne(gateway, 2000);
    assert.equal((await queue.get(key))!.state, "accepted");
    assert.equal((await queue.get(key))!.job_id, "job-1");
    assert.equal((await queue.get(key))!.blob_id, null);
});
test("authentication failures stop retries and rate limits respect the cooldown", async () => {
    const queue = new MemoryOutbox(new DatabaseSync(":memory:")), key = await queue.enqueue(record);
    await queue.processOne({
        submit: async () => {
            throw Object.assign(new Error("unauthorized"), { status: 401 });
        },
        status: async () => ({ state: "waiting" }),
    }, 0);
    assert.equal((await queue.get(key))!.state, "failed");
    const second = { ...record, eventId: "decision-2" }, secondKey = await queue.enqueue(second);
    await queue.processOne({
        submit: async () => {
            throw Object.assign(new Error("rate limit"), { retryAfterSeconds: 30 });
        },
        status: async () => ({ state: "waiting" }),
    }, 0);
    assert.equal((await queue.get(secondKey))!.next_at, 30000);
});
test("an expired worker lease cannot overwrite the newer worker's accepted job", async () => {
    const queue = new MemoryOutbox(new DatabaseSync(":memory:"));
    const key = await queue.enqueue(record);
    let release!: (id: string) => void;
    const first = queue.processOne({
        submit: async () => new Promise((resolve) => {
            release = resolve;
        }),
        status: async () => ({ state: "waiting" }),
    }, 0);
    await queue.processOne({
        submit: async () => "newer-job",
        status: async () => ({ state: "waiting" }),
    }, 60001);
    release("stale-worker-job");
    await first;
    assert.equal((await queue.get(key))!.job_id, "newer-job");
    assert.equal((await queue.get(key))!.state, "accepted");
});
