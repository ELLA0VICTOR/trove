import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DemoStore } from "../server/store.ts";
import { Accounts, AccessError, digest } from "../server/auth.ts";
import { AccountRecovery } from "../server/account-recovery.ts";
import { ResendAccountMail } from "../server/integrations/account-mail.ts";
import type { AccountMail } from "../server/integrations/account-mail.ts";
import { createApp } from "../server/app.ts";

const originalPassword = "original-private-password";
const newPassword = "replacement-private-password";
function tokenFrom(text: string) {
  return new URLSearchParams(
    new URL(text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1),
  ).get("token")!;
}
async function setup() {
  const store = new DemoStore(":memory:");
  const accounts = new Accounts(store);
  const sent: Parameters<AccountMail["send"]>[0][] = [];
  const pending: Promise<unknown>[] = [];
  const mail: AccountMail = {
    send: async (input) => {
      sent.push(input);
      return randomUUID();
    },
  };
  const defer = (work: Promise<unknown>) => {
    pending.push(work);
  };
  const recovery = new AccountRecovery(store, {
    mail,
    defer,
    origin: "https://trove.example",
  });
  const parent = await accounts.register({
    username: "parent_" + randomUUID().slice(0, 8),
    password: originalPassword,
  });
  const flush = async () => {
    await Promise.all(pending);
  };
  async function verify(email = "parent@example.com", target = parent.member) {
    await recovery.requestVerification(target, {
      email,
      password: originalPassword,
    });
    await flush();
    await recovery.verify(tokenFrom(sent.at(-1)!.text));
  }
  return {
    store,
    accounts,
    recovery,
    parent,
    sent,
    pending,
    mail,
    defer,
    flush,
    verify,
  };
}

test("verified email and username sign-in reach the same account; pending email cannot sign in", async () => {
  const f = await setup();
  try {
    await f.recovery.requestVerification(f.parent.member, {
      email: "  Parent@Example.COM ",
      password: originalPassword,
    });
    await f.flush();
    await assert.rejects(
      () =>
        f.accounts.login({
          identifier: "parent@example.com",
          password: originalPassword,
        }),
      AccessError,
    );
    const token = tokenFrom(f.sent[0].text);
    const rows = await f.store.db
      .prepare("SELECT * FROM account_email_tokens")
      .all();
    assert.equal(rows[0].token_hash, digest(token));
    assert.ok(!JSON.stringify(rows).includes(token));
    assert.equal(
      new URL(f.sent[0].text.match(/https:\/\/[^\s]+/)![0]).search,
      "",
    );
    await f.recovery.verify(token);
    assert.equal(
      (
        await f.accounts.login({
          identifier: "PARENT@example.com",
          password: originalPassword,
        })
      ).member.id,
      f.parent.member.id,
    );
    assert.equal(
      (
        await f.accounts.login({
          username: f.parent.member.username,
          password: originalPassword,
        })
      ).member.family,
      f.parent.member.family,
    );
    await assert.rejects(
      () => f.recovery.verify(token),
      /invalid, expired, or already used/,
    );
  } finally {
    await f.store.db.close();
  }
});

test("password reset is single-use, preserves family identity, and revokes all sessions and pending invitations", async () => {
  const f = await setup();
  try {
    await f.verify();
    const second = await f.accounts.login({
      identifier: "parent@example.com",
      password: originalPassword,
    });
    await f.accounts.invite(f.parent.member);
    await f.recovery.requestReset({ identifier: "parent@example.com" });
    await f.flush();
    const token = tokenFrom(f.sent.at(-1)!.text);
    const before = await f.store.get(f.parent.member.family);
    await f.recovery.reset({ token, password: newPassword });
    assert.equal(await f.accounts.resolve(f.parent.token), null);
    assert.equal(await f.accounts.resolve(second.token), null);
    assert.equal(
      (await f.store.db
        .prepare("SELECT COUNT(*) AS n FROM account_invites")
        .get())!.n,
      0,
    );
    await assert.rejects(
      () =>
        f.accounts.login({
          username: f.parent.member.username,
          password: originalPassword,
        }),
      AccessError,
    );
    assert.equal(
      (
        await f.accounts.login({
          identifier: "parent@example.com",
          password: newPassword,
        })
      ).member.id,
      f.parent.member.id,
    );
    assert.deepEqual(await f.store.get(f.parent.member.family), before);
    await assert.rejects(
      () => f.recovery.reset({ token, password: "another-private-password" }),
      /invalid, expired, or already used/,
    );
  } finally {
    await f.store.db.close();
  }
});

