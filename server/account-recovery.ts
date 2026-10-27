import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  Accounts,
  AccessError,
  derive,
  digest,
  recoveryEmail,
} from "./auth.ts";
import type { Member } from "./auth.ts";
import type { DemoStore } from "./store.ts";
import type { AccountMail } from "./integrations/account-mail.ts";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const passwordSchema = z
  .string()
  .min(12, "Use a password with at least 12 characters.")
  .max(128);
type Token = {
  token_hash: string;
  member: string;
  purpose: "verify" | "reset";
  email: string;
  credential_version: string;
  expires_at: number;
  state: string;
};

export class AccountRecovery {
  private readonly accounts: Accounts;
  private readonly store: DemoStore;
  private readonly mail?: AccountMail;
  private readonly origin: string;
  private readonly defer: (work: Promise<unknown>) => void;
  constructor(
    store: DemoStore,
    options: {
      mail?: AccountMail;
      origin: string;
      defer?: (work: Promise<unknown>) => void;
    },
  ) {
    this.store = store;
    this.accounts = new Accounts(store);
    this.mail = options.mail;
    const origin = new URL(options.origin);
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      )
    )
      throw new Error("Account links require a trusted HTTPS origin.");
    this.origin = origin.origin;
    this.defer =
      options.defer ??
      ((work) => {
        void work;
      });
  }
  get ready() {
    return Boolean(this.mail);
  }
  async status(member: Member) {
    const email = await this.store.db
      .prepare("SELECT email FROM account_emails WHERE member=?")
      .get(member.id);
    const pending = await this.store.db
      .prepare(
        "SELECT email,state,expires_at FROM account_email_tokens WHERE member=? AND purpose='verify' ORDER BY created_at DESC LIMIT 1",
      )
      .get(member.id);
    return {
      ready: this.ready,
      email: email?.email as string | undefined,
      pendingEmail: pending?.email as string | undefined,
      delivery: pending
        ? ((Number(pending.expires_at) <= Date.now()
            ? "expired"
            : pending.state) as "pending" | "sent" | "failed" | "expired")
        : undefined,
      guardianRecovery:
        !email &&
        member.role === "learner" &&
        Boolean(await this.recipient(member)),
    };
  }
  private async recipient(member: Member): Promise<string | undefined> {
    const own = await this.store.db
      .prepare("SELECT email FROM account_emails WHERE member=?")
      .get(member.id);
    if (own) return String(own.email);
    if (member.role === "learner") {
      const guardian = await this.store.db
        .prepare(
          "SELECT e.email FROM account_members m JOIN account_emails e ON e.member=m.id WHERE m.family=? AND m.role='parent'",
        )
        .get(member.family);
      if (guardian) return String(guardian.email);
    }
  }
  async requestVerification(
    member: Member,
    input: unknown,
    allowUnconfigured = false,
  ) {
    const { email, password } = z
      .object({ email: recoveryEmail, password: z.string().min(1).max(128) })
      .parse(input);
    await this.accounts.limit(`verify-email:${member.id}`, 3, 15 * 60000);
    const hash = await this.accounts.checkPassword(member, password);
    if (!this.ready && !allowUnconfigured)
      throw new AccessError(
        "Account email delivery is not configured yet.",
        409,
      );
    const existing = await this.store.db
      .prepare("SELECT member FROM account_emails WHERE email=?")
      .get(email);
    if (existing && existing.member !== member.id)
      throw new AccessError("That email is already linked to an account.", 409);
    await this.issue(member, "verify", email, hash);
  }
  async requestReset(input: unknown) {
    const { identifier } = z
      .object({ identifier: z.string().trim().toLowerCase().min(3).max(254) })
      .parse(input);
    if (!this.ready)
      throw new AccessError(
        "Account email delivery is not configured yet.",
        409,
      );
    await this.accounts.limit(
      `password-reset:${digest(identifier)}`,
      3,
      15 * 60000,
    );
    await this.accounts.limit("password-reset:global", 60, 3600000);
    // Account lookup and delivery happen after the generic response, for every identifier.
    this.defer(
      this.deliverReset(identifier).catch(() => {
        console.error("[trove] A password-reset email could not be prepared.");
      }),
    );
  }
  private async deliverReset(identifier: string) {
    const member = (await this.store.db
      .prepare(
        identifier.includes("@")
          ? "SELECT m.* FROM account_members m JOIN account_emails e ON e.member=m.id WHERE e.email=?"
          : "SELECT * FROM account_members WHERE username=?",
      )
      .get(identifier)) as (Member & { password_hash: string }) | undefined;
    if (!member) return;
    const recipient = await this.recipient(member);
    if (recipient)
      await this.issue(member, "reset", recipient, member.password_hash, false);
  }
  private async issue(
    member: Member,
    purpose: "verify" | "reset",
    email: string,
    passwordHash: string,
    background = true,
  ) {
    if (this.ready)
      await this.accounts.limit("account-mail:global", 90, 86400000);
    const token = randomBytes(32).toString("base64url"),
      tokenHash = digest(token),
      now = Date.now();
    await this.store.atomic(async () => {
      await this.store.db.lock(`credentials:${member.id}`);
      const current = await this.store.db
        .prepare("SELECT password_hash FROM account_members WHERE id=?")
        .get(member.id);
      if (current?.password_hash !== passwordHash)
        throw new AccessError(
          "Your account changed. Sign in again before continuing.",
          409,
        );
      await this.store.db
        .prepare(
          "DELETE FROM account_email_tokens WHERE member=? AND purpose=?",
        )
        .run(member.id, purpose);
      await this.store.db
        .prepare(
          "INSERT INTO account_email_tokens(token_hash,member,purpose,email,credential_version,expires_at,created_at,state) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          tokenHash,
          member.id,
          purpose,
          email,
          digest(passwordHash),
          now + (purpose === "reset" ? 15 * 60000 : 24 * 3600000),
          now,
          this.ready ? "pending" : "failed",
        );
    });
    if (!this.mail) return;
    const url = new URL(
      purpose === "reset" ? "/app/reset-password" : "/app/verify-email",
      this.origin,
    );
    url.hash = new URLSearchParams({ token }).toString();
    const work = this.mail
      .send({
        to: email,
        subject:
          purpose === "reset"
            ? `Reset ${member.username}'s Trove password`
            : "Verify your Trove recovery email",
        text:
          purpose === "reset"
            ? `A password reset was requested for the Trove ${member.role} account ${member.username}.\n\nOpen this link to choose a new password:\n${url}\n\nThis link expires in 15 minutes and can be used once. Completing it signs this account out on every device. If you did not request it, leave the link unused.`
            : `Confirm this email for the Trove account ${member.username}:\n${url}\n\nThis link expires in 24 hours. Once verified, you can sign in with your email or username and recover your password. If you did not request it, leave the link unused.`,
        idempotencyKey: `trove-auth-${tokenHash}`,
      })
      .then(async (id) => {
        await this.store.db
          .prepare(
            "UPDATE account_email_tokens SET state='sent',provider_id=? WHERE token_hash=? AND state='pending'",
          )
          .run(id, tokenHash);
      })
      .catch(async () => {
        await this.store.db
          .prepare(
            "UPDATE account_email_tokens SET state='failed' WHERE token_hash=? AND state='pending'",
          )
          .run(tokenHash);
        console.error(
          "[trove] Account email could not be sent; check the configured email provider.",
        );
      })
      .catch(() => {
        console.error(
          "[trove] Account email delivery status could not be recorded.",
        );
      });
    if (background) this.defer(work);
    else await work;
  }
  private async token(raw: unknown, purpose: Token["purpose"]) {
    const token = tokenSchema.safeParse(raw);
    if (!token.success)
      throw new AccessError(
        "This link is invalid, expired, or already used.",
        409,
      );
    const row = (await this.store.db
      .prepare(
        "SELECT * FROM account_email_tokens WHERE token_hash=? AND purpose=? AND expires_at>? AND state IN ('pending','sent')",
      )
      .get(digest(token.data), purpose, Date.now())) as Token | undefined;
    if (!row)
      throw new AccessError(
        "This link is invalid, expired, or already used.",
        409,
      );
    return row;
  }
  async verify(raw: unknown) {
    const initial = await this.token(raw, "verify");
    await this.store.atomic(async () => {
      await this.store.db.lock(`credentials:${initial.member}`);
      await this.store.db.lock("account-email-ownership");
      const row = await this.token(raw, "verify");
      const member = await this.store.db
        .prepare("SELECT password_hash FROM account_members WHERE id=?")
        .get(row.member);
      if (
        !member ||
        digest(String(member.password_hash)) !== row.credential_version
      )
        throw new AccessError(
          "Your account changed. Request a new verification link.",
          409,
        );
      const owner = await this.store.db
        .prepare("SELECT member FROM account_emails WHERE email=?")
        .get(row.email);
      if (owner && owner.member !== row.member)
        throw new AccessError(
          "That email is already linked to an account.",
          409,
        );
      await this.store.db
        .prepare(
          "INSERT INTO account_emails(member,email,verified_at) VALUES(?,?,?) ON CONFLICT(member) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at",
        )
        .run(row.member, row.email, Date.now());
      await this.store.db
        .prepare("DELETE FROM account_email_tokens WHERE member=?")
        .run(row.member);
    });
  }
  async reset(input: unknown) {
    const { token: raw, password } = z
      .object({ token: z.string(), password: passwordSchema })
      .parse(input);
    const initial = await this.token(raw, "reset");
    const salt = randomBytes(32).toString("hex"),
      hash = await derive(password, salt);
    await this.store.atomic(async () => {
      await this.store.db.lock(`credentials:${initial.member}`);
      await this.store.db.lock("account-email-ownership");
      const row = await this.token(raw, "reset");
      const member = (await this.store.db
        .prepare("SELECT * FROM account_members WHERE id=?")
        .get(row.member)) as (Member & { password_hash: string }) | undefined;
      if (
        !member ||
        digest(member.password_hash) !== row.credential_version ||
        (await this.recipient(member)) !== row.email
      )
        throw new AccessError(
          "Your account changed. Request a new password-reset link.",
          409,
        );
      await this.store.db
        .prepare("UPDATE account_members SET salt=?,password_hash=? WHERE id=?")
        .run(salt, hash.toString("hex"), member.id);
      await this.store.db
        .prepare("DELETE FROM account_sessions WHERE member=?")
        .run(member.id);
      await this.store.db
        .prepare("DELETE FROM account_email_tokens WHERE member=?")
        .run(member.id);
      if (member.role === "parent")
        await this.store.db
          .prepare("DELETE FROM account_invites WHERE family=? AND consumed=0")
          .run(member.family);
    });
  }
}
