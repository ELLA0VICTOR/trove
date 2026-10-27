import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InputError, parseDollars } from "../shared/model.ts";
import { localGuide, nextExercise } from "../shared/learning.ts";
import { DomainError, preview } from "./domain.ts";
import { DemoStore } from "./store.ts";
import { Accounts, AccessError } from "./auth.ts";
import type { Member } from "./auth.ts";
import { LearningUnavailable } from "./learning-service.ts";
import type { LiveLearning } from "./learning-service.ts";
import type { DemoState } from "../shared/model.ts";
import { MarketService } from "./market.ts";
import { ChainService } from "./chain.ts";
import { StateConflict } from "./database.ts";
import { AccountRecovery } from "./account-recovery.ts";
import { AccountSignup } from "./account-signup.ts";
import { applyFunding, fundingAmount } from "../shared/funding.ts";
import type { AccountMail } from "./integrations/account-mail.ts";
const textSchema = z.string().trim().min(1).max(1500);
type Environment = {
  Variables: {
    family: string;
    member: Member | null;
  };
};
export function createApp(
  store: DemoStore,
  options: {
    learning?: LiveLearning;
    market?: MarketService;
    chain?: ChainService;
    publicOrigin?: string;
    afterRequest?: () => void;
    mail?: AccountMail;
    defer?: (work: Promise<unknown>) => void;
  } = {},
) {
  const accounts = new Accounts(store);
  const recovery = new AccountRecovery(store, {
    mail: options.mail,
    origin: options.publicOrigin ?? "http://127.0.0.1:5173",
    defer: options.defer,
  });
  const signup = new AccountSignup(store, {
    mail: options.mail,
    origin: options.publicOrigin ?? "http://127.0.0.1:5173",
    defer: options.defer,
  });
  const market = options.market ?? new MarketService(store);
  const chain = options.chain ?? new ChainService(store, market);
  const app = new Hono<Environment>();
  const stateFor = async (c: Context<Environment>) => {
    const state = await store.get(c.get("family"));
    return { ...state, role: c.get("member")?.role ?? state.role };
  };
  const marketState = async (state: DemoState) => {
    const currentMarket = await market.latest();
    if (!state.portfolio && !currentMarket && market.gateway)
      throw new DomainError(
        "Market prices are temporarily unavailable. Please try again shortly.",
      );
    if (!state.portfolio && currentMarket) {
      // Archive the old price basis before opening a fresh market-backed ledger.
      // Guest visitors receive the same real observations as signed-in families.
      await market.enroll(state.id, true, true, true);
    }
    return await market.advance(state.id);
  };
  const snapshot = async (
    state: DemoState,
    c: Context<Environment>,
    member = c.get("member"),
  ) => {
    state = await marketState(state);
    return {
      ...state,
      ...(!member
        ? {
            cash: "0",
            holdings: [],
            decisions: [],
            memories: [],
            approvals: [],
            adjustments: [],
            funding: [],
          }
        : {}),
      role: member?.role ?? state.role,
      instruments: await market.instruments(state),
      market: await market.status(state),
      portfolioHistory: member ? await market.history(state) : undefined,
      chain: member ? await chain.status(member) : undefined,
      session: {
        mode: member ? ("account" as const) : ("sample" as const),
        role: member?.role ?? state.role,
        username: member?.username,
        memoryEnabled: (await store.profile(state.id))?.memory_enabled === 1,
        servicesReady: Boolean(
          options.learning?.ready && options.learning?.coachReady,
        ),
        recovery: member
          ? await recovery.status(member)
          : { ready: recovery.ready },
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
  const learnerAction = async (c: Context<Environment>) => {
    const member = c.get("member");
    if (member && member.role !== "learner")
      throw new AccessError(
        "Sign in with the learner account to record a practice choice.",
      );
    if (member)
      await accounts.limit(`learning-writes:${member.family}`, 120, 86400000);
  };
  const signIn = async (
    c: Context<Environment>,
    result: {
      token: string;
      member: Member;
    },
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
    return c.json(
      await snapshot(await store.get(result.member.family), c, result.member),
    );
  };
  app.use("*", secureHeaders());
  app.use("/api/*", async (c, next) => {
    await next();
    if (c.get("family")) options.afterRequest?.();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16384,
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
    const member = await accounts.resolve(token);
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
    if (
      !family ||
      !/^[a-f0-9-]{36}$/.test(family) ||
      (await store.profile(family))
    ) {
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
    if (
      error instanceof StateConflict ||
      ["40001", "40P01", "23505"].includes(
        (error as { code?: string }).code ?? "",
      )
    )
      return c.json(
        {
          error:
            "This account changed in another request. Refresh and try again.",
        },
        409,
      );
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
  app.post("/api/auth/register", async (c) => {
    await signup.request(await c.req.json());
    return c.json(
      {
        message:
          "Check your inbox for a verification link. If you already have an account, sign in instead.",
      },
      202,
    );
  });
  app.post("/api/auth/signup-details", async (c) =>
    c.json(await signup.details(await c.req.json())),
  );
  app.post("/api/auth/complete-signup", async (c) => {
    const result = await signup.complete(await c.req.json());
    const previous = getCookie(c, "trove_session");
    if (previous) await accounts.logout(previous);
    return signIn(c, result);
  });
  app.post(
    "/api/auth/login",
    async (c) =>
      await signIn(
        c,
        await accounts.login(await c.req.json(), getCookie(c, "trove_session")),
      ),
  );
  app.post("/api/auth/join", async (c) => {
    await signup.request(await c.req.json(), true);
    return c.json(
      {
        message:
          "Check your inbox for a verification link to join your family.",
      },
      202,
    );
  });
  app.post("/api/account/username", async (c) => {
    const member = await accounts.rename(requireMember(c), await c.req.json());
    return c.json(await snapshot(await stateFor(c), c, member));
  });
  app.post("/api/account/email", async (c) => {
    const member = requireMember(c);
    await recovery.requestVerification(member, await c.req.json());
    return c.json(await snapshot(await stateFor(c), c));
  });
  app.post("/api/auth/forgot-password", async (c) => {
    await recovery.requestReset(await c.req.json());
    return c.json(
      {
        message:
          "If an eligible account matches, a password-reset link will be sent to its verified recovery email. Learner recovery may be sent to the parent's verified email.",
      },
      202,
    );
  });
  app.post("/api/auth/verify-email", async (c) => {
    const { token } = z.object({ token: z.string() }).parse(await c.req.json());
    await recovery.verify(token);
    return c.json({ ok: true });
  });
  app.post("/api/auth/reset-password", async (c) => {
    await recovery.reset(await c.req.json());
    deleteCookie(c, "trove_session", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/auth/logout", async (c) => {
    const token = getCookie(c, "trove_session");
    if (token) await accounts.logout(token);
    deleteCookie(c, "trove_session", { path: "/" });
    const family = randomUUID();
    setCookie(c, "trove_demo", family, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 30 * 86400,
      secure: Boolean(options.publicOrigin?.startsWith("https:")),
    });
    return c.json(await snapshot(await store.get(family), c, null));
  });
  app.post("/api/account/invite", async (c) =>
    c.json(await accounts.invite(requireMember(c, "parent"))),
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
    await store.atomic(async () => {
      await store.db
        .prepare("UPDATE account_profiles SET memory_enabled=? WHERE family=?")
        .run(enabled ? 1 : 0, member.family);
      await store.set(await store.get(member.family));
    });
    return c.json(await snapshot(await store.get(member.family), c));
  });
  app.get("/api/state", async (c) =>
    c.json(await snapshot(await stateFor(c), c)),
  );
  app.get("/api/chain/status", async (c) =>
    c.json(await chain.status(requireMember(c))),
  );
  app.get("/api/chain/transactions/:id", async (c) => {
    const member = requireMember(c),
      id = z.uuid().parse(c.req.param("id"));
    const row = (await store.db
      .prepare("SELECT state,digest FROM chain_intents WHERE id=? AND family=?")
      .get(id, member.family)) as
      | {
          state: string;
          digest: string;
        }
      | undefined;
    if (!row)
      throw new DomainError("This transaction is not part of your family.");
    return c.json(row);
  });
  app.post("/api/chain/challenge", async (c) => {
    const input = z.object({ address: z.string() }).parse(await c.req.json());
    return c.json(await chain.challenge(requireMember(c), input.address));
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
    return c.json({
      ...result,
      snapshot: await snapshot(await stateFor(c), c),
    });
  });
  app.post("/api/chain/cancel", async (c) => {
    const input = z.object({ id: z.uuid() }).parse(await c.req.json());
    await chain.cancel(requireMember(c), input.id);
    return c.json(await snapshot(await stateFor(c), c));
  });
  app.post("/api/chain/reconcile", async (c) => {
    const member = requireMember(c);
    await accounts.limit(`chain-recheck:${member.family}`, 6, 60000);
    await accounts.limit("chain-recheck:global", 30, 60000);
    await chain.reconcilePending();
    return c.json(await snapshot(await stateFor(c), c));
  });
  app.post("/api/account/market", async (c) => {
    const member = requireMember(c, "parent");
    await chain.assertLocal(member.family);
    const state = await market.enroll(member.family, true);
    return c.json(await snapshot(state, c));
  });
  app.post("/api/account/funds", async (c) => {
    const member = requireMember(c, "parent");
    const { id, amount } = z
      .object({ id: z.uuid(), amount: z.string().max(20) })
      .parse(await c.req.json());
    const units = fundingAmount(amount);
    await accounts.limit(`practice-funds:${member.family}`, 30, 3600000);
    await store.atomic(async () => {
      await store.db.lock(`chain-authority:${member.family}`);
      await chain.assertLocal(member.family);
      const state = await store.get(member.family);
      if (
        applyFunding(state, {
          id,
          amount: String(units),
          recordedAt: new Date().toISOString(),
        })
      )
        await store.set(state);
    });
    return c.json(await snapshot(await stateFor(c), c));
  });
  app.post("/api/preview-role", async () => {
    throw new AccessError(
      "Account roles come from sign-in. Sign in with the parent or learner account.",
    );
  });
  app.post("/api/reset", async (c) => {
    if (c.get("member"))
      throw new AccessError(
        "Reset applies only to the guest sample, not a saved family account.",
      );
    const state = await store.reset(c.get("family"));
    return c.json(await snapshot(state, c));
  });
  app.post("/api/orders/preview", async (c) => {
    requireMember(c, "learner");
    await learnerAction(c);
    const input = z
      .object({
        symbol: z.string().max(8),
        side: z.enum(["buy", "sell"]),
        amount: z.string().max(20),
        reason: z.string().max(1500).default(""),
      })
      .parse(await c.req.json());
    await marketState(await stateFor(c));
    if (await chain.account(c.get("family")))
      await chain.maintain(c.get("family"));
    const state = await stateFor(c);
    await market.assertTradable(state);
    const quote = preview(state, input, await market.instruments(state));
    if (await chain.account(state.id))
      quote.expiresAt = await chain.quoteExpiry();
    await store.putQuote(c.get("family"), quote);
    return c.json(quote);
  });
  app.post("/api/orders/execute", async (c) => {
    requireMember(c, "learner");
    throw new DomainError(
      "Practice trades require your wallet signature. Complete family setup on Home, then confirm the trade with your wallet.",
    );
  });
  app.post("/api/approvals", async (c) => {
    const member = requireMember(c, "learner");
    await learnerAction(c);
    if (
      !chain.config ||
      !(await chain.account(member.family)) ||
      !(await chain.status(member)).learnerBound
    )
      throw new DomainError(
        "Complete family wallet setup on Home before requesting a trade.",
      );
    const { quoteId } = z
      .object({ quoteId: z.uuid() })
      .parse(await c.req.json());
    const state = await store.atomic(async () => {
      await store.db.lock(`chain-authority:${member.family}`);
      const state = await store.get(member.family);
      const { quote, decision } = await store.getQuote(member.family, quoteId);
      if (state.approvals.some((a) => a.quote.id === quoteId)) return state;
      if (decision || Date.now() >= quote.expiresAt)
        throw new DomainError(
          "This order preview expired or was completed. Please review a fresh one.",
        );
      if (
        quote.revision !== state.policy.revision ||
        quote.sequence !== state.sequence ||
        quote.portfolioId !== state.portfolio?.id ||
        quote.datasetId !== state.portfolio?.datasetId
      )
        throw new DomainError(
          "Your account changed. Please review a fresh order.",
        );
      state.approvals.unshift({
        id: randomUUID(),
        quote,
        state: "requested",
        createdAt: new Date().toISOString(),
      });
      await store.set(state);
      return state;
    });
    return c.json(await snapshot(state, c));
  });
  app.post("/api/approvals/:id", async (c) => {
    const member = requireMember(c, "parent");
    const { approve } = z
      .object({ approve: z.boolean() })
      .parse(await c.req.json());
    if (approve)
      throw new DomainError("Approve this choice with your parent wallet.");
    const state = await store.atomic(async () => {
      await store.db.lock(`chain-authority:${member.family}`);
      const current = await store.get(member.family);
      const approval = current.approvals.find(
        (a) => a.id === c.req.param("id"),
      );
      if (!approval || approval.state !== "requested")
        throw new DomainError("This request is no longer awaiting approval.");
      approval.state = "declined";
      await store.set(current);
      return current;
    });
    return c.json(await snapshot(state, c));
  });
  app.post("/api/policy", async (c) => {
    requireMember(c, "parent");
    await chain.assertLocal(c.get("family"));
    const input = z
      .object({
        perTrade: z.string().max(12),
        daily: z.string().max(12),
        paused: z.boolean(),
      })
      .parse(await c.req.json());
    const state = await stateFor(c);
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
    await store.set(state);
    return c.json(await snapshot(state, c));
  });
  app.post("/api/memories", async (c) => {
    requireMember(c, "learner");
    await learnerAction(c);
    const input = z
      .object({
        kind: z.enum(["reflection", "correction"]),
        text: textSchema,
        decisionId: z.string().max(60).optional(),
        supersedes: z.string().max(60).optional(),
      })
      .parse(await c.req.json());
    const state = await stateFor(c);
    if (
      input.decisionId &&
      !state.decisions.some((d) => d.id === input.decisionId)
    )
      throw new DomainError("That decision is not part of your family.");
    if (input.supersedes) {
      if (input.kind !== "correction")
        throw new DomainError("Only a correction can replace a saved thought.");
      const previous = state.memories.find((m) => m.id === input.supersedes);
      if (!previous)
        throw new DomainError("That memory is not part of your family.");
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
    await store.set(state);
    return c.json(await snapshot(state, c));
  });
  app.delete("/api/memories/:id", async (c) => {
    requireMember(c, "learner");
    await learnerAction(c);
    const state = await stateFor(c);
    state.memories = state.memories.filter((m) => m.id !== c.req.param("id"));
    await store.set(state);
    return c.json(await snapshot(state, c));
  });
  app.post("/api/guide", async (c) => {
    const member = requireMember(c, "learner");
    const { question } = z
      .object({ question: textSchema })
      .parse(await c.req.json());
    if (member) {
      if (member.role !== "learner")
        throw new AccessError(
          "Ask Trove is available from the learner account.",
        );
      await accounts.limit(`coach:${member.family}`, 6, 60000);
      await accounts.limit("coach:global", 30, 60000);
      if ((await store.profile(member.family))?.memory_enabled) {
        if (!options.learning?.coachReady)
          throw new LearningUnavailable(
            "The live guide is not configured yet.",
          );
        return c.json(await options.learning.explain(member.family, question));
      }
    }
    return c.json(
      localGuide(
        await stateFor(c),
        await market.instruments(await stateFor(c)),
        question,
      ),
    );
  });
  app.get("/api/exercise", async (c) => {
    const {
      correct: _,
      explanation: __,
      ...exercise
    } = nextExercise(await stateFor(c));
    return c.json(exercise);
  });
  app.post("/api/exercise", async (c) => {
    await learnerAction(c);
    const { answer, concept, variant } = z
      .object({
        answer: z.number().int().min(0).max(2),
        concept: z.string(),
        variant: z.string().optional(),
      })
      .parse(await c.req.json());
    const state = await stateFor(c),
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
    await store.set(state);
    return c.json({
      correct,
      explanation: exercise.explanation,
      state: await snapshot(state, c),
    });
  });
  app.get("/api/integrations", async (c) =>
    c.json({
      mode: c.get("member") ? "family-practice" : "local-demo",
      marketData: await market.status(await stateFor(c)),
      chain: {
        connected: Boolean(chain.config),
        network: "testnet",
        provider: "Tatum",
        packageId: chain.config?.packageId,
        fundingReady: Boolean(chain.config?.fundingReady),
        enrollmentReady: Boolean(chain.config?.enrollmentReady),
        account: (await chain.account(c.get("family")))?.object_id,
        pending: (await chain.pending(c.get("family"))).length,
        confirmed: (
          (await store.db
            .prepare(
              "SELECT COUNT(*) AS n FROM chain_intents WHERE family=? AND state='confirmed'",
            )
            .get(c.get("family"))) as {
            n: number;
          }
        ).n,
      },
      memory: {
        connected: Boolean(options.learning?.ready),
        network: "mainnet",
        confirmed: (await store.memoryStatus(c.get("family"))).confirmedMainnet,
      },
      localMemory: await store.memoryStatus(c.get("family")),
      coach: {
        mode:
          c.get("member") &&
          (await store.profile(c.get("family")))?.memory_enabled &&
          options.learning?.coachReady
            ? "live"
            : "deterministic-local",
        connected: Boolean(options.learning?.coachReady),
      },
      storage: store.db.kind === "postgres" ? "postgresql" : "local-sqlite",
      authentication: c.get("member")
        ? "password-session"
        : "sample-role-preview",
    }),
  );
  app.get("/api/memory/status", async (c) =>
    c.json(await store.memoryStatus(c.get("family"))),
  );
  return app;
}
