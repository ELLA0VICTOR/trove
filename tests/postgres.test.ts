import { createApp } from "../server/app.ts";
import { practiceCapital } from "../shared/funding.ts";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Database, StateConflict, postgresSql } from "../server/database.ts";
import { DemoStore } from "../server/store.ts";
import { Accounts } from "../server/auth.ts";
import { preview, execute } from "../server/domain.ts";
import { CoachBudget, COACH_MODEL } from "../server/jobs/coach-budget.ts";
import { createRuntime } from "../server/runtime.ts";
import {
  createServerlessHandler,
  configuredOrigin,
} from "../server/serverless.ts";
import { MarketService } from "../server/market.ts";
import { instruments } from "../shared/fixtures.ts";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedHostedData } from "../server/bootstrap-data.ts";
import { AccountSignup } from "../server/account-signup.ts";
import { emailFixture, emailToken } from "./signup-helpers.ts";
import { AccountRecovery } from "../server/account-recovery.ts";

// PostgreSQL's actual parser/transaction engine; provider calls remain mocked/off.
const pg = await PGlite.create();
const database = new Database({
  driver: {
    async query(sql, parameters) {
      const result =
        !parameters?.length && sql.includes(";")
          ? (await pg.exec(sql)).at(-1)!
          : await pg.query<Record<string, unknown>>(sql, parameters);
      return {
        rows: (result.rows as Record<string, unknown>[]).map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              typeof value === "bigint" ? Number(value) : value,
            ]),
          ),
        ),
        rowCount: result.affectedRows,
      };
    },
    end: () => pg.close(),
  },
});
const store = new DemoStore(database, { liveMemory: true });
await database.ready;
after(async () => {
  await database.close();
});

