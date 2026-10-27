import test from "node:test";
import assert from "node:assert/strict";
import { DemoStore } from "../server/store.ts";
import { Accounts, digest } from "../server/auth.ts";
import { AccountSignup } from "../server/account-signup.ts";
import { AccountRecovery } from "../server/account-recovery.ts";
import { createApp } from "../server/app.ts";
import { emailFixture, emailToken } from "./signup-helpers.ts";

const password = "new-private-test-password";
function setup() {
  const store = new DemoStore(":memory:");
  const email = emailFixture();
  const options = {
    mail: email.mail,
    defer: email.defer,
    origin: "https://trove.example",
  };
  const signup = new AccountSignup(store, options);
  const accounts = new Accounts(store);
  const app = createApp(store, { ...options, publicOrigin: options.origin });
  return { store, email, signup, accounts, app, options };
}
async function challenge(
  f: ReturnType<typeof setup>,
  email = "new@example.com",
  code?: string,
) {
  await f.signup.request({ email, ...(code ? { code } : {}) }, Boolean(code));
  await f.email.flush();
  return emailToken(
    f.email.sent.findLast((message) => message.to === email)!.text,
  );
}
test("signup requires inbox ownership before creating a member, portfolio or session", async () => {
  const f = setup();
  try {
    const bad = await f.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bypass", password }),
    });
    assert.equal(bad.status, 400);
    const response = await f.app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Host: "evil.invalid" },
      body: JSON.stringify({
        email: " New@Example.com ",
        username: "ignored",
        password,
        role: "learner",
      }),
    });
    assert.equal(response.status, 202);
    assert.ok(
      !response.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith("trove_session=")),
    );
    await f.email.flush();
    for (const table of [
      "account_members",
      "account_profiles",
      "account_sessions",
    ])
      assert.equal(
        (await f.store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get())!
          .n,
        0,
      );
    const token = emailToken(f.email.sent[0].text);
    const row = (await f.store.db
      .prepare("SELECT * FROM account_signups")
      .get())!;
    assert.equal(row.token_hash, digest(token));
    assert.ok(!JSON.stringify(row).includes(token));
    assert.match(
      f.email.sent[0].text,
      /https:\/\/trove.example\/app\/create-account#token=/,
    );
    assert.deepEqual(await f.signup.details({ token }), {
      email: "new@example.com",
      role: "parent",
    });
    const finished = await f.app.request("/api/auth/complete-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, username: "ignored" }),
    });
    assert.equal(finished.status, 200);
    const state = await finished.json();
    assert.match(state.session.username, /^trove_[a-f0-9]{10}$/);
    assert.equal(state.session.recovery.email, "new@example.com");
    assert.equal(state.session.role, "parent");
    assert.equal(state.cash, "1000000000");
    assert.ok(finished.headers.get("set-cookie")!.includes("HttpOnly"));
    assert.equal(
      (await f.accounts.login({ identifier: "new@example.com", password }))
        .member.username,
      state.session.username,
    );
    await assert.rejects(() => f.signup.complete({ token, password }));
  } finally {
    await f.store.db.close();
  }
});
test("expired, malformed, superseded and failed-delivery signup links cannot create an account", async () => {
  const f = setup();
  try {
    const first = await challenge(f);
    const token = await challenge(f);
    await assert.rejects(() => f.signup.complete({ token: first, password }));
    await assert.rejects(() => f.signup.complete({ token: "wrong", password }));
    await assert.rejects(() => f.signup.complete({ token, password: "short" }));
    await f.store.db.prepare("UPDATE account_signups SET expires_at=0").run();
    await assert.rejects(() => f.signup.complete({ token, password }));
    const failure = new AccountSignup(f.store, {
      ...f.options,
      mail: {
        send: async () => {
          throw new Error("simulated provider failure");
        },
      },
    });
    await failure.request({ email: "failure@example.com" });
    await f.email.flush();
    assert.equal(
      (await f.store.db
        .prepare("SELECT state FROM account_signups WHERE email=?")
        .get("failure@example.com"))!.state,
      "failed",
    );
    assert.equal(
      (await f.store.db
        .prepare("SELECT count(*) AS n FROM account_members")
        .get())!.n,
      0,
    );
  } finally {
    await f.store.db.close();
  }
});
test("concurrent signup completion creates exactly one verified identity and reset uses that email", async () => {
  const f = setup();
  try {
    const token = await challenge(f);
    const results = await Promise.allSettled([
      f.signup.complete({ token, password }),
      f.signup.complete({ token, password }),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      (await f.store.db
        .prepare("SELECT count(*) AS n FROM account_members")
        .get())!.n,
      1,
    );
    const count = f.email.sent.length;
    await f.signup.request({ email: "new@example.com" });
    await f.email.flush();
    assert.equal(f.email.sent.length, count);
    const recovery = new AccountRecovery(f.store, f.options);
    await recovery.requestReset({ identifier: "new@example.com" });
    await f.email.flush();
    await recovery.reset({
      token: emailToken(f.email.sent.at(-1)!.text),
      password: "another-private-password",
    });
    assert.equal(
      (
        await f.accounts.login({
          identifier: "new@example.com",
          password: "another-private-password",
        })
      ).member.role,
      "parent",
    );
  } finally {
    await f.store.db.close();
  }
});
test("learner email verification consumes a valid invitation only when creating the account", async () => {
  const f = setup();
  try {
    const parent = await f.signup.complete({
      token: await challenge(f, "parent@example.com"),
      password,
    });
    const invite = await f.accounts.invite(parent.member);
    const token = await challenge(f, "child@example.com", invite.code);
    assert.equal(
      (await f.store.db.prepare("SELECT consumed FROM account_invites").get())!
        .consumed,
      0,
    );
    const learner = await f.signup.complete({ token, password });
    assert.equal(learner.member.family, parent.member.family);
    assert.equal(learner.member.role, "learner");
    assert.equal(
      (await f.accounts.login({ identifier: "child@example.com", password }))
        .member.id,
      learner.member.id,
    );
    await assert.rejects(() =>
      f.signup.request({ email: "other@example.com", code: invite.code }, true),
    );
    await assert.rejects(() =>
      f.signup.request({ email: "other@example.com" }, true),
    );
    await assert.rejects(() => f.accounts.invite(learner.member));
  } finally {
    await f.store.db.close();
  }
});
test("revoked invitations cannot be completed from an older email link", async () => {
  const f = setup();
  try {
    const parent = await f.signup.complete({
      token: await challenge(f, "parent@example.com"),
      password,
    });
    const invite = await f.accounts.invite(parent.member);
    const token = await challenge(f, "child@example.com", invite.code);
    await f.accounts.invite(parent.member);
    await assert.rejects(() => f.signup.complete({ token, password }));
    assert.equal(
      (await f.store.db
        .prepare("SELECT count(*) AS n FROM account_members")
        .get())!.n,
      1,
    );
  } finally {
    await f.store.db.close();
  }
});
test("username changes preserve identity, sessions and family history and enforce uniqueness", async () => {
  const f = setup();
  try {
    const parent = await f.signup.complete({
      token: await challenge(f),
      password,
    });
    const invite = await f.accounts.invite(parent.member);
    const learner = await f.signup.complete({
      token: await challenge(f, "child@example.com", invite.code),
      password,
    });
    const before = await f.store.get(parent.member.family);
    before.memories.push({
      id: "saved-reflection",
      text: "I compare businesses.",
      kind: "reflection",
      active: true,
      origin: "local",
      recordedAt: new Date().toISOString(),
    });
    await f.store.set(before);
    const changed = await f.accounts.rename(learner.member, {
      username: " Maya_Investor ",
    });
    assert.equal(changed.username, "maya_investor");
    assert.equal(changed.id, learner.member.id);
    assert.equal(
      (await f.accounts.resolve(learner.token))!.username,
      "maya_investor",
    );
    const after = await f.store.get(parent.member.family);
    assert.equal(after.learner, "maya_investor");
    assert.equal(after.cash, before.cash);
    assert.deepEqual(after.memories, before.memories);
    assert.deepEqual(after.policy, before.policy);
    assert.equal(
      (await f.accounts.login({ identifier: "maya_investor", password })).member
        .id,
      learner.member.id,
    );
    assert.equal(
      (await f.accounts.login({ identifier: "child@example.com", password }))
        .member.id,
      learner.member.id,
    );
    await assert.rejects(() =>
      f.accounts.login({ identifier: learner.member.username, password }),
    );
    await assert.rejects(() =>
      f.accounts.rename(parent.member, { username: "maya_investor" }),
    );
    await assert.rejects(() =>
      f.accounts.rename(parent.member, { username: "bad name" }),
    );
    const guest = await f.app.request("/api/account/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "intruder" }),
    });
    assert.equal(guest.status, 403);
  } finally {
    await f.store.db.close();
  }
});
test("signup fails closed without mail configuration and bounds email requests", async () => {
  const f = setup();
  try {
    const unconfigured = createApp(f.store);
    const response = await unconfigured.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com" }),
    });
    assert.equal(response.status, 409);
    for (let i = 0; i < 3; i++)
      await f.signup.request({ email: "limit@example.com" });
    await assert.rejects(
      () => f.signup.request({ email: "limit@example.com" }),
      (error: unknown) => (error as { status: number }).status === 429,
    );
    await f.email.flush();
    assert.equal(
      (await f.store.db
        .prepare("SELECT count(*) AS n FROM account_members")
        .get())!.n,
      0,
    );
  } finally {
    await f.store.db.close();
  }
});
