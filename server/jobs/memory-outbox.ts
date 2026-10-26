import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { memoryEnvelope } from "../integrations/walrus.ts";
import type { MemoryEnvelope, MemoryGateway } from "../integrations/walrus.ts";

type Job = {
  operation_key: string;
  payload: string;
  payload_hash: string;
  state: string;
  job_id: string | null;
  blob_id: string | null;
  attempts: number;
  next_at: number;
  lease_until: number;
  error_code: string | null;
  withdrawn: number;
  lease_token: string | null;
};
/** Local product records are held; only explicitly pending jobs can be dispatched. */
export class MemoryOutbox {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS memory_outbox (
      operation_key TEXT PRIMARY KEY, payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', job_id TEXT, blob_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0, error_code TEXT
    )`);
    const columns = db.prepare("PRAGMA table_info(memory_outbox)").all() as {
      name: string;
    }[];
    if (!columns.some((column) => column.name === "withdrawn"))
      db.exec(
        "ALTER TABLE memory_outbox ADD COLUMN withdrawn INTEGER NOT NULL DEFAULT 0",
      );
    if (!columns.some((column) => column.name === "lease_token"))
      db.exec("ALTER TABLE memory_outbox ADD COLUMN lease_token TEXT");
  }
  enqueue(input: MemoryEnvelope, options: { held?: boolean } = {}) {
    const record = memoryEnvelope.parse(input);
    const key = `trove-v1:${record.learnerScope}:${record.eventId}`,
      payload = JSON.stringify(record),
      hash = createHash("sha256").update(payload).digest("hex");
    const existing = this.get(key);
    if (existing && existing.payload_hash !== hash)
      throw new Error(
        "A memory operation key cannot be reused with changed content.",
      );
    this.db
      .prepare(
        "INSERT OR IGNORE INTO memory_outbox(operation_key,payload,payload_hash,state) VALUES(?,?,?,?)",
      )
      .run(key, payload, hash, options.held ? "held" : "pending");
    return key;
  }
  /** Runs inside the same transaction as the family's local domain mutation. */
  synchronizeHeld(scope: string, records: MemoryEnvelope[], dispatch = false) {
    if (!this.db.isTransaction)
      throw new Error("Memory synchronization requires a domain transaction.");
    if (records.some((record) => record.learnerScope !== scope))
      throw new Error("Memory scope mismatch.");
    const activeIds = new Set(records.map((record) => record.eventId));
    for (const job of this.forScope(scope)) {
      const record = JSON.parse(job.payload) as MemoryEnvelope;
      // Only never-dispatched local records are removed here. This is not a
      // remote deletion implementation and cannot retract a provider upload.
      if (!activeIds.has(record.eventId)) {
        if (job.attempts === 0 && ["held", "pending"].includes(job.state))
          this.db
            .prepare(
              "DELETE FROM memory_outbox WHERE operation_key=? AND attempts=0",
            )
            .run(job.operation_key);
        else
          this.db
            .prepare(
              "UPDATE memory_outbox SET withdrawn=1 WHERE operation_key=?",
            )
            .run(job.operation_key);
      }
    }
    for (const record of records) {
      const key = this.enqueue(record, { held: !dispatch });
      this.db
        .prepare(
          `UPDATE memory_outbox SET state=? WHERE operation_key=? AND state IN ('held','pending') AND job_id IS NULL AND attempts=0 AND withdrawn=0`,
        )
        .run(dispatch ? "pending" : "held", key);
    }
  }
  forScope(scope: string) {
    return this.db
      .prepare(
        "SELECT * FROM memory_outbox WHERE json_extract(payload,'$.learnerScope')=? ORDER BY operation_key",
      )
      .all(scope) as Job[];
  }
  get(key: string) {
    return this.db
      .prepare("SELECT * FROM memory_outbox WHERE operation_key=?")
      .get(key) as Job | undefined;
  }
  async processOne(
    input: MemoryGateway | ((scope: string) => MemoryGateway),
    now = Date.now(),
  ) {
    const lease = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    let job: Job | undefined;
    try {
      job = this.db
        .prepare(
          "SELECT * FROM memory_outbox WHERE state IN ('pending','accepted') AND (withdrawn=0 OR job_id IS NOT NULL) AND next_at<=? AND lease_until<=? ORDER BY next_at,operation_key LIMIT 1",
        )
        .get(now, now) as Job | undefined;
      if (job)
        this.db
          .prepare(
            "UPDATE memory_outbox SET lease_until=?,lease_token=?,attempts=attempts+1 WHERE operation_key=?",
          )
          .run(now + 60_000, lease, job.operation_key);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (!job) return false;
    let gateway: MemoryGateway | undefined;
    try {
      const record = JSON.parse(job.payload) as MemoryEnvelope;
      gateway =
        typeof input === "function" ? input(record.learnerScope) : input;
      if (!job.job_id) {
        const id = await gateway.submit(record, job.operation_key);
        this.db
          .prepare(
            "UPDATE memory_outbox SET state='accepted',job_id=?,lease_until=0,next_at=?,error_code=NULL WHERE operation_key=? AND lease_token=?",
          )
          .run(id, now + 1500, job.operation_key, lease);
      } else {
        const status = await gateway.status(job.job_id);
        if (status.state === "confirmed" && status.blobId)
          this.db
            .prepare(
              "UPDATE memory_outbox SET state='confirmed',blob_id=?,lease_until=0,error_code=NULL WHERE operation_key=? AND lease_token=?",
            )
            .run(status.blobId, job.operation_key, lease);
        else if (status.state === "failed")
          this.db
            .prepare(
              "UPDATE memory_outbox SET state='failed',lease_until=0,error_code='PROVIDER_JOB_FAILED' WHERE operation_key=? AND lease_token=?",
            )
            .run(job.operation_key, lease);
        else
          this.db
            .prepare(
              "UPDATE memory_outbox SET lease_until=0,next_at=? WHERE operation_key=? AND lease_token=?",
            )
            .run(now + 5000, job.operation_key, lease);
      }
    } catch (error) {
      const hint = error as { status?: number; retryAfterSeconds?: number };
      const terminal =
        [400, 401, 403, 409].includes(hint.status ?? 0) || job.attempts >= 19;
      const backoff = Math.min(60_000, 1500 * 2 ** Math.min(job.attempts, 5));
      const delay = Math.max(
        backoff,
        Math.min(300_000, Math.max(0, hint.retryAfterSeconds ?? 0) * 1000),
      );
      this.db
        .prepare(
          "UPDATE memory_outbox SET state=?,lease_until=0,next_at=?,error_code=? WHERE operation_key=? AND lease_token=?",
        )
        .run(
          terminal ? "failed" : job.job_id ? "accepted" : "pending",
          now + delay,
          terminal ? "NEEDS_REVIEW" : "RETRYABLE_PROVIDER_ERROR",
          job.operation_key,
          lease,
        );
    } finally {
      gateway?.destroy?.();
    }
    return true;
  }
}
