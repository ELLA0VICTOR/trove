import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DemoStore } from "../server/store.ts";
import { LearningService } from "../server/learning-service.ts";
import type { MemoryEnvelope, MemoryReader, } from "../server/integrations/walrus.ts";
import type { GuideReply, Memory } from "../shared/model.ts";
async function setup() {
    const store = new DemoStore(":memory:", { liveMemory: true }), family = randomUUID();
    await store.db
        .prepare("INSERT INTO account_profiles(family,memory_enabled) VALUES(?,1)")
        .run(family);
    const state = await store.get(family);
    state.memories = [
        {
            id: randomUUID(),
            kind: "reflection",
            text: "I chose companies because I knew their products.",
            recordedAt: new Date().toISOString(),
            active: true,
            origin: "local",
        },
    ];
    await store.set(state);
    const confirm = async () => {
        const gateway: MemoryReader = {
            submit: async (record) => record.eventId,
            status: async (id) => ({ state: "confirmed", blobId: `blob-${id}` }),
            recall: async () => [],
        };
        for (let cycle = 0; cycle < 20; cycle++)
            await store.memoryOutbox.processOne(gateway, cycle * 2000);
    };
    await confirm();
    let generations = 0;
    const source = (): MemoryReader => ({
        submit: async () => "unused",
        status: async () => ({ state: "waiting" }),
        recall: async () => (await store.memoryOutbox.forScope(await store.memoryScope(family))).map((job) => ({
            record: JSON.parse(job.payload) as MemoryEnvelope,
            blobId: job.blob_id ?? undefined,
        })),
    });
    const coach = {
        explain: async (_question: string, memories: {
            id: string;
            text: string;
        }[]): Promise<GuideReply> => {
            generations++;
            return {
                text: "Let's revisit your reason and compare sectors.",
                sources: memories.map((record) => record.id),
                concept: "concentration",
                mode: "live",
            };
        },
    };
    return { store, family, confirm, source, coach, count: () => generations };
}
test("confirmed recalled evidence grounds the reply and unchanged questions use the durable cache", async () => {
    const fixture = await setup();
    try {
        const service = new LearningService(fixture.store, fixture.source, fixture.coach);
        const before = await fixture.store.get(fixture.family);
        const reply = await service.explain(fixture.family, "What should I learn?");
        assert.equal(reply.evidence?.length, 1);
        assert.equal(reply.evidence?.[0].blobId, `blob-${before.memories[0].id}`);
        assert.equal((await service.explain(fixture.family, "What should I learn?")).cached, true);
        assert.equal(fixture.count(), 1);
        assert.deepEqual((await fixture.store.get(fixture.family)).policy, before.policy);
        assert.equal((await fixture.store.get(fixture.family)).cash, before.cash);
    }
    finally {
        await fixture.store.db.close();
    }
});
test("withdrawn, wrong-scope and wrong-blob records never reach coaching", async () => {
    const fixture = await setup();
    try {
        const genuine = (await fixture.source().recall("risk"))[0];
        const source = (): MemoryReader => ({
            ...fixture.source(),
            recall: async () => [
                {
                    ...genuine,
                    record: { ...genuine.record, learnerScope: "another-family" },
                },
                { ...genuine, blobId: "unverified-blob" },
                {
                    ...genuine,
                    record: { ...genuine.record, text: "Changed remote content." },
                },
            ],
        });
        await assert.rejects(new LearningService(fixture.store, source, fixture.coach).explain(fixture.family, "risk"), /could not be retrieved/);
        assert.equal(fixture.count(), 0);
        const state = await fixture.store.get(fixture.family);
        state.memories = [];
        await fixture.store.set(state);
        const reply = await new LearningService(fixture.store, fixture.source, fixture.coach).explain(fixture.family, "General lesson?");
        assert.deepEqual(reply.sources, []);
        assert.deepEqual(reply.evidence, []);
        assert.equal((await fixture.store.memoryStatus(fixture.family)).confirmedMainnet, 0);
    }
    finally {
        await fixture.store.db.close();
    }
});
test("a pending correction blocks older explanations and its confirmed version takes precedence", async () => {
    const fixture = await setup();
    try {
        const state = await fixture.store.get(fixture.family), original = state.memories[0];
        original.active = false;
        const correction: Memory = {
            id: randomUUID(),
            kind: "correction",
            text: "I now want to compare shared business risks.",
            recordedAt: new Date().toISOString(),
            active: true,
            origin: "local",
            supersedes: original.id,
        };
        state.memories.unshift(correction);
        await fixture.store.set(state);
        const service = new LearningService(fixture.store, fixture.source, fixture.coach);
        await assert.rejects(service.explain(fixture.family, "Explain risk"), (error) => {
            assert.match(String(error), /still syncing/);
            assert.equal((error as {code?: string}).code, "MEMORY_SYNC_PENDING");
            return true;
        });
        assert.equal(fixture.count(), 0);
        await fixture.confirm();
        const reply = await service.explain(fixture.family, "Explain risk");
        assert.deepEqual(reply.sources, [correction.id]);
        assert.equal(fixture.count(), 1);
    }
    finally {
        await fixture.store.db.close();
    }
});
test("an explanation that ignores the current correction is rejected and not cached", async () => {
    const fixture = await setup();
    try {
        const state = await fixture.store.get(fixture.family);
        state.memories.unshift({
            id: randomUUID(),
            kind: "correction",
            text: "My current aim is understanding shared industry exposure.",
            recordedAt: new Date().toISOString(),
            active: true,
            origin: "local",
        });
        await fixture.store.set(state);
        await fixture.confirm();
        const coach = {
            explain: async (): Promise<GuideReply> => ({
                mode: "live",
                text: "An uncited explanation.",
                sources: [],
                concept: "concentration",
            }),
        };
        await assert.rejects(new LearningService(fixture.store, fixture.source, coach).explain(fixture.family, "risk"), /did not account/);
        assert.equal((await fixture.store.db
            .prepare("SELECT COUNT(*) AS count FROM coaching_cache")
            .get() as {
            count: number;
        }).count, 0);
    }
    finally {
        await fixture.store.db.close();
    }
});
test("provider outage is explicit and does not silently substitute fabricated recall", async () => {
    const fixture = await setup();
    try {
        const source = (): MemoryReader => ({
            ...fixture.source(),
            recall: async () => {
                throw new Error("provider unavailable");
            },
        });
        await assert.rejects(new LearningService(fixture.store, source, fixture.coach).explain(fixture.family, "risk"), /temporarily unavailable/);
        assert.equal(fixture.count(), 0);
    }
    finally {
        await fixture.store.db.close();
    }
});
test("a concurrent repeat does not trigger a second generation and changed context invalidates the result", async () => {
    const fixture = await setup();
    let release!: (reply: GuideReply) => void;
    try {
        const coach = {
            explain: async (): Promise<GuideReply> => new Promise((resolve) => {
                release = resolve;
            }),
        };
        const service = new LearningService(fixture.store, fixture.source, coach);
        const first = service.explain(fixture.family, "risk");
        await new Promise((resolve) => setTimeout(resolve, 0));
        await assert.rejects(service.explain(fixture.family, "risk"), /already being prepared/);
        const state = await fixture.store.get(fixture.family);
        state.memories = [];
        await fixture.store.set(state);
        release({
            mode: "live",
            text: "An older explanation",
            sources: [],
            concept: "concentration",
        });
        await assert.rejects(first, /thoughts changed/);
    }
    finally {
        await fixture.store.db.close();
    }
});