test("PostgreSQL email identity and one-use password recovery survive fresh account services", async () => {
  const accounts = new Accounts(store);
  const registered = await accounts.register({
    username: "pg_email_" + randomUUID().slice(0, 7),
    password: "original-pg-password",
  });
  const work: Promise<unknown>[] = [];
  let message = "";
  const recovery = new AccountRecovery(store, {
    origin: "https://trove.example",
    defer: (p) => {
      work.push(p);
    },
    mail: {
      send: async (input) => {
        message = input.text;
        return "accepted";
      },
    },
  });
  const email = randomUUID() + "@example.com";
  const token = () =>
    new URLSearchParams(
      new URL(message.match(/https:\/\/[^\s]+/)![0]).hash.slice(1),
    ).get("token")!;
  await recovery.requestVerification(registered.member, {
    email,
    password: "original-pg-password",
  });
  await Promise.all(work);
  await recovery.verify(token());
  const fresh = new Accounts(new DemoStore(database));
  assert.equal(
    (await fresh.login({ identifier: email, password: "original-pg-password" }))
      .member.id,
    registered.member.id,
  );
  await recovery.requestReset({ identifier: email });
  await Promise.all(work);
  const resetToken = token();
  const results = await Promise.allSettled([
    recovery.reset({ token: resetToken, password: "replacement-pg-password" }),
    recovery.reset({ token: resetToken, password: "different-pg-password" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await fresh.resolve(registered.token), null);
});

test("hosted preparation preserves cumulative AI costs across repeat imports", async () => {
  const directory = mkdtempSync(join(tmpdir(), "trove-bootstrap-"));
  const filename = join(directory, "coach-usage.sqlite");
  const local = new Database({ filename });
  const id = randomUUID();
  try {
    await local
      .prepare(
        "INSERT INTO coach_usage(id,model,state,reserved_nano,estimated_nano,created_at) VALUES(?,?,'settled',?,?,?)",
      )
      .run(id, COACH_MODEL, 20000, 10000, new Date().toISOString());
    await seedHostedData(database, directory);
    await database
      .prepare("UPDATE coach_usage SET estimated_nano=? WHERE id=?")
      .run(15000, id);
    await seedHostedData(database, directory);
    assert.equal(
      (await database
        .prepare("SELECT estimated_nano FROM coach_usage WHERE id=?")
        .get(id))!.estimated_nano,
      15000,
    );
    await local
      .prepare("UPDATE coach_usage SET estimated_nano=? WHERE id=?")
      .run(18000, id);
    await seedHostedData(database, directory);
    assert.equal(
      (await database
        .prepare("SELECT estimated_nano FROM coach_usage WHERE id=?")
        .get(id))!.estimated_nano,
      18000,
    );
    assert.equal(
      (await database
        .prepare("SELECT COUNT(*) AS n FROM coach_usage WHERE id=?")
        .get(id))!.n,
      1,
    );
  } finally {
    await database.prepare("DELETE FROM coach_usage WHERE id=?").run(id);
    await local.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(filename + suffix, { force: true });
    rmdirSync(directory);
  }
});

test("PostgreSQL schema uses 64-bit epochs, bound placeholders, JSON scope and SQL transactions", async () => {
  const family = randomUUID(),
    state = await store.get(family);
  assert.equal(database.kind, "postgres");
  assert.ok(Date.now() > 2147483647);
  await database
    .prepare("INSERT INTO request_limits VALUES(?,?,?)")
    .run(randomUUID(), 1, Date.now());
  assert.equal(
    postgresSql("SELECT '?' AS literal WHERE x=? AND y='it''s ?'"),
    "SELECT '?' AS literal WHERE x=$1 AND y='it''s ?'",
  );
  state.memories = [
    {
      id: randomUUID(),
      kind: "reflection",
      text: "Keep the original thought.",
      recordedAt: new Date().toISOString(),
      active: true,
      origin: "local",
    },
  ];
  await store.set(state);
  assert.equal((await store.memoryStatus(family)).heldLocally, 1);
  await assert.rejects(
    () =>
      store.atomic(async () => {
        const update = await store.get(family);
        update.cash = "0";
        await store.set(update);
        throw new Error("rollback");
      }),
    /rollback/,
  );
  assert.equal((await store.get(family)).cash, state.cash);
});

test("PostgreSQL stale writers cannot overwrite balances or leave memory jobs behind", async () => {
  const family = randomUUID();
  await store.get(family);
  const [first, second] = await Promise.all([
    store.get(family),
    store.get(family),
  ]);
  first.cash = "123000000";
  await store.set(first);
  const memory = randomUUID();
  second.memories.push({
    id: memory,
    kind: "reflection",
    text: "A stale update.",
    recordedAt: new Date().toISOString(),
    active: true,
    origin: "local",
  });
  await assert.rejects(() => store.set(second), StateConflict);
  const state = await store.get(family);
  assert.equal(state.cash, first.cash);
  assert.ok(!state.memories.some((m) => m.id === memory));
  assert.ok(
    !(await store.memoryStatus(family)).records.some((m) => m.id === memory),
  );
});

test("PostgreSQL family invitations are consumed once across concurrent join attempts", async () => {
  const accounts = new Accounts(store),
    parent = await accounts.register({
      username: "pg_parent_" + randomUUID().slice(0, 7),
      password: "postgres-test-password",
    });
  const invite = await accounts.invite(parent.member);
  const results = await Promise.allSettled([
    accounts.join({
      code: invite.code,
      username: "pg_kid_" + randomUUID().slice(0, 7),
      password: "postgres-test-password",
    }),
    accounts.join({
      code: invite.code,
      username: "pg_kid_" + randomUUID().slice(0, 7),
      password: "postgres-test-password",
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await database
      .prepare("SELECT COUNT(*) AS n FROM account_members WHERE family=?")
      .get(parent.member.family))!.n,
    2,
  );
});

test("PostgreSQL duplicate concurrent order executions post one debit and journal event", async () => {
  const family = randomUUID(),
    state = await store.get(family);
  const quote = preview(state, {
    symbol: "AAPL",
    side: "buy",
    amount: "25",
    reason: "Learn before changing my allocation.",
  });
  await store.putQuote(family, quote);
  const before = BigInt(state.cash);
  await Promise.all([
    execute(store, family, quote.id),
    execute(store, family, quote.id),
  ]);
  const after = await store.get(family);
  assert.equal(BigInt(after.cash), before - BigInt(quote.amount));
  assert.equal(
    after.decisions.filter((d) => d.reason === quote.reason).length,
    1,
  );
});

test("PostgreSQL coach reservations serialize the shared budget without an external model request", async () => {
  const first = new CoachBudget(database, "0.01"),
    second = new CoachBudget(database, "0.01");
  const results = await Promise.allSettled([
    first.reserve(COACH_MODEL, 50000, 100),
    second.reserve(COACH_MODEL, 50000, 100),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await first.total(), 5050000);
});

test("PostgreSQL parent approval completes the learner trade once across fresh API instances", async () => {
  const accounts = new Accounts(store);
  const parent = await accounts.register({
    username: "pg_approve_" + randomUUID().slice(0, 8),
    password: "postgres-approval-password",
  });
  const invitation = await accounts.invite(parent.member);
  const learner = await accounts.join({
    code: invitation.code,
    username: "pg_learner_" + randomUUID().slice(0, 8),
    password: "postgres-learner-password",
  });
  const first = createApp(store);
  const second = createApp(new DemoStore(database, { liveMemory: true }));
  const headers = (token: string) => ({
    "Content-Type": "application/json",
    Cookie: `trove_session=${token}`,
  });
  const quoteResponse = await first.request("/api/orders/preview", {
    method: "POST",
    headers: headers(learner.token),
    body: JSON.stringify({
      symbol: "KO",
      side: "buy",
      amount: "150",
      reason: "A parent-approved industry comparison.",
    }),
  });
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  const requested = await first.request("/api/approvals", {
    method: "POST",
    headers: headers(learner.token),
    body: JSON.stringify({ quoteId: quote.id }),
  });
  assert.equal(requested.status, 200);
  const pending = await requested.json();
  const approve = (app: ReturnType<typeof createApp>) =>
    app.request(`/api/approvals/${pending.approvals[0].id}`, {
      method: "POST",
      headers: headers(parent.token),
      body: JSON.stringify({ approve: true }),
    });
  const replies = await Promise.all([approve(first), approve(second)]);
  assert.deepEqual(
    replies.map((r) => r.status),
    [200, 200],
  );
  const current = await new DemoStore(database).get(parent.member.family);
  assert.equal(current.cash, String(1000000000n - BigInt(quote.amount)));
  assert.equal(current.sequence, 1);
  assert.equal(current.approvals[0].state, "consumed");
  assert.equal(current.policy.perTrade, pending.policy.perTrade);
  assert.equal(current.decisions.length, 1);
  assert.equal(current.memories.length, 1);
});

test("PostgreSQL immutable memory operations survive publisher reconstruction and repeated confirmation", async () => {
  const accounts = new Accounts(store),
    parent = await accounts.register({
      username: "pg_memory_" + randomUUID().slice(0, 7),
      password: "postgres-test-password",
    });
  await database
    .prepare("UPDATE account_profiles SET memory_enabled=1 WHERE family=?")
    .run(parent.member.family);
  const state = await store.get(parent.member.family),
    id = randomUUID();
  state.memories.push({
    id,
    kind: "reflection",
    text: "Diversification includes shared exposure.",
    active: true,
    origin: "local",
    recordedAt: new Date().toISOString(),
  });
  await store.set(state);
  let submits = 0;
  const gateway = {
    submit: async () => {
      submits++;
      return "pg-memory-job";
    },
    status: async () => ({
      state: "confirmed" as const,
      blobId: "pg-confirmed-blob",
    }),
  };
  await store.memoryOutbox.processOne(gateway, Date.now());
  const restarted = new DemoStore(database, { liveMemory: true });
  await restarted.memoryOutbox.processOne(gateway, Date.now() + 5000);
  await restarted.memoryOutbox.processOne(gateway, Date.now() + 10000);
  assert.equal(submits, 1);
  assert.equal(
    (await restarted.get(state.id)).memories.find((m) => m.id === id)!.blobId,
    "pg-confirmed-blob",
  );
});

test("Vercel handler restores PostgreSQL sessions across fresh runtimes and defers maintenance", async () => {
  const previous = process.env.TROVE_LIVE_SERVICES;
  process.env.TROVE_LIVE_SERVICES = "0";
  const work: Promise<unknown>[] = [];
  const runtime = () => createRuntime({ database, serverless: true });
  const handler = createServerlessHandler({
    runtime,
    defer: (promise) => {
      work.push(promise);
    },
    origin: "https://trove-test.vercel.app",
  });
  try {
    const username = "pg_vercel_" + randomUUID().slice(0, 7);
    await new Accounts(new DemoStore(database)).register({
      username,
      password: "postgres-test-password",
    });
    const response = await handler.fetch(
      new Request(
        "https://trove-test.vercel.app/api/index?__trove_path=auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://trove-test.vercel.app",
          },
          body: JSON.stringify({
            username,
            password: "postgres-test-password",
          }),
        },
      ),
    );
    assert.equal(response.status, 200);
    const snapshot = await response.json(),
      cookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith("trove_session="))!
        .split(";")[0];
    assert.ok(response.headers.get("set-cookie")!.includes("Secure"));
    await Promise.all(work);
    const fresh = createServerlessHandler({
      runtime,
      defer: (p) => {
        work.push(p);
      },
      origin: "https://trove-test.vercel.app",
    });
    const recovered = await fresh.fetch(
      new Request("https://trove-test.vercel.app/api/state", {
        headers: { Cookie: cookie },
      }),
    );
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).id, snapshot.id);
    await Promise.all(work);
    assert.equal(
      (await fresh.fetch(new Request("https://trove-test.vercel.app/health")))
        .status,
      200,
    );
    assert.equal(
      (
        await fresh.fetch(
          new Request("https://trove-test.vercel.app/api/policy", {
            method: "POST",
            headers: {
              Cookie: cookie,
              Origin: "https://untrusted.example",
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      configuredOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "trove.vercel.app" }),
      "https://trove.vercel.app",
    );
  } finally {
    if (previous === undefined) delete process.env.TROVE_LIVE_SERVICES;
    else process.env.TROVE_LIVE_SERVICES = previous;
    await Promise.all(work);
  }
});

test("PostgreSQL real-price snapshots and passive adjustments retain their shared SQL semantics", async () => {
  const date = new Date().toISOString().slice(0, 10),
    prior = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const market = new MarketService(store, {
    histories: async () =>
      instruments.map((i) => ({
        symbol: i.symbol,
        provider: "Marketstack",
        basis: "raw-close",
        receivedAt: new Date().toISOString(),
        excluded: 0,
        prices: [
          {
            date: prior,
            price: "100000000",
            adjustedPrice: "50000000",
            sourceTimestamp: prior,
            splitFactor: 1,
            dividend: 0,
          },
          {
            date,
            price: "50000000",
            adjustedPrice: "50000000",
            sourceTimestamp: date,
            splitFactor: i.symbol === "AAPL" ? 2 : 1,
            dividend: i.symbol === "AAPL" ? 1 : 0,
          },
        ],
      })),
  });
  await market.refresh();
  const family = randomUUID();
  const state = await market.enroll(family, true, true);
  assert.equal(
    (await market.instruments(state))[0].prices.at(-1)!.price,
    "50000000",
  );
  assert.equal((await market.status(state)).mode, "market");
  assert.equal((await market.history(state))!.at(-1)!.value, 1000);
  const next = structuredClone((await market.latest())!);
  next.id = randomUUID();
  next.receivedAt = new Date(Date.now() + 1000).toISOString();
  await database
    .prepare("INSERT INTO market_snapshots VALUES(?,?,?,?)")
    .run(next.id, next.asOf, next.receivedAt, JSON.stringify(next));
  const advanced = await market.advance(family);
  assert.equal(advanced.portfolio!.datasetId, next.id);
  assert.equal(advanced.sequence, state.sequence + 1);
});

test("PostgreSQL email signup creates one verified account and retains renamed sessions across stores", async () => {
  const store = new DemoStore(database),
    email = emailFixture();
  const signup = new AccountSignup(store, {
    mail: email.mail,
    defer: email.defer,
    origin: "https://trove.example",
  });
  const address = `pg_signup_${randomUUID().slice(0, 8)}@example.com`;
  await signup.request({
    email: address,
    password: "postgres-signup-password",
  });
  await email.flush();
  const token = emailToken(email.sent.at(-1)!.text);
  const results = await Promise.allSettled([
    signup.complete({ token }),
    signup.complete({ token }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const result = results.find((result) => result.status === "fulfilled")!;
  assert.equal(result.status, "fulfilled");
  if (result.status !== "fulfilled") return;
  const accounts = new Accounts(store),
    username = "pg_renamed_" + randomUUID().slice(0, 7);
  await accounts.rename(result.value.member, { username });
  const fresh = new Accounts(new DemoStore(database));
  assert.equal((await fresh.resolve(result.value.token))!.username, username);
  assert.equal(
    (
      await fresh.login({
        identifier: address,
        password: "postgres-signup-password",
      })
    ).member.id,
    result.value.member.id,
  );
  assert.equal(
    (
      await fresh.login({
        identifier: username,
        password: "postgres-signup-password",
      })
    ).member.id,
    result.value.member.id,
  );
});

test("PostgreSQL parent refills survive restart and duplicate submissions credit the shared cash once", async () => {
  const store = new DemoStore(database),
    accounts = new Accounts(store);
  const parent = await accounts.register({
    username: "pg_fund_" + randomUUID().slice(0, 8),
    password: "postgres-funding-password",
  });
  const app = createApp(store),
    id = randomUUID();
  const add = () =>
    app.request("/api/account/funds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `trove_session=${parent.token}`,
      },
      body: JSON.stringify({ id, amount: "4000" }),
    });
  const replies = await Promise.all([add(), add()]);
  assert.ok(replies.every((reply) => reply.status === 200));
  const after = await new DemoStore(database).get(parent.member.family);
  assert.equal(after.cash, "5000000000");
  assert.equal(after.funding!.length, 1);
  assert.equal(practiceCapital(after), 5000000000n);
});
