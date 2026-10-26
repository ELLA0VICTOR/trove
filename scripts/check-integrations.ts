import { TatumSuiGateway } from "../server/integrations/tatum.ts";
import { WalrusMemoryGateway } from "../server/integrations/walrus.ts";
import { CoachGateway } from "../server/integrations/coach.ts";
import { MarketstackGateway } from "../server/integrations/marketstack.ts";
import { randomUUID } from "node:crypto";
import { configuredValue } from "../server/config.ts";

const env = process.env;
const key = (name: string) => configuredValue(env, name);
const serviceIndex = process.argv.indexOf("--service");
const service = serviceIndex < 0 ? "all" : process.argv[serviceIndex + 1];
if (!["all", "tatum", "walrus", "market", "coach"].includes(service ?? "")) {
  console.error("Use --service tatum, walrus, market, or coach.");
  process.exit(1);
}
const selected = (name: string) => service === "all" || service === name;

async function checkpoint(variable: string, network: "testnet" | "mainnet") {
  const gateway = new TatumSuiGateway(key(variable)!, network);
  try {
    return await gateway.checkpoint();
  } finally {
    gateway.destroy();
  }
}

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
if (selected("tatum") && key("TATUM_API_KEY"))
  await check("Tatum Testnet read", () =>
    checkpoint("TATUM_API_KEY", "testnet"),
  );
else if (selected("tatum"))
  results.push({
    service: "Tatum",
    status: "not configured",
    detail: "Set TATUM_API_KEY on the server.",
  });

if (selected("tatum") && key("TATUM_MAINNET_API_KEY"))
  await check("Tatum Mainnet read", () =>
    checkpoint("TATUM_MAINNET_API_KEY", "mainnet"),
  );
else if (selected("tatum"))
  results.push({
    service: "Tatum Mainnet",
    status: "not configured",
    detail: "Set TATUM_MAINNET_API_KEY for Mainnet evidence reads.",
  });

if (selected("market") && key("MARKETSTACK_API_KEY"))
  await check("Marketstack history", async () => {
    const history = await new MarketstackGateway(
      key("MARKETSTACK_API_KEY")!,
    ).history("AAPL", "2026-08-01", "2026-10-01");
    return {
      symbol: history.symbol,
      bars: history.prices.length,
      basis: history.basis,
    };
  });
else if (selected("market"))
  results.push({
    service: "Market data",
    status: "not configured",
    detail: "Provider key and appropriate data permissions required.",
  });

if (selected("walrus") && key("MEMWAL_ACCOUNT_ID") && key("MEMWAL_PRIVATE_KEY"))
  await check("Walrus authenticated recall", async () => {
    const gateway = new WalrusMemoryGateway({
      accountId: key("MEMWAL_ACCOUNT_ID")!,
      delegateKey: key("MEMWAL_PRIVATE_KEY")!,
      learnerScope: "preflight",
      serverUrl: key("MEMWAL_SERVER_URL"),
    });
    try {
      const matches = await gateway.recall("Trove connection check");
      return {
        network: "mainnet",
        authenticated: true,
        matches: matches.length,
        note: "Read-only credential check; zero matches is valid. No memory text is printed. This does not prove writes or ten stored memories.",
      };
    } finally {
      gateway.destroy();
    }
  });
else if (selected("walrus"))
  results.push({
    service: "Walrus authenticated recall",
    status: "not configured",
    detail:
      "Set MEMWAL_ACCOUNT_ID and MEMWAL_PRIVATE_KEY. No read was attempted.",
  });

if (
  selected("walrus") &&
  process.argv.includes("--write-memory") &&
  key("MEMWAL_ACCOUNT_ID") &&
  key("MEMWAL_PRIVATE_KEY")
) {
  await check("Walrus explicit Mainnet write", async () => {
    const gateway = new WalrusMemoryGateway({
      accountId: key("MEMWAL_ACCOUNT_ID")!,
      delegateKey: key("MEMWAL_PRIVATE_KEY")!,
      learnerScope: "preflight",
      serverUrl: key("MEMWAL_SERVER_URL"),
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
} else if (selected("walrus"))
  results.push({
    service: "Walrus writes",
    status: "not exercised",
    detail:
      "Requires credentials and explicit --write-memory. No diagnostic writes occur by default.",
  });

if (
  selected("coach") &&
  process.argv.includes("--model-call") &&
  key("ANTHROPIC_API_KEY") &&
  key("COACH_MODEL")
)
  await check("Explicit model call", () =>
    new CoachGateway(key("ANTHROPIC_API_KEY")!, key("COACH_MODEL")!).explain(
      "Explain why five companies can still share risk.",
      [],
    ),
  );
else if (selected("coach"))
  results.push({
    service: "Live coach",
    status: "not exercised",
    detail:
      "Requires credentials, a chosen model, and explicit --model-call. Calls are metered.",
  });
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.status === "failed")) process.exitCode = 1;
