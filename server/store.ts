import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { InputError } from "../shared/model.ts";
import type { DemoState, Quote } from "../shared/model.ts";
import { seedState } from "../shared/fixtures.ts";
import { createHash } from "node:crypto";
import { MemoryOutbox } from "./jobs/memory-outbox.ts";

export class DemoStore {
  db: DatabaseSync;
  readonly memoryOutbox: MemoryOutbox;
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, family TEXT NOT NULL, payload TEXT NOT NULL, decision TEXT);",
    );
    this.memoryOutbox = new MemoryOutbox(this.db);
  }
  get(id: string): DemoState {
    const row = this.db
      .prepare("SELECT state FROM families WHERE id = ?")
      .get(id) as { state: string } | undefined;
    if (row) return JSON.parse(row.state);
    const state = seedState(id);
    this.set(state);
    return state;
  }
  set(state: DemoState) {
    const persist = () => {
      const scope = this.memoryScope(state.id);
      this.memoryOutbox.synchronizeHeld(
        scope,
        state.memories
          .filter((record) => record.origin === "local" && record.active)
          .map((record) => ({
            schemaVersion: 1 as const,
            eventId: record.id,
            learnerScope: scope,
            kind: record.kind,
            text: record.text,
            recordedAt: record.recordedAt,
            ...(record.decisionId ? { decisionId: record.decisionId } : {}),
            ...(record.supersedes ? { supersedes: record.supersedes } : {}),
          })),
      );
      this.db
        .prepare(
          "INSERT INTO families(id,state) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
        )
        .run(state.id, JSON.stringify(state));
    };
    if (this.db.isTransaction) persist();
    else this.atomic(persist);
  }
  memoryScope(family: string) {
    // Explicitly local-only identity. These sample namespaces must never be
    // bulk-enabled for publication when genuine authentication is introduced.
    return `local_${createHash("sha256").update(`trove-local-v1:${family}`).digest("hex")}`;
  }
  memoryStatus(family: string) {
    const state = this.get(family);
    const jobs = this.memoryOutbox.forScope(this.memoryScope(family));
    return {
      mode: "local-only" as const,
      dispatchEnabled: false,
      submissionEligible: false,
      confirmedMainnet: 0,
      heldLocally: jobs.filter((job) => job.state === "held").length,
      sampleExcluded: state.memories.filter(
        (record) => record.origin === "sample",
      ).length,
      records: jobs.map((job) => {
        const record = JSON.parse(job.payload) as {
          eventId: string;
          kind: string;
          recordedAt: string;
          decisionId?: string;
        };
        return {
          id: record.eventId,
          kind: record.kind,
          recordedAt: record.recordedAt,
          decisionId: record.decisionId,
          status: job.state,
        };
      }),
    };
  }
  reset(id: string) {
    return this.atomic(() => {
      const state = seedState(id);
      this.db.prepare("DELETE FROM quotes WHERE family=?").run(id);
      this.set(state);
      return state;
    });
  }
  putQuote(family: string, quote: Quote) {
    this.db
      .prepare("INSERT INTO quotes(id,family,payload) VALUES (?,?,?)")
      .run(quote.id, family, JSON.stringify(quote));
  }
  getQuote(family: string, id: string): { quote: Quote; decision?: string } {
    const row = this.db
      .prepare("SELECT payload,decision FROM quotes WHERE id=? AND family=?")
      .get(id, family) as
      { payload: string; decision: string | null } | undefined;
    if (!row)
      throw new InputError(
        "This order preview was not found. Please preview it again.",
      );
    return {
      quote: JSON.parse(row.payload),
      decision: row.decision ?? undefined,
    };
  }
  consumeQuote(id: string, decision: string) {
    this.db
      .prepare("UPDATE quotes SET decision=? WHERE id=? AND decision IS NULL")
      .run(decision, id);
  }
  atomic<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
