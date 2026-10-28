import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configuredValue } from "./config.ts";
import { TatumSuiGateway } from "./integrations/tatum.ts";
import type { ChainConfig } from "./chain.ts";
import manifest from "../contracts/practice/deployment.testnet.json" with { type: "json" };
import mainnetManifest from "../contracts/practice/deployment.mainnet.json" with { type: "json" };
import type { SuiNetwork } from "../shared/network.ts";

export function configuredNetwork(env = process.env): SuiNetwork {
  const value = env.SUI_NETWORK?.trim() || "testnet";
  if (value !== "mainnet" && value !== "testnet")
    throw new Error("SUI_NETWORK must be mainnet or testnet.");
  return value;
}
type Deployment = {
  packageId: string | null;
  originalPackageId?: string | null;
  version: number;
  eventTypeOrigins?: Record<string, string>;
};
const deployments: Record<SuiNetwork, Deployment> = {
  testnet: manifest,
  mainnet: mainnetManifest,
};

function publicAddress(value: string | undefined) {
  const unquoted = value?.trim().replace(/^(["'])(.*)\1$/, "$2");
  return unquoted && /^0x[\da-f]{1,64}$/i.test(unquoted)
    ? "0x" + unquoted.slice(2).toLowerCase().padStart(64, "0")
    : unquoted;
}

export function practiceDeployment(
  packageValue?: string,
  originalValue?: string,
  network: SuiNetwork = "testnet",
) {
  const selected = deployments[network];
  const packageId = publicAddress(packageValue) ?? selected.packageId;
  if (!packageId)
    throw new Error(
      "Publish the Mainnet practice package before enabling SUI_NETWORK=mainnet.",
    );
  const current = packageId === selected.packageId;
  return {
    packageId,
    fundingReady: current && Number(selected.version) >= 3,
    enrollmentReady: current && Number(selected.version) >= 4,
    originalPackageId:
      publicAddress(originalValue) ??
      (current ? selected.originalPackageId : undefined) ??
      packageId,
  };
}

export function chainConfig(dataDir: string): ChainConfig | undefined {
  const value = (name: string) => configuredValue(process.env, name);
  const network = configuredNetwork();
  const selected = deployments[network];
  const localFile = resolve(dataDir, `sui-${network}-keys.json`);
  const local =
    process.env.NODE_ENV !== "production" && existsSync(localFile)
      ? JSON.parse(readFileSync(localFile, "utf8"))
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
  const sponsorKey =
    value(
      network === "mainnet"
        ? "SUI_MAINNET_SPONSOR_KEY"
        : "SUI_TESTNET_SPONSOR_KEY",
    ) ?? local.sponsorKey;
  const attestorKey =
    value(
      network === "mainnet"
        ? "SUI_MAINNET_QUOTE_ATTESTOR_KEY"
        : "SUI_QUOTE_ATTESTOR_KEY",
    ) ?? local.attestorKey;
  const apiKey = value(
    network === "mainnet" ? "TATUM_MAINNET_API_KEY" : "TATUM_API_KEY",
  );
  if (!sponsorKey || !attestorKey || !apiKey) return undefined;
  return {
    ...deployment,
    eventTypeOrigins:
      deployment.packageId === selected.packageId &&
      deployment.originalPackageId === selected.originalPackageId
        ? selected.eventTypeOrigins
        : undefined,
    sponsorKey,
    attestorKey,
    gateway: new TatumSuiGateway(apiKey, network),
  };
}
