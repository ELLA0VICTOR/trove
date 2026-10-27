import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { TatumSuiGateway } from "../server/integrations/tatum.ts";
const path = "contracts/practice/deployment.testnet.json",
  manifest = JSON.parse(readFileSync(path, "utf8"));
const build = JSON.parse(
  readFileSync(".artifacts/contracts/build.json", "utf8"),
);
const moduleHash = createHash("sha256")
  .update(JSON.stringify(build.modules))
  .digest("hex");
if (moduleHash === manifest.moduleHash) {
  console.log("The current package already contains this build.");
  process.exit(0);
}
const keys = JSON.parse(
  readFileSync(
    resolve(process.env.TROVE_DATA_DIR ?? ".trove", "sui-testnet-keys.json"),
    "utf8",
  ),
);
const signer = Ed25519Keypair.fromSecretKey(keys.sponsorKey),
  gateway = new TatumSuiGateway(process.env.TATUM_API_KEY!, "testnet");
const Cap = bcs.struct("UpgradeCap", {
  id: bcs.Address,
  package: bcs.Address,
  version: bcs.u64(),
  policy: bcs.u8(),
});
try {
  const intentPath = resolve(
    process.env.TROVE_DATA_DIR ?? ".trove",
    `upgrade-${moduleHash}.json`,
  );
  let intent: {
    bytes: string;
    signature: string;
    digest: string;
    cap: string;
    version: number;
  };
  if (existsSync(intentPath))
    intent = JSON.parse(readFileSync(intentPath, "utf8"));
  else {
    const objects = await gateway.client.listOwnedObjects({
      owner: signer.toSuiAddress(),
      type: "0x2::package::UpgradeCap",
      include: { content: true },
      limit: 100,
    });
    const cap = objects.objects
      .map((o) => Cap.parse(o.content))
      .find((c) => c.package === manifest.packageId);
    if (!cap)
      throw new Error(
        "The Testnet deployer has no matching upgrade capability.",
      );
    const tx = new Transaction();
    tx.setSender(signer.toSuiAddress());
    tx.setGasBudget(150_000_000);
    const balance = (
      await gateway.client.getBalance({ owner: signer.toSuiAddress() })
    ).balance;
    if (BigInt(balance.addressBalance) >= 150_000_000n) tx.setGasPayment([]);
    const ticket = tx.moveCall({
      target: "0x2::package::authorize_upgrade",
      arguments: [
        tx.object(cap.id),
        tx.pure.u8(0),
        tx.pure.vector("u8", build.digest),
      ],
    });
    const receipt = tx.upgrade({
      modules: build.modules,
      dependencies: build.dependencies,
      package: manifest.packageId,
      ticket,
    });
    tx.moveCall({
      target: "0x2::package::commit_upgrade",
      arguments: [tx.object(cap.id), receipt],
    });
    const bytes = await tx.build({ client: gateway.client });
    intent = {
      bytes: toBase64(bytes),
      signature: (await signer.signTransaction(bytes)).signature,
      digest: await tx.getDigest(),
      cap: cap.id,
      version: Number(cap.version) + 1,
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
      include: { effects: true },
    });
  } catch {}
  result ??= await gateway.client.executeTransaction({
    transaction: fromBase64(intent.bytes),
    signatures: [intent.signature],
    include: { effects: true },
  });
  if (!result.Transaction) throw new Error("The package upgrade aborted.");
  const confirmed = await gateway.client.waitForTransaction({
    result,
    include: { effects: true },
    timeout: 60_000,
  });
  if (!confirmed.Transaction) throw new Error("The upgrade has not confirmed.");
  const published = confirmed.Transaction.effects.changedObjects.find(
    (o) => o.outputState === "PackageWrite",
  );
  if (!published) throw new Error("The upgrade receipt has no package.");
  const next = {
    ...manifest,
    originalPackageId: manifest.originalPackageId ?? manifest.packageId,
    packageId: published.objectId,
    previousPackageId: manifest.packageId,
    digest: intent.digest,
    upgradeCap: intent.cap,
    version: intent.version,
    moduleHash,
    publishedAt: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  console.log(JSON.stringify(next, null, 2));
} finally {
  gateway.destroy();
}