test("expired and malformed reset tokens cannot change passwords", async () => {
  const f = await setup();
  try {
    await f.verify();
    await f.recovery.requestReset({ identifier: f.parent.member.username });
    await f.flush();
    const token = tokenFrom(f.sent.at(-1)!.text);
    await f.store.db
      .prepare("UPDATE account_email_tokens SET expires_at=0")
      .run();
    await assert.rejects(
      () => f.recovery.reset({ token, password: newPassword }),
      /invalid, expired, or already used/,
    );
    await assert.rejects(
      () => f.recovery.reset({ token: "bad", password: newPassword }),
      /invalid, expired, or already used/,
    );
    assert.equal(
      (
        await f.accounts.login({
          username: f.parent.member.username,
          password: originalPassword,
        })
      ).member.id,
      f.parent.member.id,
    );
  } finally {
    await f.store.db.close();
  }
});

test("concurrent use of the same reset link changes the password once", async () => {
  const f = await setup();
  try {
    await f.verify();
    await f.recovery.requestReset({ identifier: "parent@example.com" });
    await f.flush();
    const token = tokenFrom(f.sent.at(-1)!.text);
    const results = await Promise.allSettled([
      f.recovery.reset({ token, password: newPassword }),
      f.recovery.reset({ token, password: "a-different-private-password" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    await f.store.db.close();
  }
});

test("a learner without email recovers through the verified parent inbox", async () => {
  const f = await setup();
  try {
    await f.verify();
    const invitation = await f.accounts.invite(f.parent.member);
    const learner = await f.accounts.join({
      code: invitation.code,
      username: "child_" + randomUUID().slice(0, 8),
      password: originalPassword,
    });
    assert.equal(
      (await f.recovery.status(learner.member)).guardianRecovery,
      true,
    );
    await f.recovery.requestReset({ identifier: learner.member.username });
    await f.flush();
    assert.equal(f.sent.at(-1)!.to, "parent@example.com");
    assert.ok(f.sent.at(-1)!.subject.includes(learner.member.username));
    await f.recovery.reset({
      token: tokenFrom(f.sent.at(-1)!.text),
      password: newPassword,
    });
    assert.equal(
      (
        await f.accounts.login({
          username: learner.member.username,
          password: newPassword,
        })
      ).member.role,
      "learner",
    );
    assert.ok(await f.accounts.resolve(f.parent.token));
  } finally {
    await f.store.db.close();
  }
});

test("recovery links to an old guardian email stop working after an email change", async () => {
  const f = await setup();
  try {
    await f.verify();
    const invitation = await f.accounts.invite(f.parent.member);
    const learner = await f.accounts.join({
      code: invitation.code,
      username: "child_" + randomUUID().slice(0, 8),
      password: originalPassword,
    });
    await f.recovery.requestReset({ identifier: learner.member.username });
    await f.flush();
    const oldLink = tokenFrom(f.sent.at(-1)!.text);
    await f.verify("new-parent@example.com");
    await assert.rejects(
      () => f.recovery.reset({ token: oldLink, password: newPassword }),
      /account changed/,
    );
  } finally {
    await f.store.db.close();
  }
});

test("adding recovery email requires the current password and cannot steal a verified address", async () => {
  const f = await setup();
  try {
    await assert.rejects(
      () =>
        f.recovery.requestVerification(f.parent.member, {
          email: "attacker@example.com",
          password: "wrong-private-password",
        }),
      /current password/,
    );
    assert.equal(f.sent.length, 0);
    await f.verify();
    const other = await f.accounts.register({
      username: "other_" + randomUUID().slice(0, 8),
      password: originalPassword,
    });
    await assert.rejects(
      () =>
        f.recovery.requestVerification(other.member, {
          email: "parent@example.com",
          password: originalPassword,
        }),
      /already linked/,
    );
    const count = (await f.store.db
      .prepare("SELECT COUNT(*) AS n FROM account_members")
      .get())!.n;
    await assert.rejects(
      () =>
        f.accounts.register({
          username: "duplicate_email",
          email: "parent@example.com",
          password: originalPassword,
        }),
      /already linked/,
    );
    assert.equal(
      (await f.store.db
        .prepare("SELECT COUNT(*) AS n FROM account_members")
        .get())!.n,
      count,
    );
    assert.equal(
      (
        await f.accounts.login({
          identifier: "parent@example.com",
          password: originalPassword,
        })
      ).member.id,
      f.parent.member.id,
    );
  } finally {
    await f.store.db.close();
  }
});

test("reset requests return the same API response for known, unknown and unverified accounts without exposing tokens", async () => {
  const f = await setup();
  try {
    await f.verify();
    const app = createApp(f.store, {
      mail: f.mail,
      defer: f.defer,
      publicOrigin: "https://trove.example",
    });
    const replies = [];
    for (const identifier of [
      "parent@example.com",
      "missing@example.com",
      "unverified@example.com",
    ]) {
      const response = await app.request("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://trove.example",
          Host: "attacker.example",
        },
        body: JSON.stringify({ identifier }),
      });
      assert.equal(response.status, 202);
      replies.push(await response.json());
    }
    await f.flush();
    assert.deepEqual(replies[0], replies[1]);
    assert.deepEqual(replies[1], replies[2]);
    assert.ok(
      !JSON.stringify(replies).includes(tokenFrom(f.sent.at(-1)!.text)),
    );
    assert.ok(
      f.sent
        .at(-1)!
        .text.includes("https://trove.example/app/reset-password#token="),
    );
    assert.ok(!f.sent.at(-1)!.text.includes("attacker.example"));
  } finally {
    await f.store.db.close();
  }
});

test("delivery failures do not produce usable links or pretend email is sent", async () => {
  const f = await setup();
  try {
    let attempted = "";
    const recovery = new AccountRecovery(f.store, {
      origin: "https://trove.example",
      defer: f.defer,
      mail: {
        send: async (input) => {
          attempted = tokenFrom(input.text);
          throw new Error("provider failure");
        },
      },
    });
    await recovery.requestVerification(f.parent.member, {
      email: "parent@example.com",
      password: originalPassword,
    });
    await f.flush();
    assert.equal((await recovery.status(f.parent.member)).delivery, "failed");
    await assert.rejects(
      () => recovery.verify(attempted),
      /invalid, expired, or already used/,
    );
  } finally {
    await f.store.db.close();
  }
});

test("reset requests are throttled even for unknown addresses", async () => {
  const f = await setup();
  try {
    for (let i = 0; i < 3; i++)
      await f.recovery.requestReset({ identifier: "missing@example.com" });
    await assert.rejects(
      () => f.recovery.requestReset({ identifier: "missing@example.com" }),
      (error: unknown) => error instanceof AccessError && error.status === 429,
    );
    assert.equal(f.sent.length, 0);
    await f.flush();
  } finally {
    await f.store.db.close();
  }
});

test("Resend uses fixed HTTPS transport, bounded sends and an idempotency key", async () => {
  let request: Request | undefined;
  const http: typeof fetch = async (url, init) => {
    request = new Request(url, init);
    return Response.json({ id: "accepted-email" });
  };
  const mail = new ResendAccountMail(
    "private-test-key",
    "Trove <accounts@dixmail.xyz>",
    http,
  );
  assert.equal(
    await mail.send({
      to: "parent@example.com",
      subject: "Verify Trove",
      text: "Test email",
      idempotencyKey: "test-identity",
    }),
    "accepted-email",
  );
  assert.equal(request!.url, "https://api.resend.com/emails");
  assert.equal(request!.headers.get("idempotency-key"), "test-identity");
  assert.equal((await request!.json()).from, "Trove <accounts@dixmail.xyz>");
});
