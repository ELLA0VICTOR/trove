import { TatumSuiGateway } from "../server/integrations/tatum.ts";
import { WalrusMemoryGateway } from "../server/integrations/walrus.ts";
import { CoachGateway } from "../server/integrations/coach.ts";
import { MarketstackGateway } from "../server/integrations/marketstack.ts";
import { randomUUID } from "node:crypto";

const results: { service: string; status: string; detail: unknown }[] = [];
async function check(service: string, operation: () => Promise<unknown>) {
  try {
    results.push({ service, status: "checked", detail: await operation() });
  } catch {
    results.push({
      service,
      status: "failed",
      detail:
        "The check failed. Inspect service credentials, entitlements, runtime and network; secret-bearing errors are not printed.",
    });
  }
}
if (process.env.TATUM_API_KEY)
  await check("Tatum Testnet read", () =>
    new TatumSuiGateway(process.env.TATUM_API_KEY!, "testnet").checkpoint(),
  );
else
  results.push({
    service: "Tatum",
    status: "not configured",
    detail: "Set TATUM_API_KEY on the server.",
  });

if (process.env.MARKETSTACK_API_KEY)
  await check("Marketstack history", async () => {
    const history = await new MarketstackGateway(
      process.env.MARKETSTACK_API_KEY!,
    ).history("AAPL", "2026-08-01", "2026-10-01");
    return {
      symbol: history.symbol,
      bars: history.prices.length,
      basis: history.basis,
    };
  });
else
  results.push({
    service: "Market data",
    status: "not configured",
    detail: "Provider key and appropriate data permissions required.",
  });

if (
  process.argv.includes("--write-memory") &&
  process.env.MEMWAL_ACCOUNT_ID &&
  process.env.MEMWAL_PRIVATE_KEY
) {
  await check("Walrus explicit Mainnet write", async () => {
    const gateway = new WalrusMemoryGateway({
      accountId: process.env.MEMWAL_ACCOUNT_ID!,
      delegateKey: process.env.MEMWAL_PRIVATE_KEY!,
      learnerScope: "preflight",
    });
    try {
      const eventId = randomUUID(),
        id = await gateway.submit(
          {
            schemaVersion: 1,
            eventId,
            learnerScope: "preflight",
            kind: "reflection",
            text: "Trove integration preflight: original decisions, reflections and corrections are separate record types. This diagnostic is not a learner memory or submission-count evidence.",
            recordedAt: new Date().toISOString(),
          },
          `preflight:${eventId}`,
        );
      return {
        jobId: id,
        status: await gateway.status(id),
        note: "Acceptance is not confirmation; save the job ID and check it again. Do not resubmit after a polling timeout.",
      };
    } finally {
      gateway.destroy();
    }
  });
} else
  results.push({
    service: "Walrus",
    status: "not exercised",
    detail:
      "Requires credentials and explicit --write-memory. No diagnostic writes occur by default.",
  });

if (
  process.argv.includes("--model-call") &&
  process.env.ANTHROPIC_API_KEY &&
  process.env.COACH_MODEL
)
  await check("Explicit model call", () =>
    new CoachGateway(
      process.env.ANTHROPIC_API_KEY!,
      process.env.COACH_MODEL!,
    ).explain("Explain why five companies can still share risk.", []),
  );
else
  results.push({
    service: "Live coach",
    status: "not exercised",
    detail:
      "Requires credentials, a chosen model, and explicit --model-call. Calls are metered.",
  });
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
