import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { parseDollars } from "../../shared/model.ts";

// Standard, uncached text rates verified October 26, 2026. No paid tools.
// 1 nano-USD = $0.000000001. Unknown models fail closed instead of guessing.
export const COACH_MODEL = "gpt-6-luna";
const INPUT_NANO_PER_TOKEN = 100;
const OUTPUT_NANO_PER_TOKEN = 500;

export class CoachBudgetError extends Error {}

function estimate(input: number, output: number) {
  if (
    ![input, output].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000,
    )
  )
    throw new CoachBudgetError("The coach returned invalid token usage.");
  return input * INPUT_NANO_PER_TOKEN + output * OUTPUT_NANO_PER_TOKEN;
}

export class CoachBudget {
  private readonly db: DatabaseSync;
  private readonly limit: number;
  constructor(db: DatabaseSync, limitUsd = "1.00") {
    this.db = db;
    const amount = parseDollars(limitUsd);
    if (amount <= 0n || amount > 5_000_000n)
      throw new CoachBudgetError(
        "Set a positive coach allowance no greater than $5.00.",
      );
    this.limit = Number(amount * 1000n);
    db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS coach_usage (
      id TEXT PRIMARY KEY, model TEXT NOT NULL, state TEXT NOT NULL,
      reserved_nano INTEGER NOT NULL, estimated_nano INTEGER NOT NULL,
      input_tokens INTEGER, output_tokens INTEGER, created_at TEXT NOT NULL
    )`);
  }
  reserve(model: string, inputTokenAllowance: number, outputLimit: number) {
    if (model !== COACH_MODEL)
      throw new CoachBudgetError(
        "This coach model has no verified price configuration. No request was sent.",
      );
    const cost = estimate(inputTokenAllowance, outputLimit);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const spent = this.total();
      if (spent + cost > this.limit)
        throw new CoachBudgetError(
          "Trove's coach allowance is exhausted. No paid request was sent.",
        );
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO coach_usage
        (id,model,state,reserved_nano,estimated_nano,created_at) VALUES(?,?,'reserved',?,?,?)`,
        )
        .run(id, model, cost, cost, new Date().toISOString());
      this.db.exec("COMMIT");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  settle(id: string, input: number, output: number) {
    const cost = estimate(input, output);
    this.db
      .prepare(
        `UPDATE coach_usage SET state='settled',estimated_nano=?,input_tokens=?,output_tokens=?
      WHERE id=? AND state='reserved'`,
      )
      .run(cost, input, output, id);
  }
  uncertain(id: string) {
    // Timeout or invalid/missing usage can still represent a billed request.
    // Preserve the full reservation; do not free it and blindly retry.
    this.db
      .prepare(
        "UPDATE coach_usage SET state='uncertain' WHERE id=? AND state='reserved'",
      )
      .run(id);
  }
  private total() {
    return (
      this.db
        .prepare(
          "SELECT COALESCE(SUM(estimated_nano),0) AS total FROM coach_usage",
        )
        .get() as { total: number }
    ).total;
  }
  summary() {
    const spent = this.total();
    const counts = this.db
      .prepare("SELECT COUNT(*) AS requests FROM coach_usage")
      .get() as { requests: number };
    return {
      allowanceUsd: (this.limit / 1e9).toFixed(6),
      estimatedOrReservedUsd: (spent / 1e9).toFixed(6),
      remainingUsd: (Math.max(0, this.limit - spent) / 1e9).toFixed(6),
      requests: counts.requests,
    };
  }
}
