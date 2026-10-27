import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Database, StateConflict } from "../server/database.ts";
import { DemoStore } from "../server/store.ts";
import { preview, execute } from "../server/domain.ts";
import { CoachBudget, COACH_MODEL } from "../server/jobs/coach-budget.ts";
import { Accounts } from "../server/auth.ts";
import { configuredValue } from "../server/config.ts";

const url = configuredValue(process.env, "DATABASE_URL");
if (!url)
  throw new Error(
    "Set DATABASE_URL in .env.local first. No connection string should be pasted into chat.",
  );
const schema = "trove_check_" + randomUUID().replaceAll("-", "");
const first = new Database({ url, schema }),
  second = new Database({ url, schema });
let stage = "connect",
  cleanup = false;
try {
  await Promise.all([first.ready, second.ready]);
  cleanup = true;
  const a = new DemoStore(first),
    b = new DemoStore(second),
    family = randomUUID(),
    state = await a.get(family);
  stage = "concurrent order";
  const q = preview(state, {
    symbol: "AAPL",
    side: "buy",
    amount: "25",
    reason: "Synthetic storage verification",
  });
  await a.putQuote(family, q);
  await Promise.all([execute(a, family, q.id), execute(b, family, q.id)]);
  const current = await a.get(family);
  assert.equal(BigInt(current.cash), BigInt(state.cash) - BigInt(q.amount));
  assert.equal(
    current.decisions.filter((d) => d.reason === q.reason).length,
    1,
  );
  stage = "stale write";
  const stale = await b.get(family);
  current.cash = "100000000";
  await a.set(current);
  stale.cash = "0";
  await assert.rejects(() => b.set(stale), StateConflict);
  stage = "shared budget";
  const budgets = [
    new CoachBudget(first, "0.01"),
    new CoachBudget(second, "0.01"),
  ];
  const reservations = await Promise.allSettled(
    budgets.map((budget) => budget.reserve(COACH_MODEL, 50000, 100)),
  );
  assert.equal(reservations.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await budgets[0].total(), 5050000);
  stage = "single-use invitation";
  const accounts = new Accounts(a),
    other = new Accounts(b),
    registered = await accounts.register({
      username: "pg_check_parent",
      password: "synthetic-check-password",
    }),
    invitation = await accounts.invite(registered.member);
  const joined = await Promise.allSettled([
    accounts.join({
      code: invitation.code,
      username: "pg_check_one",
      password: "synthetic-check-password",
    }),
    other.join({
      code: invitation.code,
      username: "pg_check_two",
      password: "synthetic-check-password",
    }),
  ]);
  assert.equal(joined.filter((r) => r.status === "fulfilled").length, 1);
  console.log(
    JSON.stringify(
      {
        database: "Neon/PostgreSQL",
        checks: [
          "TLS connection",
          "schema initialization",
          "two independent connection pools",
          "one debit under duplicate concurrent execution",
          "stale write refusal",
          "shared budget reservation",
          "one-use invitation",
        ],
        providerModelCalls: 0,
        mainnetWrites: 0,
        isolatedSchema: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      databaseCheck: "failed",
      stage,
      code: (error as { code?: string }).code ?? "CHECK_FAILED",
      secretsPrinted: false,
    }),
  );
  process.exitCode = 1;
} finally {
  if (cleanup)
    await first.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {
      console.error(
        "Temporary verification schema needs cleanup; application tables were separate.",
      );
      process.exitCode = 1;
    });
  await Promise.allSettled([first.close(), second.close()]);
}
