import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { instruments } from "../shared/fixtures.ts";
import { InputError, parseDollars } from "../shared/model.ts";
import { localGuide, nextExercise } from "../shared/learning.ts";
import { DomainError, execute, preview } from "./domain.ts";
import { DemoStore } from "./store.ts";

const textSchema = z.string().trim().min(1).max(1500);
export function createApp(store: DemoStore) {
  const app = new Hono<{ Variables: { family: string } }>();
  app.use("*", secureHeaders());
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      origin &&
      ![
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      ].includes(origin)
    )
      return c.json({ error: "This request origin is not allowed." }, 403);
    c.header("Cache-Control", "no-store");
    let family = getCookie(c, "trove_demo");
    if (!family || !/^[a-f0-9-]{36}$/.test(family)) {
      family = randomUUID();
      setCookie(c, "trove_demo", family, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    c.set("family", family);
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof InputError)
      return c.json({ error: error.message }, 400);
    if (error instanceof z.ZodError)
      return c.json(
        { error: error.issues[0]?.message ?? "Please check your entry." },
        400,
      );
    if (error instanceof DomainError)
      return c.json({ error: error.message }, 409);
    if (error instanceof SyntaxError)
      return c.json({ error: "This request could not be read." }, 400);
    console.error("[trove]", error.message);
    return c.json(
      { error: "That action could not be completed. Please try again." },
      500,
    );
  });
  app.get("/api/state", (c) =>
    c.json({ ...store.get(c.get("family")), instruments }),
  );
  app.post("/api/preview-role", async (c) => {
    const input = z
      .object({ role: z.enum(["learner", "parent"]) })
      .parse(await c.req.json());
    const state = store.get(c.get("family"));
    state.role = input.role;
    store.set(state);
    return c.json({ ...state, instruments });
  });
  app.post("/api/reset", (c) => {
    const state = store.reset(c.get("family"));
    return c.json({ ...state, instruments });
  });
  app.post("/api/orders/preview", async (c) => {
    const input = z
      .object({
        symbol: z.string().max(8),
        side: z.enum(["buy", "sell"]),
        amount: z.string().max(20),
        reason: z.string().max(1500).default(""),
      })
      .parse(await c.req.json());
    const quote = preview(store.get(c.get("family")), input);
    store.putQuote(c.get("family"), quote);
    return c.json(quote);
  });
  app.post("/api/orders/execute", async (c) => {
    const { quoteId } = z
      .object({ quoteId: z.uuid() })
      .parse(await c.req.json());
    return c.json({ ...execute(store, c.get("family"), quoteId), instruments });
  });
  app.post("/api/approvals", async (c) => {
    const { quoteId } = z
      .object({ quoteId: z.uuid() })
      .parse(await c.req.json());
    const { quote } = store.getQuote(c.get("family"), quoteId);
    if (Date.now() >= quote.expiresAt)
      throw new DomainError(
        "This order preview expired. Please review a fresh one.",
      );
    const state = store.get(c.get("family"));
    if (!state.approvals.some((a) => a.quote.id === quoteId))
      state.approvals.unshift({
        id: randomUUID(),
        quote,
        state: "requested",
        createdAt: new Date().toISOString(),
      });
    store.set(state);
    return c.json({ ...state, instruments });
  });
  app.post("/api/approvals/:id", async (c) => {
    const { approve } = z
      .object({ approve: z.boolean() })
      .parse(await c.req.json());
    const state = store.get(c.get("family"));
    if (state.role !== "parent")
      return c.json(
        { error: "This control belongs to the parent preview." },
        403,
      );
    const approval = state.approvals.find((a) => a.id === c.req.param("id"));
    if (!approval || approval.state !== "requested")
      throw new DomainError("This request is no longer awaiting approval.");
    if (
      approve &&
      (Date.now() >= approval.quote.expiresAt ||
        approval.quote.revision !== state.policy.revision ||
        approval.quote.sequence !== state.sequence)
    )
      throw new DomainError(
        "The order changed or expired. Ask the learner to make a fresh request.",
      );
    approval.state = approve ? "approved" : "declined";
    store.set(state);
    return c.json({ ...state, instruments });
  });
  app.post("/api/policy", async (c) => {
    const input = z
      .object({
        perTrade: z.string().max(12),
        daily: z.string().max(12),
        paused: z.boolean(),
      })
      .parse(await c.req.json());
    const state = store.get(c.get("family"));
    if (state.role !== "parent")
      return c.json(
        { error: "This control belongs to the parent preview." },
        403,
      );
    const perTrade = parseDollars(input.perTrade),
      daily = parseDollars(input.daily);
    if (perTrade <= 0 || daily < perTrade)
      throw new DomainError(
        "The daily allowance must be at least the positive per-investment limit.",
      );
    state.policy = {
      ...state.policy,
      perTrade: String(perTrade),
      daily: String(daily),
      paused: input.paused,
      revision: state.policy.revision + 1,
    };
    store.set(state);
    return c.json({ ...state, instruments });
  });
  app.post("/api/memories", async (c) => {
    const input = z
      .object({
        kind: z.enum(["reflection", "correction"]),
        text: textSchema,
        decisionId: z.string().max(60).optional(),
        supersedes: z.string().max(60).optional(),
      })
      .parse(await c.req.json());
    const state = store.get(c.get("family"));
    if (
      input.decisionId &&
      !state.decisions.some((d) => d.id === input.decisionId)
    )
      throw new DomainError("That decision is not part of your sample family.");
    if (input.supersedes) {
      const previous = state.memories.find((m) => m.id === input.supersedes);
      if (!previous)
        throw new DomainError("That memory is not part of your sample family.");
      previous.active = false;
    }
    state.memories.unshift({
      id: randomUUID(),
      ...input,
      recordedAt: new Date().toISOString(),
      active: true,
      origin: "local",
    });
    store.set(state);
    return c.json({ ...state, instruments });
  });
  app.delete("/api/memories/:id", (c) => {
    const state = store.get(c.get("family"));
    state.memories = state.memories.filter((m) => m.id !== c.req.param("id"));
    store.set(state);
    return c.json({ ...state, instruments });
  });
  app.post("/api/guide", async (c) => {
    const { question } = z
      .object({ question: textSchema })
      .parse(await c.req.json());
    return c.json(
      localGuide(store.get(c.get("family")), instruments, question),
    );
  });
  app.get("/api/exercise", (c) => {
    const { correct: _, ...exercise } = nextExercise(
      store.get(c.get("family")),
    );
    return c.json(exercise);
  });
  app.post("/api/exercise", async (c) => {
    const { answer, concept } = z
      .object({ answer: z.number().int().min(0).max(2), concept: z.string() })
      .parse(await c.req.json());
    const state = store.get(c.get("family")),
      exercise = nextExercise(state);
    if (concept !== exercise.concept)
      throw new DomainError(
        "Your next lesson changed. Please reopen the question.",
      );
    const correct = answer === exercise.correct,
      recordedAt = new Date().toISOString();
    state.attempts.unshift({
      id: randomUUID(),
      concept: exercise.concept,
      answer,
      correct,
      recordedAt,
    });
    state.memories.unshift({
      id: randomUUID(),
      kind: "learning",
      text: `Answered “${exercise.options[answer]}” in a ${exercise.concept} exercise. ${correct ? "Matched the concept rubric." : "This concept needs another look."}`,
      recordedAt,
      active: true,
      origin: "local",
    });
    store.set(state);
    return c.json({
      correct,
      explanation: exercise.explanation,
      state: { ...state, instruments },
    });
  });
  app.get("/api/integrations", (c) =>
    c.json({
      mode: "local-demo",
      marketData: "authored-sample",
      chain: { connected: false, network: "testnet", provider: "Tatum" },
      memory: { connected: false, network: "mainnet", confirmed: 0 },
      coach: { mode: "deterministic-local", connected: false },
      storage: "local-sqlite",
      authentication: "sample-role-preview",
    }),
  );
  return app;
}
