import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
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
};
/** Durable infrastructure. Uploads are intentionally not started by the local demo. */
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
  }
  enqueue(record: MemoryEnvelope) {
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
        "INSERT OR IGNORE INTO memory_outbox(operation_key,payload,payload_hash) VALUES(?,?,?)",
      )
      .run(key, payload, hash);
    return key;
  }
  get(key: string) {
    return this.db
      .prepare("SELECT * FROM memory_outbox WHERE operation_key=?")
      .get(key) as Job | undefined;
  }
  async processOne(gateway: MemoryGateway, now = Date.now()) {
    this.db.exec("BEGIN IMMEDIATE");
    let job: Job | undefined;
    try {
      job = this.db
        .prepare(
          "SELECT * FROM memory_outbox WHERE state IN ('pending','accepted') AND next_at<=? AND lease_until<=? ORDER BY next_at,operation_key LIMIT 1",
        )
        .get(now, now) as Job | undefined;
      if (job)
        this.db
          .prepare(
            "UPDATE memory_outbox SET lease_until=?,attempts=attempts+1 WHERE operation_key=?",
          )
          .run(now + 60_000, job.operation_key);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (!job) return false;
    try {
      if (!job.job_id) {
        const id = await gateway.submit(
          JSON.parse(job.payload) as MemoryEnvelope,
          job.operation_key,
        );
        this.db
          .prepare(
            "UPDATE memory_outbox SET state='accepted',job_id=?,lease_until=0,next_at=?,error_code=NULL WHERE operation_key=?",
          )
          .run(id, now + 1500, job.operation_key);
      } else {
        const status = await gateway.status(job.job_id);
        if (status.state === "confirmed" && status.blobId)
          this.db
            .prepare(
              "UPDATE memory_outbox SET state='confirmed',blob_id=?,lease_until=0,error_code=NULL WHERE operation_key=?",
            )
            .run(status.blobId, job.operation_key);
        else if (status.state === "failed")
          this.db
            .prepare(
              "UPDATE memory_outbox SET state='failed',lease_until=0,error_code='PROVIDER_JOB_FAILED' WHERE operation_key=?",
            )
            .run(job.operation_key);
        else
          this.db
            .prepare(
              "UPDATE memory_outbox SET lease_until=0,next_at=? WHERE operation_key=?",
            )
            .run(now + 5000, job.operation_key);
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
          "UPDATE memory_outbox SET state=?,lease_until=0,next_at=?,error_code=? WHERE operation_key=?",
        )
        .run(
          terminal ? "failed" : job.job_id ? "accepted" : "pending",
          now + delay,
          terminal ? "NEEDS_REVIEW" : "RETRYABLE_PROVIDER_ERROR",
          job.operation_key,
        );
    }
    return true;
  }
}
