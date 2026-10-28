import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Pool, types } from "pg";

type Row = Record<string, unknown>;
export class StateConflict extends Error {
  readonly status = 409;
  constructor() {
    super("Your account changed in another request. Refresh and try again.");
  }
}
type Result = { rows: Row[]; rowCount?: number | null; affectedRows?: number };
export interface DatabaseDriver {
  query(sql: string, parameters?: unknown[]): Promise<Result>;
  connect?: () => Promise<DatabaseDriver & { release(): void }>;
  end?: () => Promise<void>;
}
const schema = `
CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY,state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,family TEXT NOT NULL,payload TEXT NOT NULL,decision TEXT);
CREATE TABLE IF NOT EXISTS memory_outbox(operation_key TEXT PRIMARY KEY,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',job_id TEXT,blob_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,error_code TEXT,withdrawn INTEGER NOT NULL DEFAULT 0,lease_token TEXT);
CREATE TABLE IF NOT EXISTS account_profiles(family TEXT PRIMARY KEY,memory_enabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS coaching_cache(family TEXT NOT NULL,cache_key TEXT NOT NULL,token TEXT NOT NULL,reply TEXT,until_at INTEGER NOT NULL,PRIMARY KEY(family,cache_key));
CREATE TABLE IF NOT EXISTS account_members(id TEXT PRIMARY KEY,family TEXT NOT NULL,username TEXT UNIQUE NOT NULL,role TEXT NOT NULL CHECK(role IN ('parent','learner')),salt TEXT NOT NULL,password_hash TEXT NOT NULL,UNIQUE(family,role));
CREATE TABLE IF NOT EXISTS account_sessions(token_hash TEXT PRIMARY KEY,member TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS account_invites(token_hash TEXT PRIMARY KEY,family TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS request_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_snapshots(id TEXT PRIMARY KEY,as_of TEXT NOT NULL,received_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS market_snapshots_latest ON market_snapshots(received_at DESC);
CREATE TABLE IF NOT EXISTS market_refresh(id INTEGER PRIMARY KEY CHECK(id=1),next_at INTEGER NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS market_provider_refresh(provider TEXT PRIMARY KEY,next_at INTEGER NOT NULL,status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolio_archives(id TEXT PRIMARY KEY,family TEXT NOT NULL,payload TEXT NOT NULL,recorded_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolio_marks(family TEXT NOT NULL,portfolio TEXT NOT NULL,date TEXT NOT NULL,value TEXT NOT NULL,dataset TEXT NOT NULL,PRIMARY KEY(family,portfolio,date));
CREATE TABLE IF NOT EXISTS portfolio_observations(family TEXT NOT NULL,portfolio TEXT NOT NULL,observed_at TEXT NOT NULL,value TEXT NOT NULL,capital TEXT NOT NULL,dataset TEXT NOT NULL,sequence INTEGER NOT NULL,PRIMARY KEY(family,portfolio,observed_at));
CREATE TABLE IF NOT EXISTS chain_wallets(family TEXT NOT NULL,role TEXT NOT NULL,address TEXT NOT NULL,PRIMARY KEY(family,role),UNIQUE(family,address));
CREATE TABLE IF NOT EXISTS chain_challenges(id TEXT PRIMARY KEY,member TEXT NOT NULL,message TEXT NOT NULL,address TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS chain_accounts(family TEXT PRIMARY KEY,object_id TEXT NOT NULL UNIQUE,created_digest TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chain_learner_bindings(family TEXT PRIMARY KEY,address TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chain_quote_attestations(quote_id TEXT PRIMARY KEY,payload TEXT NOT NULL,salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chain_dispatch(id TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,token TEXT);
CREATE TABLE IF NOT EXISTS corporate_retry(family TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,attempts INTEGER NOT NULL,next_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chain_intents(id TEXT PRIMARY KEY,family TEXT NOT NULL,member TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,bytes TEXT,digest TEXT NOT NULL,signature TEXT,state TEXT NOT NULL,expires_at INTEGER NOT NULL,error TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS chain_one_active ON chain_intents((1)) WHERE state IN ('building','prepared','submitting','pending');
CREATE TABLE IF NOT EXISTS coach_usage(id TEXT PRIMARY KEY,model TEXT NOT NULL,state TEXT NOT NULL,reserved_nano INTEGER NOT NULL,estimated_nano INTEGER NOT NULL,input_tokens INTEGER,output_tokens INTEGER,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS maintenance_leases(key TEXT PRIMARY KEY,token TEXT NOT NULL,until_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS memory_jobs_due ON memory_outbox(state,next_at,lease_until);
CREATE INDEX IF NOT EXISTS session_expiration ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_emails(member TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,verified_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS account_email_tokens(token_hash TEXT PRIMARY KEY,member TEXT NOT NULL,purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),email TEXT NOT NULL,credential_version TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','sent','failed')),provider_id TEXT);
CREATE INDEX IF NOT EXISTS account_email_tokens_member ON account_email_tokens(member,purpose,created_at);
CREATE TABLE IF NOT EXISTS account_signups(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,invitation_hash TEXT,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','sent','failed')),salt TEXT,password_hash TEXT);
CREATE INDEX IF NOT EXISTS account_signups_email ON account_signups(email,created_at);
`;

