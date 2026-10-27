import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InputError, parseDollars } from "../shared/model.ts";
import { localGuide, nextExercise } from "../shared/learning.ts";
import { DomainError, execute, preview } from "./domain.ts";
import { DemoStore } from "./store.ts";
import { Accounts, AccessError } from "./auth.ts";
import type { Member } from "./auth.ts";
import { LearningUnavailable } from "./learning-service.ts";
import type { LiveLearning } from "./learning-service.ts";
import type { DemoState } from "../shared/model.ts";
import { MarketService, marketStale } from "./market.ts";
import { ChainService } from "./chain.ts";

const textSchema = z.string().trim().min(1).max(1500);
type Environment = { Variables: { family: string; member: Member | null } };
export function createApp(
  store: DemoStore,
  options: {
    learning?: LiveLearning;
    market?: MarketService;
    chain?: ChainService;
    publicOrigin?: string;
  } = {},
) {
  const accounts = new Accounts(store);
  const market = options.market ?? new MarketService(store);
  const chain = options.chain ?? new ChainService(store, market);
  const app = new Hono<Environment>();
  const stateFor = (c: Context<Environment>) => {
    const state = store.get(c.get("family"));
    return { ...state, role: c.get("member")?.role ?? state.role };
  };
  const marketState = (state: DemoState) => {
    const currentMarket = market.latest();
    if (!state.portfolio && currentMarket && !marketStale(currentMarket.asOf)) {
      // Archive the old price basis before opening a fresh market-backed ledger.
      // Guest visitors receive the same real observations as signed-in families.
      market.enroll(state.id, true, true);
    }
    return market.advance(state.id);
  };
  const snapshot = (
    state: DemoState,
    c: Context<Environment>,
    member = c.get("member"),
  ) => {
    state = marketState(state);
    return {
      ...state,
      role: member?.role ?? state.role,
      instruments: market.instruments(state),
      market: market.status(state),
      portfolioHistory: market.history(state),
      chain: member ? chain.status(member) : undefined,
      session: {
        mode: member ? ("account" as const) : ("sample" as const),
        role: member?.role ?? state.role,
        username: member?.username,
        memoryEnabled: store.profile(state.id)?.memory_enabled === 1,
        servicesReady: Boolean(
          options.learning?.ready && options.learning?.coachReady,
        ),
      },
    };
  };
  const requireMember = (c: Context<Environment>, role?: Member["role"]) => {
    const member = c.get("member");
    if (!member || (role && member.role !== role))
      throw new AccessError(
        role === "parent"
          ? "Sign in with the parent account to use this control."
          : "Sign in to your account first.",
      );
    return member;
  };
  const learnerAction = (c: Context<Environment>) => {
    const member = c.get("member");
    if (member && member.role !== "learner")
      throw new AccessError(
        "Sign in with the learner account to record a practice choice.",
      );
    if (member)
      accounts.limit(`learning-writes:${member.family}`, 120, 86400_000);
  };
  const signIn = (
    c: Context<Environment>,
    result: { token: string; member: Member },
  ) => {
    setCookie(c, "trove_session", result.token, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 7 * 86400,
      secure:
        Boolean(options.publicOrigin?.startsWith("https:")) ||
        c.req.url.startsWith("https:"),
    });
    return c.json(snapshot(store.get(result.member.family), c, result.member));
  };
  app.use("*", secureHeaders());
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16_384,
      onError: (c) => c.json({ error: "This request is too large." }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      origin &&
      ![
        ...(options.publicOrigin ? [options.publicOrigin] : []),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      ].includes(origin)
    )
      return c.json({ error: "This request origin is not allowed." }, 403);
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("sec-fetch-site") === "cross-site"
    )
      return c.json({ error: "This request origin is not allowed." }, 403);
    c.header("Cache-Control", "no-store");
    const token = getCookie(c, "trove_session");
    const member = accounts.resolve(token);
    c.set("member", member);
    if (token && !member && !c.req.path.startsWith("/api/auth/")) {
      deleteCookie(c, "trove_session", { path: "/" });
      return c.json(
        { error: "Your session expired. Please sign in again." },
        401,
      );
    }
    if (member) {
      c.set("family", member.family);
      await next();
      return;
    }
    let family = getCookie(c, "trove_demo");
    if (!family || !/^[a-f0-9-]{36}$/.test(family) || store.profile(family)) {
      family = randomUUID();
      setCookie(c, "trove_demo", family, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        secure: Boolean(options.publicOrigin?.startsWith("https:")),
      });
    }
    c.set("family", family);
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof AccessError || error instanceof LearningUnavailable)
      return c.json({ error: error.message }, error.status);
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
  app.post("/api/auth/register", async (c) =>
    signIn(c, await accounts.register(await c.req.json())),
  );
  app.post("/api/auth/login", async (c) =>
    signIn(
      c,
      await accounts.login(await c.req.json(), getCookie(c, "trove_session")),
    ),
  );
  app.post("/api/auth/join", async (c) =>
    signIn(c, await accounts.join(await c.req.json())),
  );
  app.post("/api/auth/logout", (c) => {
    const token = getCookie(c, "trove_session");
    if (token) accounts.logout(token);
    deleteCookie(c, "trove_session", { path: "/" });
    const family = randomUUID();
    setCookie(c, "trove_demo", family, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 30 * 86400,
      secure: Boolean(options.publicOrigin?.startsWith("https:")),
    });
    return c.json(snapshot(store.get(family), c, null));
  });
  app.post("/api/account/invite", (c) =>
    c.json(accounts.invite(requireMember(c, "parent"))),
  );
  app.post("/api/account/memory", async (c) => {
    const member = requireMember(c, "parent");
    const { enabled } = z
      .object({ enabled: z.boolean() })
      .parse(await c.req.json());
    if (enabled && !options.learning?.ready)
      throw new LearningUnavailable(
        "Walrus Memory is not configured on this server yet.",
      );
    store.atomic(() => {
      store.db
        .prepare("UPDATE account_profiles SET memory_enabled=? WHERE family=?")
        .run(enabled ? 1 : 0, member.family);
      store.set(store.get(member.family));
    });
    return c.json(snapshot(store.get(member.family), c));
  });
  app.get("/api/state", (c) => c.json(snapshot(stateFor(c), c)));
  app.get("/api/chain/status", (c) => c.json(chain.status(requireMember(c))));
  app.get("/api/chain/transactions/:id", (c) => {
    const member = requireMember(c),
      id = z.uuid().parse(c.req.param("id"));
    const row = store.db
      .prepare("SELECT state,digest FROM chain_intents WHERE id=? AND family=?")
      .get(id, member.family) as { state: string; digest: string } | undefined;
    if (!row)
      throw new DomainError("This transaction is not part of your family.");
    return c.json(row);
  });
  app.post("/api/chain/challenge", async (c) => {
    const input = z.object({ address: z.string() }).parse(await c.req.json());
    return c.json(chain.challenge(requireMember(c), input.address));
  });
  app.post("/api/chain/link", async (c) => {
    const input = z
      .object({ id: z.uuid(), signature: z.string().max(3000) })
      .parse(await c.req.json());
    return c.json(
      await chain.link(requireMember(c), input.id, input.signature),
    );
  });
  app.post("/api/chain/prepare", async (c) =>
    c.json(await chain.prepare(requireMember(c), await c.req.json())),
  );
  app.post("/api/chain/submit", async (c) => {
    const input = z
      .object({ id: z.uuid(), signature: z.string().max(3000) })
      .parse(await c.req.json());
    const result = await chain.submit(
      requireMember(c),
      input.id,
      input.signature,
    );
    return c.json({ ...result, snapshot: snapshot(stateFor(c), c) });
  });
  app.post("/api/chain/cancel", async (c) => {
    const input = z.object({ id: z.uuid() }).parse(await c.req.json());
    chain.cancel(requireMember(c), input.id);
    return c.json(snapshot(stateFor(c), c));
  });
  app.post("/api/chain/reconcile", async (c) => {
    const member = requireMember(c);
    accounts.limit(`chain-recheck:${member.family}`, 6, 60_000);
    accounts.limit("chain-recheck:global", 30, 60_000);
    await chain.reconcilePending();
    return c.json(snapshot(stateFor(c), c));
  });
  app.post("/api/account/market", (c) => {
    const member = requireMember(c, "parent");
    chain.assertLocal(member.family);
    const state = market.enroll(member.family, true);
    return c.json(snapshot(state, c));
  });
  app.post("/api/preview-role", async (c) => {
    if (c.get("member"))
      throw new AccessError(
        "Account roles come from sign-in and cannot be switched in preview.",
      );
    const input = z
      .object({ role: z.enum(["learner", "parent"]) })
      .parse(await c.req.json());
    const state = stateFor(c);
    state.role = input.role;
    store.set(state);
    return c.json(snapshot(state, c));
  });
  app.post("/api/reset", (c) => {
    if (c.get("member"))
      throw new AccessError(
        "Reset applies only to the guest sample, not a saved family account.",
      );
    const state = store.reset(c.get("family"));
    return c.json(snapshot(state, c));
  });
  app.post("/api/orders/preview", async (c) => {
    learnerAction(c);
    const input = z
      .object({
        symbol: z.string().max(8),
        side: z.enum(["buy", "sell"]),
        amount: z.string().max(20),
        reason: z.string().max(1500).default(""),
      })
      .parse(await c.req.json());
    marketState(stateFor(c));
    if (chain.account(c.get("family"))) await chain.maintain(c.get("family"));
    const state = stateFor(c);
    market.assertTradable(state);
    const quote = preview(state, input, market.instruments(state));
    if (chain.account(state.id)) quote.expiresAt = await chain.quoteExpiry();
    store.putQuote(c.get("family"), quote);
    return c.json(quote);
  });
  app.post("/api/orders/execute", async (c) => {
    chain.assertLocal(c.get("family"));
    market.assertTradable(marketState(stateFor(c)));
    const { quoteId } = z
      .object({ quoteId: z.uuid() })
      .parse(await c.req.json());
    return c.json(
      snapshot(
        execute(store, c.get("family"), quoteId, c.get("member")?.role),
        c,
      ),
    );
  });
  app.post("/api/approvals", async (c) => {
    learnerAction(c);
    const { quoteId } = z
      .object({ quoteId: z.uuid() })
      .parse(await c.req.json());
    const { quote } = store.getQuote(c.get("family"), quoteId);
    if (Date.now() >= quote.expiresAt)
      throw new DomainError(
        "This order preview expired. Please review a fresh one.",
      );
    const state = stateFor(c);
    if (!state.approvals.some((a) => a.quote.id === quoteId))
      state.approvals.unshift({
        id: randomUUID(),
        quote,
        state: "requested",
        createdAt: new Date().toISOString(),
      });
    store.set(state);
    return c.json(snapshot(state, c));
  });
  app.post("/api/approvals/:id", async (c) => {
    const { approve } = z
      .object({ approve: z.boolean() })
      .parse(await c.req.json());
    const state = stateFor(c);
    if (state.role !== "parent")
      return c.json(
        { error: "This control belongs to the parent preview." },
        403,
      );
    const approval = state.approvals.find((a) => a.id === c.req.param("id"));
    if (approve) chain.assertLocal(state.id);
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
    return c.json(snapshot(state, c));
  });
  app.post("/api/policy", async (c) => {
    chain.assertLocal(c.get("family"));
    const input = z
      .object({
        perTrade: z.string().max(12),
        daily: z.string().max(12),
        paused: z.boolean(),
      })
      .parse(await c.req.json());
    const state = stateFor(c);
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
    return c.json(snapshot(state, c));
  });
  app.post("/api/memories", async (c) => {
    learnerAction(c);
    const input = z
      .object({
        kind: z.enum(["reflection", "correction"]),
        text: textSchema,
        decisionId: z.string().max(60).optional(),
        supersedes: z.string().max(60).optional(),
      })
      .parse(await c.req.json());
    const state = stateFor(c);
    if (
      input.decisionId &&
      !state.decisions.some((d) => d.id === input.decisionId)
    )
      throw new DomainError("That decision is not part of your sample family.");
    if (input.supersedes) {
      if (input.kind !== "correction")
        throw new DomainError("Only a correction can replace a saved thought.");
      const previous = state.memories.find((m) => m.id === input.supersedes);
      if (!previous)
        throw new DomainError("That memory is not part of your sample family.");
      if (!previous.active)
        throw new DomainError(
          "That thought has already been corrected. Correct its current version instead.",
        );
      if (input.decisionId && input.decisionId !== previous.decisionId)
        throw new DomainError(
          "A correction must stay linked to the original decision.",
        );
      input.decisionId = previous.decisionId;
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
    return c.json(snapshot(state, c));
  });
  app.delete("/api/memories/:id", (c) => {
    learnerAction(c);
    const state = stateFor(c);
    state.memories = state.memories.filter((m) => m.id !== c.req.param("id"));
    store.set(state);
    return c.json(snapshot(state, c));
  });
  app.post("/api/guide", async (c) => {
    const { question } = z
      .object({ question: textSchema })
      .parse(await c.req.json());
    const member = c.get("member");
    if (member) {
      if (member.role !== "learner")
        throw new AccessError(
          "Ask Trove is available from the learner account.",
        );
      accounts.limit(`coach:${member.family}`, 6, 60_000);
      accounts.limit("coach:global", 30, 60_000);
      if (store.profile(member.family)?.memory_enabled) {
        if (!options.learning?.coachReady)
          throw new LearningUnavailable(
            "The live guide is not configured yet.",
          );
        return c.json(await options.learning.explain(member.family, question));
      }
    }
    return c.json(
      localGuide(stateFor(c), market.instruments(stateFor(c)), question),
    );
  });
  app.get("/api/exercise", (c) => {
    const {
      correct: _,
      explanation: __,
      ...exercise
    } = nextExercise(stateFor(c));
    return c.json(exercise);
  });
  app.post("/api/exercise", async (c) => {
    learnerAction(c);
    const { answer, concept, variant } = z
      .object({
        answer: z.number().int().min(0).max(2),
        concept: z.string(),
        variant: z.string().optional(),
      })
      .parse(await c.req.json());
    const state = stateFor(c),
      exercise = nextExercise(state);
    if (
      concept !== exercise.concept ||
      (variant && variant !== exercise.variant) ||
      (!variant && exercise.phase === "transfer")
    )
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
      variant: exercise.variant,
      phase: exercise.phase,
    });
    state.memories.unshift({
      id: randomUUID(),
      kind: "learning",
      text: `Answered “${exercise.options[answer]}” in ${exercise.variant}. ${correct ? "Matched the concept rubric." : "This concept needs another look."}`,
      recordedAt,
      active: true,
      origin: "local",
    });
    store.set(state);
    return c.json({
      correct,
      explanation: exercise.explanation,
      state: snapshot(state, c),
    });
  });
  app.get("/api/integrations", (c) =>
    c.json({
      mode: c.get("member") ? "family-practice" : "local-demo",
      marketData: market.status(stateFor(c)),
      chain: {
        connected: Boolean(chain.config),
        network: "testnet",
        provider: "Tatum",
        account: chain.account(c.get("family"))?.object_id,
        pending: chain.pending(c.get("family")).length,
        confirmed: (
          store.db
            .prepare(
              "SELECT COUNT(*) AS n FROM chain_intents WHERE family=? AND state='confirmed'",
            )
            .get(c.get("family")) as { n: number }
        ).n,
      },
      memory: {
        connected: Boolean(options.learning?.ready),
        network: "mainnet",
        confirmed: store.memoryStatus(c.get("family")).confirmedMainnet,
      },
      localMemory: store.memoryStatus(c.get("family")),
      coach: {
        mode:
          c.get("member") &&
          store.profile(c.get("family"))?.memory_enabled &&
          options.learning?.coachReady
            ? "live"
            : "deterministic-local",
        connected: Boolean(options.learning?.coachReady),
      },
      storage: options.publicOrigin ? "persistent-sqlite" : "local-sqlite",
      authentication: c.get("member")
        ? "password-session"
        : "sample-role-preview",
    }),
  );
  app.get("/api/memory/status", (c) =>
    c.json(store.memoryStatus(c.get("family"))),
  );
  return app;
}
