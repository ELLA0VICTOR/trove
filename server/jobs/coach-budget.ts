import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Database, asDatabase } from "../database.ts";
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
        Number.isSafeInteger(value) && value >= 0 && value <= 100000000,
    )
  )
    throw new CoachBudgetError("The coach returned invalid token usage.");
  return input * INPUT_NANO_PER_TOKEN + output * OUTPUT_NANO_PER_TOKEN;
}
export class CoachBudget {
  private readonly db: Database;
  private readonly limit: number;
  constructor(db: Database | DatabaseSync, limitUsd = "1.00") {
    this.db = asDatabase(db);
    const amount = parseDollars(limitUsd);
    if (amount <= 0n || amount > 5000000n)
      throw new CoachBudgetError(
        "Set a positive coach allowance no greater than $5.00.",
      );
    this.limit = Number(amount * 1000n);
  }
  async reserve(
    model: string,
    inputTokenAllowance: number,
    outputLimit: number,
  ) {
    if (model !== COACH_MODEL)
      throw new CoachBudgetError(
        "This coach model has no verified price configuration. No request was sent.",
      );
    const cost = estimate(inputTokenAllowance, outputLimit);
    return await this.db.transaction(async () => {
      await this.db.lock("coach-budget");
      const spent = await this.total();
      if (spent + cost > this.limit)
        throw new CoachBudgetError(
          "Trove's coach allowance is exhausted. No paid request was sent.",
        );
      const id = randomUUID();
      await this.db
        .prepare(
          `INSERT INTO coach_usage
        (id,model,state,reserved_nano,estimated_nano,created_at) VALUES(?,?,'reserved',?,?,?)`,
        )
        .run(id, model, cost, cost, new Date().toISOString());
      return id;
    });
  }
  async settle(id: string, input: number, output: number) {
    const cost = estimate(input, output);
    await this.db
      .prepare(
        `UPDATE coach_usage SET state='settled',estimated_nano=?,input_tokens=?,output_tokens=?
      WHERE id=? AND state='reserved'`,
      )
      .run(cost, input, output, id);
  }
  async uncertain(id: string) {
    // Timeout or invalid/missing usage can still represent a billed request.
    // Preserve the full reservation; do not free it and blindly retry.
    await this.db
      .prepare(
        "UPDATE coach_usage SET state='uncertain' WHERE id=? AND state='reserved'",
      )
      .run(id);
  }
  async total() {
    return (
      (await this.db
        .prepare(
          "SELECT CAST(COALESCE(SUM(estimated_nano),0) AS BIGINT) AS total FROM coach_usage",
        )
        .get()) as {
        total: number;
      }
    ).total;
  }
  async summary() {
    const spent = await this.total();
    const counts = (await this.db
      .prepare("SELECT COUNT(*) AS requests FROM coach_usage")
      .get()) as {
      requests: number;
    };
    return {
      allowanceUsd: (this.limit / 1e9).toFixed(6),
      estimatedOrReservedUsd: (spent / 1e9).toFixed(6),
      remainingUsd: (Math.max(0, this.limit - spent) / 1e9).toFixed(6),
      requests: counts.requests,
    };
  }
}