/** Convert the shared, parameterized SQL dialect; values are always bound separately. */
export function postgresSql(input: string) {
  let sql = input
    .replace(/PRAGMA\s+[^;]+;?/gi, "")
    .replace(/\bINTEGER\b/g, "BIGINT");
  sql = sql.replace(
    /json_extract\((\w+),'\$\.([\w.]+)'\)/g,
    (_, column: string, path: string) =>
      `(${column}::jsonb #>> '{${path.split(".").join(",")}}')`,
  );
  if (/^\s*INSERT OR IGNORE\b/i.test(sql))
    sql = sql
      .replace(/INSERT OR IGNORE/i, "INSERT")
      .replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  let index = 0,
    quoted = false;
  let result = "";
  for (let n = 0; n < sql.length; n++) {
    const char = sql[n];
    if (char === "'") {
      result += char;
      if (quoted && sql[n + 1] === "'") {
        result += sql[++n];
        continue;
      }
      quoted = !quoted;
    } else result += char === "?" && !quoted ? `$${++index}` : char;
  }
  return result;
}
const wrappers = new WeakMap<DatabaseSync, Database>();
types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Database integer exceeds the safe numeric range.");
  return number;
});

/** Async persistence with transaction-scoped connections and bounded pool use. */
export class Database {
  readonly kind: "sqlite" | "postgres";
  readonly ready: Promise<void>;
  readonly pool?: Pool;
  private readonly namespace?: string;
  private readonly local?: DatabaseSync;
  private readonly driver?: DatabaseDriver;
  private readonly context = new AsyncLocalStorage<
    DatabaseDriver | DatabaseSync
  >();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(input: {
    filename?: string;
    sqlite?: DatabaseSync;
    url?: string;
    driver?: DatabaseDriver;
    schema?: string;
  }) {
    if (input.schema && !/^[a-z][a-z0-9_]{0,55}$/.test(input.schema))
      throw new Error("Invalid database namespace.");
    this.namespace = input.schema;
    this.kind = input.url || input.driver ? "postgres" : "sqlite";
    if (this.kind === "sqlite") {
      if (input.filename && input.filename !== ":memory:")
        mkdirSync(dirname(input.filename), { recursive: true });
      this.local =
        input.sqlite ?? new DatabaseSync(input.filename ?? ":memory:");
      this.local.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;" + schema,
      );
      const columns = (table: string) =>
        (
          this.local!.prepare(`PRAGMA table_info(${table})`).all() as {
            name: string;
          }[]
        ).map((c) => c.name);
      if (!columns("families").includes("version"))
        this.local.exec(
          "ALTER TABLE families ADD COLUMN version INTEGER NOT NULL DEFAULT 0",
        );
      if (!columns("memory_outbox").includes("withdrawn"))
        this.local.exec(
          "ALTER TABLE memory_outbox ADD COLUMN withdrawn INTEGER NOT NULL DEFAULT 0",
        );
      if (!columns("memory_outbox").includes("lease_token"))
        this.local.exec(
          "ALTER TABLE memory_outbox ADD COLUMN lease_token TEXT",
        );
      for (const column of ["salt", "password_hash"])
        if (!columns("account_signups").includes(column))
          this.local.exec(
            `ALTER TABLE account_signups ADD COLUMN ${column} TEXT`,
          );
      this.ready = Promise.resolve();
      wrappers.set(this.local, this);
    } else {
      if (input.driver) this.driver = input.driver;
      else {
        const url = new URL(input.url!);
        const secure = !["localhost", "127.0.0.1", "::1"].includes(
          url.hostname,
        );
        url.searchParams.delete("sslmode");
        url.searchParams.delete("channel_binding");
        this.pool = new Pool({
          connectionString: url.toString(),
          ssl: secure ? { rejectUnauthorized: true } : undefined,
          enableChannelBinding: secure,
          max: 3,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 15000,
          allowExitOnIdle: true,
        });
        this.pool.on("error", () =>
          console.error(
            "[trove] Database connection closed; the next request will reconnect.",
          ),
        );
        this.driver = this.pool as unknown as DatabaseDriver;
      }
      this.ready = this.initialize();
    }
  }
  private async initialize() {
    const client = this.driver!.connect
      ? await this.driver!.connect()
      : this.driver!;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(70681421)");
      if (this.namespace) {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.namespace}"`);
        await client.query(`SET LOCAL search_path TO "${this.namespace}"`);
      }
      await client.query(postgresSql(schema));
      await client.query(
        "ALTER TABLE account_signups ADD COLUMN IF NOT EXISTS salt TEXT, ADD COLUMN IF NOT EXISTS password_hash TEXT",
      );
      await client.query(
        "ALTER TABLE families ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0",
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if ("release" in client) (client as { release(): void }).release();
    }
  }
  get isTransaction() {
    return Boolean(this.context.getStore());
  }
  private async exclusive<T>(operation: () => T | Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((r) => {
      release = r;
    });
    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
    }
  }
  private async query(
    sql: string,
    parameters: unknown[] = [],
    mode: "get" | "all" | "run" = "all",
  ): Promise<Row | Row[] | { changes: number | bigint } | undefined> {
    await this.ready;
    if (this.namespace && !this.isTransaction)
      return this.transaction(() => this.query(sql, parameters, mode));
    const perform = async () => {
      if (this.local) {
        const statement = this.local.prepare(sql),
          values = parameters.map((p) =>
            typeof p === "bigint"
              ? p
              : (p as string | number | null | Uint8Array),
          );
        if (mode === "run") return statement.run(...values);
        return mode === "get"
          ? statement.get(...values)
          : statement.all(...values);
      }
      const client =
        (this.context.getStore() as DatabaseDriver | undefined) ?? this.driver!;
      const result = await client.query(postgresSql(sql), parameters);
      if (mode === "run")
        return { changes: result.rowCount ?? result.affectedRows ?? 0 };
      return mode === "get" ? result.rows[0] : result.rows;
    };
    return (this.local || !this.driver?.connect) && !this.isTransaction
      ? this.exclusive(perform)
      : perform();
  }
  prepare(sql: string) {
    return {
      get: async (...parameters: unknown[]) =>
        (await this.query(sql, parameters, "get")) as Row | undefined,
      all: async (...parameters: unknown[]) =>
        (await this.query(sql, parameters, "all")) as Row[],
      run: async (...parameters: unknown[]) =>
        (await this.query(sql, parameters, "run")) as {
          changes: number | bigint;
        },
    };
  }
  async exec(sql: string): Promise<void> {
    await this.ready;
    if (this.namespace && !this.isTransaction)
      return this.transaction(() => this.exec(sql));
    const perform = async () => {
      if (this.local) this.local.exec(sql);
      else
        await (
          (this.context.getStore() as DatabaseDriver | undefined) ??
          this.driver!
        ).query(postgresSql(sql));
    };
    if ((this.local || !this.driver?.connect) && !this.isTransaction)
      await this.exclusive(perform);
    else await perform();
  }
  async transaction<T>(operation: () => T | Promise<T>): Promise<T> {
    await this.ready;
    if (this.isTransaction) return operation();
    if (this.local)
      return this.exclusive(() =>
        this.context.run(this.local!, async () => {
          this.local!.exec("BEGIN IMMEDIATE");
          try {
            const result = await operation();
            this.local!.exec("COMMIT");
            return result;
          } catch (error) {
            this.local!.exec("ROLLBACK");
            throw error;
          }
        }),
      );
    const client = this.driver!.connect
      ? await this.driver!.connect()
      : this.driver!;
    const run = () =>
      this.context.run(client, async () => {
        try {
          await client.query("BEGIN");
          if (this.namespace)
            await client.query(`SET LOCAL search_path TO "${this.namespace}"`);
          const result = await operation();
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          if ("release" in client) (client as { release(): void }).release();
        }
      });
    return this.driver!.connect ? run() : this.exclusive(run);
  }
  async lock(key: string) {
    if (!this.isTransaction)
      throw new Error("A database lock requires a transaction.");
    if (this.kind === "postgres")
      await this.exec(
        `SELECT pg_advisory_xact_lock(${createHash("sha256").update(key).digest().readBigInt64BE()})`,
      );
  }
  async close() {
    await this.ready.catch(() => {});
    await this.queue;
    this.local?.close();
    await this.driver?.end?.();
  }
}
export function asDatabase(input: Database | DatabaseSync) {
  return input instanceof Database
    ? input
    : (wrappers.get(input) ?? new Database({ sqlite: input }));
}
