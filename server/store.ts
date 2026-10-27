import { Database, StateConflict } from "./database.ts";
import { InputError } from "../shared/model.ts";
import type { DemoState, Quote } from "../shared/model.ts";
import { seedState } from "../shared/fixtures.ts";
import { createHash } from "node:crypto";
import { MemoryOutbox } from "./jobs/memory-outbox.ts";
const version = Symbol("database-version");
type Versioned = DemoState & { [version]?: number };
export const memoryNamespace = (family: string, account: boolean) =>
  `${account ? "account" : "local"}_${createHash("sha256").update(`trove-local-v1:${family}`).digest("hex")}`;
export class DemoStore {
  db: Database;
  readonly memoryOutbox: MemoryOutbox;
  readonly liveMemory: boolean;
  constructor(
    filename: string | Database,
    options: {
      liveMemory?: boolean;
    } = {},
  ) {
    this.liveMemory = options.liveMemory ?? false;
    this.db =
      typeof filename === "string" ? new Database({ filename }) : filename;
    this.memoryOutbox = new MemoryOutbox(this.db);
  }
  async get(id: string): Promise<DemoState> {
    if (this.db.isTransaction) await this.db.lock(`family:${id}`);
    const row = (await this.db
      .prepare("SELECT state,version FROM families WHERE id = ?")
      .get(id)) as
      | {
          state: string;
          version: number;
        }
      | undefined;
    if (row) {
      const state = JSON.parse(row.state) as Versioned;
      state[version] = row.version;
      return await this.hydrate(state);
    }
    const state = seedState(id) as Versioned;
    state[version] = -1;
    try {
      await this.set(state);
    } catch (error) {
      if (error instanceof StateConflict) return this.get(id);
      throw error;
    }
    return state;
  }
  async profile(family: string) {
    return (await this.db
      .prepare("SELECT memory_enabled FROM account_profiles WHERE family=?")
      .get(family)) as
      | {
          memory_enabled: number;
        }
      | undefined;
  }
  private async hydrate(state: DemoState) {
    const jobs = await this.memoryOutbox.forScope(
      await this.memoryScope(state.id),
    );
    const byId = new Map(
      jobs
        .filter((job) => !job.withdrawn)
        .map((job) => [JSON.parse(job.payload).eventId as string, job]),
    );
    for (const memory of state.memories) {
      const job = byId.get(memory.id);
      if (job && job.state !== "held") memory.syncStatus = job.state;
      else delete memory.syncStatus;
      if (job?.state === "confirmed" && job.blob_id)
        memory.blobId = job.blob_id;
      else delete memory.blobId;
    }
    for (const decision of state.decisions.filter(
      (item) => item.origin === "local",
    )) {
      const memory = state.memories.find(
        (item) => item.decisionId === decision.id && item.kind === "decision",
      );
      const job = memory ? byId.get(memory.id) : undefined;
      decision.memoryStatus =
        job?.state === "confirmed"
          ? "confirmed"
          : job && ["pending", "accepted"].includes(job.state)
            ? "queued"
            : "local";
    }
    return state;
  }
  async set(state: DemoState) {
    const persist = async () => {
      await this.db.lock(`family:${state.id}`);
      let expected = (state as Versioned)[version];
      if (expected === undefined)
        expected =
          ((
            await this.db
              .prepare("SELECT version FROM families WHERE id=?")
              .get(state.id)
          )?.version as number | undefined) ?? -1;
      const scope = await this.memoryScope(state.id);
      await this.memoryOutbox.synchronizeHeld(
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
        this.liveMemory && (await this.profile(state.id))?.memory_enabled === 1,
      );
      const changed =
        expected < 0
          ? await this.db
              .prepare(
                "INSERT OR IGNORE INTO families(id,state,version) VALUES(?,?,0)",
              )
              .run(state.id, JSON.stringify(state))
          : await this.db
              .prepare(
                "UPDATE families SET state=?,version=version+1 WHERE id=? AND version=?",
              )
              .run(JSON.stringify(state), state.id, expected);
      if (!changed.changes) throw new StateConflict();
      (state as Versioned)[version] = expected + 1;
      await this.db
        .prepare("DELETE FROM coaching_cache WHERE family=?")
        .run(state.id);
    };
    if (this.db.isTransaction) await persist();
    else await this.atomic(persist);
  }
  async memoryScope(family: string) {
    // Explicitly local-only identity. These sample namespaces must never be
    // bulk-enabled for publication when genuine authentication is introduced.
    return memoryNamespace(family, Boolean(await this.profile(family)));
  }
  async memoryStatus(family: string) {
    const state = await this.get(family);
    const jobs = await this.memoryOutbox.forScope(
      await this.memoryScope(family),
    );
    return {
      mode: (await this.profile(family)) ? "account" : "local-only",
      dispatchEnabled:
        this.liveMemory && (await this.profile(family))?.memory_enabled === 1,
      submissionEligible: Boolean(await this.profile(family)),
      confirmedMainnet: jobs.filter(
        (job) => job.state === "confirmed" && !job.withdrawn,
      ).length,
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
          jobId: job.job_id ?? undefined,
          blobId: job.blob_id ?? undefined,
          withdrawn: Boolean(job.withdrawn),
        };
      }),
    };
  }
  async reset(id: string) {
    return await this.atomic(async () => {
      const state = seedState(id);
      await this.db.prepare("DELETE FROM quotes WHERE family=?").run(id);
      await this.set(state);
      return state;
    });
  }
  async putQuote(family: string, quote: Quote) {
    await this.db
      .prepare("INSERT INTO quotes(id,family,payload) VALUES (?,?,?)")
      .run(quote.id, family, JSON.stringify(quote));
  }
  async getQuote(
    family: string,
    id: string,
  ): Promise<{
    quote: Quote;
    decision?: string;
  }> {
    const row = (await this.db
      .prepare("SELECT payload,decision FROM quotes WHERE id=? AND family=?")
      .get(id, family)) as
      | {
          payload: string;
          decision: string | null;
        }
      | undefined;
    if (!row)
      throw new InputError(
        "This order preview was not found. Please preview it again.",
      );
    return {
      quote: JSON.parse(row.payload),
      decision: row.decision ?? undefined,
    };
  }
  async consumeQuote(id: string, decision: string) {
    await this.db
      .prepare("UPDATE quotes SET decision=? WHERE id=? AND decision IS NULL")
      .run(decision, id);
  }
  async atomic<T>(operation: () => T | Promise<T>): Promise<T> {
    return await this.db.transaction(operation);
  }
}
