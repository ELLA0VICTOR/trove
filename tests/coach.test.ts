import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoachGateway, checkCoachModelAccess, } from "../server/integrations/coach.ts";
import { COACH_MODEL, CoachBudget } from "../server/jobs/coach-budget.ts";
const reply = {
    text: "Different companies can still share the same risks.",
    sources: ["reason-1"],
    concept: "concentration",
};
const memories = [
    { id: "reason-1", text: "I chose five different technology companies." },
];
function result(overrides: Record<string, unknown> = {}) {
    return new Response(JSON.stringify({
        status: "completed",
        usage: { input_tokens: 1500, output_tokens: 300 },
        output: [
            {
                type: "message",
                content: [{ type: "output_text", text: JSON.stringify(reply) }],
            },
        ],
        ...overrides,
    }), { headers: { "Content-Type": "application/json" } });
}
test("OpenAI coach bounds context/output, requests no tools, and charges validated token usage", async () => {
    const db = new DatabaseSync(":memory:");
    try {
        const budget = new CoachBudget(db);
        const http: typeof fetch = async (url, init) => {
            assert.equal(url, "https://api.openai.com/v1/responses");
            const body = JSON.parse(init!.body as string);
            assert.equal(body.model, COACH_MODEL);
            assert.equal(body.store, false);
            assert.equal(body.max_output_tokens, 384);
            assert.equal(body.reasoning.effort, "none");
            assert.equal(body.service_tier, "default");
            assert.equal(body.tools, undefined);
            assert.equal(body.previous_response_id, undefined);
            assert.equal(body.text.format.strict, true);
            assert.match(body.instructions, /untrusted quoted evidence/);
            return result();
        };
        assert.deepEqual(await new CoachGateway("test-key", COACH_MODEL, budget, http).explain("What about risk?", memories), { ...reply, mode: "live" });
        assert.equal((await budget.summary()).requests, 1);
        assert.equal((await budget.summary()).estimatedOrReservedUsd, "0.000300");
    }
    finally {
        await db.close();
    }
});
test("unknown model prices, oversized questions and excessive context never reach the network", async () => {
    const db = new DatabaseSync(":memory:");
    try {
        const budget = new CoachBudget(db);
        const http: typeof fetch = async () => {
            assert.fail("Request must be refused before HTTP");
        };
        assert.throws(() => new CoachGateway("test-key", "gpt-expensive-unknown", budget, http), /price-verified/);
        const coach = new CoachGateway("test-key", COACH_MODEL, budget, http);
        await assert.rejects(coach.explain("x".repeat(1501), memories));
        await assert.rejects(coach.explain("risk", Array.from({ length: 7 }, (_, index) => ({
            id: String(index),
            text: "A reason",
        }))));
        assert.equal((await budget.summary()).requests, 0);
    }
    finally {
        await db.close();
    }
});
test("budget reservations stop further requests before spending and are shared by instances", async () => {
    const db = new DatabaseSync(":memory:");
    try {
        const first = new CoachBudget(db, "0.01");
        const second = new CoachBudget(db, "0.01");
        const id = await first.reserve(COACH_MODEL, 50000, 100);
        await assert.rejects(async () => await second.reserve(COACH_MODEL, 50000, 100), /allowance is exhausted/);
        assert.equal((await second.summary()).requests, 1);
        await first.settle(id, 1000, 200);
        assert.equal((await second.summary()).estimatedOrReservedUsd, "0.000200");
        await assert.doesNotReject(async () => await second.reserve(COACH_MODEL, 50000, 100));
        await assert.rejects(async () => await first.reserve("unknown", 1, 1), /no verified price/);
    }
    finally {
        await db.close();
    }
});
test("timeout and rate-limit responses make one attempt and retain the reservation", async () => {
    for (const mode of ["timeout", "rate-limit"]) {
        const db = new DatabaseSync(":memory:");
        try {
            const budget = new CoachBudget(db);
            let attempts = 0;
            const http: typeof fetch = async () => {
                attempts++;
                if (mode === "timeout")
                    throw new Error("secret-bearing transport message");
                return new Response("secret-bearing provider body", { status: 429 });
            };
            await assert.rejects(new CoachGateway("test-key", COACH_MODEL, budget, http).explain("Risk?", memories), (error: Error) => {
                assert.ok(!error.message.includes("secret-bearing"));
                assert.match(error.message, /No automatic retry/);
                return true;
            });
            assert.equal(attempts, 1);
            assert.equal((await budget.summary()).requests, 1);
            assert.ok(Number((await budget.summary()).estimatedOrReservedUsd) > 0);
            assert.equal((await db.prepare("SELECT state FROM coach_usage").get() as {
                state: string;
            })
                .state, "uncertain");
        }
        finally {
            await db.close();
        }
    }
});
test("incomplete, refused, and invalidly cited replies are rejected without refunding real usage", async () => {
    for (const variant of ["incomplete", "refusal", "wrong-source", "bad-json"]) {
        const db = new DatabaseSync(":memory:");
        try {
            const budget = new CoachBudget(db);
            const http: typeof fetch = async () => result(variant === "incomplete"
                ? { status: "incomplete" }
                : {
                    output: [
                        {
                            type: "message",
                            content: variant === "refusal"
                                ? [{ type: "refusal" }]
                                : [
                                    {
                                        type: "output_text",
                                        text: variant === "bad-json"
                                            ? "invalid"
                                            : JSON.stringify({
                                                ...reply,
                                                sources: ["another-learner"],
                                            }),
                                    },
                                ],
                        },
                    ],
                });
            await assert.rejects(new CoachGateway("test-key", COACH_MODEL, budget, http).explain("Risk?", memories));
            assert.equal((await budget.summary()).requests, 1);
            assert.equal((await budget.summary()).estimatedOrReservedUsd, "0.000300");
        }
        finally {
            await db.close();
        }
    }
});
test("missing usage retains a conservative reservation and excerpts are explicitly marked", async () => {
    const db = new DatabaseSync(":memory:");
    try {
        const budget = new CoachBudget(db);
        const http: typeof fetch = async (_url, init) => {
            const input = JSON.parse(JSON.parse(init!.body as string).input);
            assert.equal(input.untrustedMemories[0].truncated, true);
            assert.equal(input.untrustedMemories[0].excerpt.length, 500);
            return result({ usage: null });
        };
        await new CoachGateway("test-key", COACH_MODEL, budget, http).explain("Risk?", [{ id: "reason-1", text: "x".repeat(800) }]);
        assert.ok(Number((await budget.summary()).estimatedOrReservedUsd) > 0.0003);
        assert.equal((await db.prepare("SELECT state FROM coach_usage").get() as {
            state: string;
        })
            .state, "uncertain");
    }
    finally {
        await db.close();
    }
});
test("a process restart cannot erase unresolved reservations or reset the allowance", async () => {
    const directory = mkdtempSync(join(tmpdir(), "trove-coach-budget-"));
    const filename = join(directory, "usage.sqlite");
    let db = new DatabaseSync(filename);
    try {
        const first = new CoachBudget(db, "0.01");
        await first.reserve(COACH_MODEL, 50000, 100);
        await db.close();
        db = new DatabaseSync(filename);
        const restarted = new CoachBudget(db, "0.01");
        assert.equal((await restarted.summary()).requests, 1);
        await assert.rejects(async () => await restarted.reserve(COACH_MODEL, 50000, 100), /allowance is exhausted/);
    }
    finally {
        await db.close();
        rmSync(filename, { force: true });
        rmdirSync(directory);
    }
});
test("model access check uses metadata retrieval and never requests inference", async () => {
    const http: typeof fetch = async (url, init) => {
        assert.equal(url, `https://api.openai.com/v1/models/${COACH_MODEL}`);
        assert.equal(init?.body, undefined);
        assert.notEqual(init?.method, "POST");
        return new Response(JSON.stringify({ id: COACH_MODEL }));
    };
    assert.deepEqual(await checkCoachModelAccess("test-key", COACH_MODEL, http), {
        model: COACH_MODEL,
        metadataAccessible: true,
        inferenceTested: false,
    });
    await assert.rejects(checkCoachModelAccess("test-key", COACH_MODEL, async () => new Response("secret-bearing provider error", { status: 401 })), (error: Error & {
        httpStatus?: number;
    }) => {
        assert.equal(error.httpStatus, 401);
        assert.ok(!error.message.includes("secret-bearing"));
        return true;
    });
});
