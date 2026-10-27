import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Accounts, AccessError, digest, recoveryEmail } from "./auth.ts";
import type { DemoStore } from "./store.ts";
import type { AccountMail } from "./integrations/account-mail.ts";

type Signup = {
  token_hash: string;
  email: string;
  invitation_hash: string | null;
};
const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const unavailable = () =>
  new AccessError(
    "This link is invalid, expired, or already used. Request a new signup email.",
    409,
  );

/** Email challenges create no member, portfolio, or authenticated session. */
export class AccountSignup {
  private readonly store: DemoStore;
  private readonly accounts: Accounts;
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
  async request(input: unknown, joining = false) {
    const { email, code } = z
      .object({ email: recoveryEmail, code: z.string().length(32).optional() })
      .parse(input);
    if (!this.mail)
      throw new AccessError(
        "Email signup is not available yet. Please try again shortly.",
        409,
      );
    if (joining && !code)
      throw new AccessError("Enter your family invitation code.", 409);
    const invitationHash = joining ? digest(code!) : undefined;
    if (invitationHash) await this.invitation(invitationHash);
    await this.accounts.limit(`signup-email:${digest(email)}`, 3, 15 * 60000);
    await this.accounts.limit("signup-email:global", 60, 3600000);
    // Lookup and sending are deferred equally for registered and new addresses.
    this.defer(
      this.deliver(email, invitationHash).catch(() => {
        console.error("[trove] A signup email could not be prepared.");
      }),
    );
  }
  private async invitation(hash: string) {
    const invitation = await this.store.db
      .prepare(
        "SELECT family FROM account_invites WHERE token_hash=? AND consumed=0 AND expires_at>?",
      )
      .get(hash, Date.now());
    if (
      !invitation ||
      (await this.store.db
        .prepare(
          "SELECT 1 FROM account_members WHERE family=? AND role='learner'",
        )
        .get(invitation.family))
    )
      throw new AccessError(
        "This invitation is invalid, used, or expired.",
        409,
      );
  }
  private async deliver(email: string, invitationHash?: string) {
    if (
      await this.store.db
        .prepare("SELECT 1 FROM account_emails WHERE email=?")
        .get(email)
    )
      return;
    await this.accounts.limit("account-mail:global", 90, 86400000);
    const token = randomBytes(32).toString("base64url"),
      hash = digest(token),
      now = Date.now();
    await this.store.atomic(async () => {
      await this.store.db.lock(`signup-email:${digest(email)}`);
      await this.store.db
        .prepare("DELETE FROM account_signups WHERE email=? OR expires_at<=?")
        .run(email, now);
      await this.store.db
        .prepare(
          "INSERT INTO account_signups(token_hash,email,invitation_hash,expires_at,created_at,state) VALUES(?,?,?,?,?,'pending')",
        )
        .run(hash, email, invitationHash ?? null, now + 30 * 60000, now);
    });
    const url = new URL("/app/create-account", this.origin);
    url.hash = new URLSearchParams({ token }).toString();
    try {
      await this.mail!.send({
        to: email,
        subject: "Verify your email to join Trove",
        text: `Welcome to Trove. Open this link to verify your email and choose a password for your ${invitationHash ? "learner" : "family"} account:\n${url}\n\nThis link expires in 30 minutes and can be used once. Your username will be assigned automatically; you can change it in Settings. If you did not request an account, leave this link unused.`,
        idempotencyKey: `trove-signup-${hash}`,
      });
      await this.store.db
        .prepare("UPDATE account_signups SET state='sent' WHERE token_hash=?")
        .run(hash);
    } catch {
      await this.store.db
        .prepare("UPDATE account_signups SET state='failed' WHERE token_hash=?")
        .run(hash);
      console.error(
        "[trove] Signup email could not be sent; check the configured email provider.",
      );
    }
  }
  private async token(raw: unknown) {
    const parsed = challenge.safeParse(raw);
    if (!parsed.success) throw unavailable();
    const row = (await this.store.db
      .prepare(
        "SELECT token_hash,email,invitation_hash FROM account_signups WHERE token_hash=? AND expires_at>? AND state IN ('pending','sent')",
      )
      .get(digest(parsed.data), Date.now())) as Signup | undefined;
    if (!row) throw unavailable();
    return row;
  }
  async details(input: unknown) {
    const { token } = z.object({ token: z.string() }).parse(input);
    const row = await this.token(token);
    if (row.invitation_hash) await this.invitation(row.invitation_hash);
    return {
      email: row.email,
      role: row.invitation_hash ? "learner" : "parent",
    };
  }
  async complete(input: unknown) {
    const { token, password } = z
      .object({
        token: z.string(),
        password: z
          .string()
          .min(12, "Use a password with at least 12 characters.")
          .max(128),
      })
      .parse(input);
    const initial = await this.token(token);
    return this.store.atomic(async () => {
      await this.store.db.lock(`signup-email:${digest(initial.email)}`);
      const row = await this.token(token);
      const result = await this.accounts.createVerified(
        row.email,
        password,
        row.invitation_hash ?? undefined,
      );
      await this.store.db
        .prepare("DELETE FROM account_signups WHERE email=?")
        .run(row.email);
      return result;
    });
  }
}
