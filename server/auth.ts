import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { Database } from "./database.ts";
import { z } from "zod";
import type { DemoStore } from "./store.ts";
import { seedState } from "../shared/fixtures.ts";
export class AccessError extends Error {
  readonly status: 401 | 403 | 409 | 429;
  constructor(message: string, status: 401 | 403 | 409 | 429 = 403) {
    super(message);
    this.status = status;
  }
}
export type Member = {
  id: string;
  family: string;
  username: string;
  role: "parent" | "learner";
};
export const recoveryEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address."));
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/, "Use 3–32 letters, numbers, or underscores.");
const credentials = z.object({
  username: usernameSchema,
  password: z
    .string()
    .min(12, "Use a password with at least 12 characters.")
    .max(128),
});
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export class Accounts {
  readonly db: Database;
  private readonly store: DemoStore;
  constructor(store: DemoStore) {
    this.store = store;
    this.db = store.db;
  }
  async limit(key: string, maximum: number, windowMs: number) {
    const now = Date.now();
    const row = (await this.db
      .prepare(
        `INSERT INTO request_limits(key,count,until_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_limits.until_at<=? THEN 1 ELSE request_limits.count+1 END,
      until_at=CASE WHEN request_limits.until_at<=? THEN excluded.until_at ELSE request_limits.until_at END RETURNING count`,
      )
      .get(key, now + windowMs, now, now)) as {
      count: number;
    };
    if (row.count > maximum)
      throw new AccessError(
        "Too many requests. Please wait before trying again.",
        429,
      );
  }
  async resolve(token: string | undefined): Promise<Member | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return (
      ((await this.db
        .prepare(
          `SELECT m.id,m.family,m.username,m.role FROM account_sessions s
      JOIN account_members m ON m.id=s.member WHERE s.token_hash=? AND s.expires_at>?`,
        )
        .get(digest(token), Date.now())) as Member | undefined) ?? null
    );
  }
  private async session(member: Member) {
    const token = randomBytes(32).toString("base64url");
    await this.db
      .prepare(
        "INSERT INTO account_sessions(token_hash,member,expires_at) VALUES(?,?,?)",
      )
      .run(digest(token), member.id, Date.now() + 7 * 86400000);
    return { token, member };
  }
  async register(input: unknown) {
    const { username, password } = credentials.parse(input);
    const email = recoveryEmail
      .optional()
      .parse((input as { email?: unknown }).email);
    await this.limit("registration", 20, 3600000);
    const salt = randomBytes(32).toString("hex");
    const hash = await derive(password, salt);
    return await this.store.atomic(async () => {
      if (
        email &&
        (await this.db
          .prepare("SELECT 1 FROM account_emails WHERE email=?")
          .get(email))
      )
        throw new AccessError(
          "That email is already linked. Sign in or reset your password.",
          409,
        );
      if (
        await this.db
          .prepare("SELECT 1 FROM account_members WHERE username=?")
          .get(username)
      )
        throw new AccessError("That username is already taken.", 409);
      const member: Member = {
        id: randomUUID(),
        family: randomUUID(),
        username,
        role: "parent",
      };
      const state = seedState(member.family);
      state.cash = "1000000000";
      state.holdings = [];
      state.decisions = [];
      state.memories = [];
      state.learner = "Your learner";
      await this.db
        .prepare(
          "INSERT INTO account_profiles(family,memory_enabled) VALUES(?,0)",
        )
        .run(member.family);
      await this.store.set(state);
      await this.db
        .prepare("INSERT INTO account_members VALUES(?,?,?,?,?,?)")
        .run(
          member.id,
          member.family,
          username,
          member.role,
          salt,
          hash.toString("hex"),
        );
      return await this.session(member);
    });
  }
  async login(input: unknown, oldToken?: string) {
    const raw = z
      .object({
        identifier: z.string().optional(),
        username: z.string().optional(),
        password: z.string().min(1).max(128),
      })
      .parse(input);
    const username = z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(254)
      .parse(raw.identifier ?? raw.username);
    const { password } = raw;
    await this.limit(`login:${username}`, 10, 10 * 60000);
    await this.limit("login:global", 120, 10 * 60000);
    const row = (await this.db
      .prepare(
        username.includes("@")
          ? "SELECT m.* FROM account_members m JOIN account_emails e ON e.member=m.id WHERE e.email=?"
          : "SELECT * FROM account_members WHERE username=?",
      )
      .get(username)) as
      | (Member & {
          salt: string;
          password_hash: string;
        })
      | undefined;
    const key = await derive(password, row?.salt ?? "no-such-account");
    if (!row || !timingSafeEqual(key, Buffer.from(row.password_hash, "hex")))
      throw new AccessError(
        "The username, email, or password is incorrect.",
        401,
      );
    return await this.store.atomic(async () => {
      await this.db.lock(`credentials:${row.id}`);
      const current = await this.db
        .prepare("SELECT password_hash FROM account_members WHERE id=?")
        .get(row.id);
      if (current?.password_hash !== row.password_hash)
        throw new AccessError(
          "The username, email, or password is incorrect.",
          401,
        );
      if (oldToken) await this.logout(oldToken);
      return await this.session({
        id: row.id,
        family: row.family,
        username: row.username,
        role: row.role,
      });
    });
  }
  async logout(token: string) {
    await this.db
      .prepare("DELETE FROM account_sessions WHERE token_hash=?")
      .run(digest(token));
  }
  async checkPassword(member: Member, password: string) {
    const row = await this.db
      .prepare("SELECT salt,password_hash FROM account_members WHERE id=?")
      .get(member.id);
    const key = await derive(
      z.string().min(1).max(128).parse(password),
      String(row?.salt ?? "no-such-account"),
    );
    if (
      !row ||
      !timingSafeEqual(key, Buffer.from(String(row.password_hash), "hex"))
    )
      throw new AccessError("Your current password is incorrect.");
    return String(row.password_hash);
  }
  async rename(member: Member, input: unknown) {
    const { username } = z.object({ username: usernameSchema }).parse(input);
    await this.limit(`username-change:${member.id}`, 5, 3600000);
    return this.store.atomic(async () => {
      await this.db.lock("account-usernames");
      const owner = await this.db
        .prepare("SELECT id FROM account_members WHERE username=?")
        .get(username);
      if (owner && owner.id !== member.id)
        throw new AccessError("That username is already taken.", 409);
      await this.db
        .prepare("UPDATE account_members SET username=? WHERE id=?")
        .run(username, member.id);
      if (member.role === "learner") {
        const state = await this.store.get(member.family);
        state.learner = username;
        await this.store.set(state);
      }
      return { ...member, username };
    });
  }
  /** Called only after the signup service has validated the emailed challenge. */
  async createVerified(
    email: string,
    password: string,
    invitationHash?: string,
  ) {
    email = recoveryEmail.parse(email);
    credentials.shape.password.parse(password);
    const salt = randomBytes(32).toString("hex");
    const hash = await derive(password, salt);
    return this.store.atomic(async () => {
      await this.db.lock("family-membership");
      await this.db.lock("account-usernames");
      await this.db.lock("account-email-ownership");
      if (
        await this.db
          .prepare("SELECT 1 FROM account_emails WHERE email=?")
          .get(email)
      )
        throw new AccessError(
          "This email already has an account. Sign in or reset your password.",
          409,
        );
      const invitation = invitationHash
        ? await this.db
            .prepare(
              "SELECT family FROM account_invites WHERE token_hash=? AND consumed=0 AND expires_at>?",
            )
            .get(invitationHash, Date.now())
        : undefined;
      if (invitationHash && !invitation)
        throw new AccessError(
          "This invitation is invalid, used, or expired.",
          409,
        );
      if (
        invitation &&
        (await this.db
          .prepare(
            "SELECT 1 FROM account_members WHERE family=? AND role='learner'",
          )
          .get(invitation.family))
      )
        throw new AccessError(
          "This family already has a learner account.",
          409,
        );
      let username: string;
      do {
        username = `trove_${randomBytes(5).toString("hex")}`;
      } while (
        await this.db
          .prepare("SELECT 1 FROM account_members WHERE username=?")
          .get(username)
      );
      const member: Member = {
        id: randomUUID(),
        family: invitation ? String(invitation.family) : randomUUID(),
        username,
        role: invitation ? "learner" : "parent",
      };
      if (!invitation) {
        const state = seedState(member.family);
        state.cash = "1000000000";
        state.holdings = [];
        state.decisions = [];
        state.memories = [];
        state.learner = "Your learner";
        await this.db
          .prepare(
            "INSERT INTO account_profiles(family,memory_enabled) VALUES(?,0)",
          )
          .run(member.family);
        await this.store.set(state);
      } else {
        const state = await this.store.get(member.family);
        state.learner = username;
        await this.store.set(state);
        await this.db
          .prepare("UPDATE account_invites SET consumed=1 WHERE token_hash=?")
          .run(invitationHash);
      }
      await this.db
        .prepare("INSERT INTO account_members VALUES(?,?,?,?,?,?)")
        .run(
          member.id,
          member.family,
          username,
          member.role,
          salt,
          hash.toString("hex"),
        );
      await this.db
        .prepare(
          "INSERT INTO account_emails(member,email,verified_at) VALUES(?,?,?)",
        )
        .run(member.id, email, Date.now());
      return this.session(member);
    });
  }
  async invite(member: Member) {
    if (member.role !== "parent")
      throw new AccessError("Only the parent can invite a learner.");
    return await this.store.atomic(async () => {
      await this.db.lock("family-membership");
      if (
        await this.db
          .prepare(
            "SELECT 1 FROM account_members WHERE family=? AND role='learner'",
          )
          .get(member.family)
      )
        throw new AccessError(
          "This family already has a learner account.",
          409,
        );
      const token = randomBytes(24).toString("base64url"),
        expiresAt = Date.now() + 86400000;
      await this.db
        .prepare("DELETE FROM account_invites WHERE family=? AND consumed=0")
        .run(member.family);
      await this.db
        .prepare(
          "INSERT INTO account_invites(token_hash,family,expires_at) VALUES(?,?,?)",
        )
        .run(digest(token), member.family, expiresAt);
      return { code: token, expiresAt };
    });
  }
  async join(input: unknown) {
    const { code, email, ...raw } = z
      .object({
        code: z.string().min(32).max(32),
        username: z.string(),
        password: z.string(),
        email: recoveryEmail.optional(),
      })
      .parse(input);
    const { username, password } = credentials.parse(raw);
    await this.limit("join:global", 30, 3600000);
    const salt = randomBytes(32).toString("hex"),
      hash = await derive(password, salt);
    return await this.store.atomic(async () => {
      await this.db.lock("family-membership");
      if (
        email &&
        (await this.db
          .prepare("SELECT 1 FROM account_emails WHERE email=?")
          .get(email))
      )
        throw new AccessError(
          "That email is already linked. Use a different email or leave it blank for parent recovery.",
          409,
        );
      const invitation = (await this.db
        .prepare(
          "SELECT family FROM account_invites WHERE token_hash=? AND consumed=0 AND expires_at>?",
        )
        .get(digest(code), Date.now())) as
        | {
            family: string;
          }
        | undefined;
      if (!invitation)
        throw new AccessError(
          "This invitation is invalid, used, or expired.",
          409,
        );
      if (
        await this.db
          .prepare(
            "SELECT 1 FROM account_members WHERE username=? OR (family=? AND role='learner')",
          )
          .get(username, invitation.family)
      )
        throw new AccessError(
          "The username is taken or this family already has a learner.",
          409,
        );
      const member: Member = {
        id: randomUUID(),
        family: invitation.family,
        username,
        role: "learner",
      };
      await this.db
        .prepare("INSERT INTO account_members VALUES(?,?,?,?,?,?)")
        .run(
          member.id,
          member.family,
          username,
          member.role,
          salt,
          hash.toString("hex"),
        );
      await this.db
        .prepare("UPDATE account_invites SET consumed=1 WHERE token_hash=?")
        .run(digest(code));
      const state = await this.store.get(member.family);
      state.learner = username;
      await this.store.set(state);
      return await this.session(member);
    });
  }
}
