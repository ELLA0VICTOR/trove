import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configuredValue } from "./config.ts";
import { TatumSuiGateway } from "./integrations/tatum.ts";
import type { ChainConfig } from "./chain.ts";

export function chainConfig(dataDir: string): ChainConfig | undefined {
  const value = (name: string) => configuredValue(process.env, name);
  const localFile = resolve(dataDir, "sui-testnet-keys.json");
  const local =
    process.env.NODE_ENV !== "production" && existsSync(localFile)
      ? JSON.parse(readFileSync(localFile, "utf8"))
      : {};
  const deployment = resolve("contracts/practice/deployment.testnet.json");
  const manifest = existsSync(deployment)
    ? JSON.parse(readFileSync(deployment, "utf8"))
    : {};
  const packageId = value("SUI_PACKAGE_ID") ?? manifest.packageId;
  const sponsorKey = value("SUI_TESTNET_SPONSOR_KEY") ?? local.sponsorKey;
  const attestorKey = value("SUI_QUOTE_ATTESTOR_KEY") ?? local.attestorKey;
  if (!packageId || !sponsorKey || !attestorKey || !value("TATUM_API_KEY"))
    return undefined;
  return {
    packageId,
    fundingReady:
      packageId === manifest.packageId && Number(manifest.version) >= 3,
    enrollmentReady:
      packageId === manifest.packageId && Number(manifest.version) >= 4,
    originalPackageId:
      value("SUI_ORIGINAL_PACKAGE_ID") ??
      (manifest.packageId === packageId
        ? manifest.originalPackageId
        : undefined) ??
      packageId,
    sponsorKey,
    attestorKey,
    gateway: new TatumSuiGateway(value("TATUM_API_KEY")!, "testnet"),
  };
}
