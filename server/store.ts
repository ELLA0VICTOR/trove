import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { InputError } from "../shared/model.ts";
import type { DemoState, Quote } from "../shared/model.ts";
import { seedState } from "../shared/fixtures.ts";

export class DemoStore {
  db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, family TEXT NOT NULL, payload TEXT NOT NULL, decision TEXT);",
    );
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
    this.db
      .prepare(
        "INSERT INTO families(id,state) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
      )
      .run(state.id, JSON.stringify(state));
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
