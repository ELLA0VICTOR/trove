import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Database } from "../server/database.ts";
import { configuredValue } from "../server/config.ts";
import { seedHostedData } from "../server/bootstrap-data.ts";
import {
  configuredNetwork,
  practiceDeployment,
} from "../server/chain-config.ts";

const value = (key: string) => configuredValue(process.env, key);
const network = configuredNetwork({
  ...process.env,
  ...(process.argv.includes("--mainnet") ? { SUI_NETWORK: "mainnet" } : {}),
});
const url = value("DATABASE_URL");
if (!url)
  throw new Error(
    "Create a Neon Free project, copy its pooled connection string into DATABASE_URL in .env.local, then run npm run deploy:prepare again.",
  );
const output = resolve(".artifacts/vercel.env");
execFileSync("git", ["check-ignore", "--quiet", output], {
  stdio: "ignore",
  windowsHide: true,
});
const directory = resolve(value("TROVE_DATA_DIR") ?? ".trove"),
  keysPath = resolve(directory, `sui-${network}-keys.json`);
const keys = existsSync(keysPath)
  ? JSON.parse(readFileSync(keysPath, "utf8"))
  : {};
const deployment = practiceDeployment(
  value(network === "mainnet" ? "SUI_MAINNET_PACKAGE_ID" : "SUI_PACKAGE_ID"),
  value(
    network === "mainnet"
      ? "SUI_MAINNET_ORIGINAL_PACKAGE_ID"
      : "SUI_ORIGINAL_PACKAGE_ID",
  ),
  network,
);
const env: Record<string, string | undefined> = {
  DATABASE_URL: url,
  SUI_NETWORK: network,
  MEMWAL_ACCOUNT_ID: value("MEMWAL_ACCOUNT_ID"),
  MEMWAL_PRIVATE_KEY: value("MEMWAL_PRIVATE_KEY"),
  MEMWAL_SERVER_URL:
    value("MEMWAL_SERVER_URL") ?? "https://relayer.memory.walrus.xyz",
  OPENAI_API_KEY: value("OPENAI_API_KEY"),
  COACH_MODEL: value("COACH_MODEL") ?? "gpt-6-luna",
  COACH_BUDGET_USD: value("COACH_BUDGET_USD") ?? "1.00",
  ...(network === "mainnet"
    ? {
        TATUM_MAINNET_API_KEY: value("TATUM_MAINNET_API_KEY"),
        SUI_MAINNET_PACKAGE_ID: deployment.packageId,
        SUI_MAINNET_ORIGINAL_PACKAGE_ID: deployment.originalPackageId,
        SUI_MAINNET_SPONSOR_KEY:
          value("SUI_MAINNET_SPONSOR_KEY") ?? keys.sponsorKey,
        SUI_MAINNET_QUOTE_ATTESTOR_KEY:
          value("SUI_MAINNET_QUOTE_ATTESTOR_KEY") ?? keys.attestorKey,
      }
    : {
        TATUM_API_KEY: value("TATUM_API_KEY"),
        SUI_PACKAGE_ID: deployment.packageId,
        SUI_ORIGINAL_PACKAGE_ID: deployment.originalPackageId,
        SUI_TESTNET_SPONSOR_KEY:
          value("SUI_TESTNET_SPONSOR_KEY") ?? keys.sponsorKey,
        SUI_QUOTE_ATTESTOR_KEY:
          value("SUI_QUOTE_ATTESTOR_KEY") ?? keys.attestorKey,
      }),
};
const missing = Object.entries(env)
  .filter(([, entry]) => !entry)
  .map(([key]) => key);
if (value("RESEND_API_KEY") && value("EMAIL_FROM")) {
  env.RESEND_API_KEY = value("RESEND_API_KEY");
  env.EMAIL_FROM = value("EMAIL_FROM");
}
if (value("ALPACA_API_KEY") && value("ALPACA_API_SECRET")) {
  env.ALPACA_API_KEY = value("ALPACA_API_KEY");
  env.ALPACA_API_SECRET = value("ALPACA_API_SECRET");
}
if (value("MARKETSTACK_API_KEY"))
  env.MARKETSTACK_API_KEY = value("MARKETSTACK_API_KEY");
if (!env.ALPACA_API_KEY && !env.MARKETSTACK_API_KEY)
  missing.push("ALPACA_API_KEY + ALPACA_API_SECRET (or MARKETSTACK_API_KEY)");
if (missing.length)
  throw new Error(
    `Complete these local settings first: ${missing.join(", ")}. Secret values were not printed.`,
  );
const db = new Database({ url, chainNetwork: network });
try {
  await db.ready;
  const imported =
    network === "mainnet"
      ? {
          skipped:
            "Existing accounts and Mainnet memories preserved; Testnet chain records remain isolated.",
        }
      : await seedHostedData(db, directory);
  mkdirSync(".artifacts", { recursive: true });
  writeFileSync(
    output,
    Object.entries(env)
      .map(([key, entry]) => `${key}=${JSON.stringify(entry)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const dates = await db
    .prepare(
      "SELECT as_of FROM market_snapshots ORDER BY received_at DESC LIMIT 1",
    )
    .get();
  console.log(
    JSON.stringify(
      {
        database: "PostgreSQL connection and schema verified",
        imported,
        marketAsOf: dates?.as_of ?? "First visitor will import prices",
        environmentFile: ".artifacts/vercel.env",
        environmentValues:
          "Private: import this file in Vercel; never commit or paste it into chat",
        next: "Follow docs/VERCEL-DEPLOY.md. Provider model calls and wallet transactions were not made.",
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "The hosted database preparation could not complete. Check the Neon project and DATABASE_URL locally; secret values were not printed.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
