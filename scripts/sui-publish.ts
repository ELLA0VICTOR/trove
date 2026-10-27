import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { TatumSuiGateway } from "../server/integrations/tatum.ts";
import { configuredValue } from "../server/config.ts";

const destination = resolve("contracts/practice/deployment.testnet.json");
if (existsSync(destination))
  throw new Error(
    "A deployment manifest already exists. Reuse it; do not publish duplicate packages.",
  );
const key = configuredValue(process.env, "TATUM_API_KEY");
if (!key) throw new Error("TATUM_API_KEY is required.");
const keys = JSON.parse(
  readFileSync(
    resolve(process.env.TROVE_DATA_DIR ?? ".trove", "sui-testnet-keys.json"),
    "utf8",
  ),
);
const signer = Ed25519Keypair.fromSecretKey(keys.sponsorKey);
const rawBuild = readFileSync(".artifacts/contracts/build.json");
const buildText =
  rawBuild[0] === 255 && rawBuild[1] === 254
    ? rawBuild.subarray(2).toString("utf16le")
    : rawBuild.toString("utf8").replace(/^\uFEFF/, "");
const build = z
  .object({ modules: z.array(z.string()), dependencies: z.array(z.string()) })
  .parse(JSON.parse(buildText));
const gateway = new TatumSuiGateway(key, "testnet");
try {
  const intentPath = resolve(
    process.env.TROVE_DATA_DIR ?? ".trove",
    "publish-intent.json",
  );
  let intent: { bytes: string; signature: string; digest: string };
  if (existsSync(intentPath))
    intent = JSON.parse(readFileSync(intentPath, "utf8"));
  else {
    const tx = new Transaction();
    const [cap] = tx.publish(build);
    tx.transferObjects([cap], signer.toSuiAddress());
    tx.setGasBudget(150_000_000);
    tx.setSender(signer.toSuiAddress());
    const balance = (
      await gateway.client.getBalance({ owner: signer.toSuiAddress() })
    ).balance;
    if (BigInt(balance.addressBalance) >= 150_000_000n) tx.setGasPayment([]);
    const bytes = await tx.build({ client: gateway.client });
    intent = {
      bytes: toBase64(bytes),
      signature: (await signer.signTransaction(bytes)).signature,
      digest: await tx.getDigest(),
    };
    writeFileSync(intentPath, JSON.stringify(intent), {
      flag: "wx",
      mode: 0o600,
    });
  }
  let result;
  try {
    result = await gateway.client.getTransaction({
      digest: intent.digest,
      include: { effects: true, objectTypes: true },
    });
  } catch {
    /* absent or unknown; submitting identical signed bytes cannot publish twice */
  }
  if (!result)
    result = await gateway.client.executeTransaction({
      transaction: fromBase64(intent.bytes),
      signatures: [intent.signature],
      include: { effects: true, objectTypes: true },
    });
  if (!result.Transaction) throw new Error("Sui Testnet publication aborted.");
  const confirmed = await gateway.client.waitForTransaction({
    result,
    include: { effects: true, objectTypes: true },
    timeout: 60_000,
  });
  if (!confirmed.Transaction) throw new Error("Publication did not confirm.");
  const packageObject = confirmed.Transaction.effects.changedObjects.find(
    (o) => o.outputState === "PackageWrite",
  );
  if (!packageObject) throw new Error("No published package was returned.");
  const manifest = {
    network: "testnet",
    provider: "Tatum",
    packageId: packageObject.objectId,
    digest: confirmed.Transaction.digest,
    publishedAt: new Date().toISOString(),
    moduleHash: createHash("sha256")
      .update(JSON.stringify(build.modules))
      .digest("hex"),
    toolchain: "testnet-v1.82.2",
    upgradePolicy:
      "Upgrade capability retained by Testnet deployer; prototype is not immutable.",
  };
  writeFileSync(destination, JSON.stringify(manifest, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  gateway.destroy();
}
