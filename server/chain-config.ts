import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configuredValue } from "./config.ts";
import { TatumSuiGateway } from "./integrations/tatum.ts";
import type { ChainConfig } from "./chain.ts";
import manifest from "../contracts/practice/deployment.testnet.json" with { type: "json" };

function publicAddress(value: string | undefined) {
  const unquoted = value?.trim().replace(/^(["'])(.*)\1$/, "$2");
  return unquoted && /^0x[\da-f]{1,64}$/i.test(unquoted)
    ? "0x" + unquoted.slice(2).toLowerCase().padStart(64, "0")
    : unquoted;
}

export function practiceDeployment(
  packageValue?: string,
  originalValue?: string,
) {
  const packageId = publicAddress(packageValue) ?? manifest.packageId;
  const current = packageId === manifest.packageId;
  return {
    packageId,
    fundingReady: current && Number(manifest.version) >= 3,
    enrollmentReady: current && Number(manifest.version) >= 4,
    originalPackageId:
      publicAddress(originalValue) ??
      (current ? manifest.originalPackageId : undefined) ??
      packageId,
  };
}

export function chainConfig(dataDir: string): ChainConfig | undefined {
  const value = (name: string) => configuredValue(process.env, name);
  const localFile = resolve(dataDir, "sui-testnet-keys.json");
  const local =
    process.env.NODE_ENV !== "production" && existsSync(localFile)
      ? JSON.parse(readFileSync(localFile, "utf8"))
      : {};
  const deployment = practiceDeployment(
    value("SUI_PACKAGE_ID"),
    value("SUI_ORIGINAL_PACKAGE_ID"),
  );
  const sponsorKey = value("SUI_TESTNET_SPONSOR_KEY") ?? local.sponsorKey;
  const attestorKey = value("SUI_QUOTE_ATTESTOR_KEY") ?? local.attestorKey;
  if (!sponsorKey || !attestorKey || !value("TATUM_API_KEY")) return undefined;
  return {
    ...deployment,
    sponsorKey,
    attestorKey,
    gateway: new TatumSuiGateway(value("TATUM_API_KEY")!, "testnet"),
  };
}
