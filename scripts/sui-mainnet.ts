import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { TatumSuiGateway } from "../server/integrations/tatum.ts";
import { configuredValue } from "../server/config.ts";

const directory = resolve(process.env.TROVE_DATA_DIR ?? ".trove");
mkdirSync(directory, { recursive: true });
const keysPath = resolve(directory, "sui-mainnet-keys.json");
execFileSync("git", ["check-ignore", "--quiet", keysPath], {
  stdio: "ignore",
  windowsHide: true,
});
if (!existsSync(keysPath))
  writeFileSync(
    keysPath,
    JSON.stringify({
      network: "mainnet",
      sponsorKey: Ed25519Keypair.generate().getSecretKey(),
      attestorKey: Ed25519Keypair.generate().getSecretKey(),
    }),
    { flag: "wx", mode: 0o600 },
  );
const keys = JSON.parse(readFileSync(keysPath, "utf8"));
const signer = Ed25519Keypair.fromSecretKey(
  configuredValue(process.env, "SUI_MAINNET_SPONSOR_KEY") ?? keys.sponsorKey,
);
const apiKey = configuredValue(process.env, "TATUM_MAINNET_API_KEY");
if (!apiKey)
  throw new Error("Configure TATUM_MAINNET_API_KEY before preparing Mainnet.");
const gateway = new TatumSuiGateway(apiKey, "mainnet");
const destination = resolve("contracts/practice/deployment.mainnet.json");
const previous = existsSync(destination)
  ? JSON.parse(readFileSync(destination, "utf8"))
  : undefined;
const budget = 150_000_000n;
try {
  await gateway.checkpoint();
  const balance = (
    await gateway.client.getBalance({ owner: signer.toSuiAddress() })
  ).balance;
  if (process.argv.includes("--setup")) {
    console.log(
      JSON.stringify(
        {
          network: "mainnet",
          sponsor: signer.toSuiAddress(),
          gasMist: balance.balance,
          keys: "Stored privately in ignored .trove/sui-mainnet-keys.json",
        },
        null,
        2,
      ),
    );
  } else if (previous?.packageId && process.argv.includes("--publish")) {
    console.log(
      `Mainnet is already published at ${previous.packageId}. No transaction was submitted.`,
    );
  } else {
    const build = JSON.parse(
      readFileSync(".artifacts/contracts/build.json", "utf8").replace(
        /^\uFEFF/,
        "",
      ),
    );
    if (!Array.isArray(build.modules) || !Array.isArray(build.dependencies))
      throw new Error("Run npm run sui:build first.");
    const moduleHash = createHash("sha256")
      .update(JSON.stringify(build.modules))
      .digest("hex");
    const makeTransaction = () => {
      const tx = new Transaction();
      const [cap] = tx.publish(build);
      tx.transferObjects([cap], signer.toSuiAddress());
      tx.setSender(signer.toSuiAddress());
      tx.setGasBudget(budget);
      return tx;
    };
    if (!process.argv.includes("--publish")) {
      const tx = makeTransaction();
      tx.setGasOwner(signer.toSuiAddress());
      tx.setGasPrice(
        (await gateway.client.core.getReferenceGasPrice()).referenceGasPrice,
      );
      tx.setGasPayment([]);
      const result = await gateway.client.simulateTransaction({
        transaction: tx,
        checksEnabled: false,
        doGasSelection: false,
        include: { effects: true },
      });
      const observed = result.Transaction ?? result.FailedTransaction;
      if (!observed?.status.success)
        throw new Error("Mainnet publication simulation failed.");
      const gas = observed.effects.gasUsed;
      console.log(
        JSON.stringify(
          {
            network: "mainnet",
            simulationOnly: true,
            sponsor: signer.toSuiAddress(),
            gas,
            netGasMist: String(
              BigInt(gas.computationCost ?? 0) +
                BigInt(gas.storageCost ?? 0) -
                BigInt(gas.storageRebate ?? 0),
            ),
            budgetMist: String(budget),
            balanceMist: balance.balance,
            moduleHash,
          },
          null,
          2,
        ),
      );
    } else {
      const intentPath = resolve(directory, "publish-mainnet-intent.json");
      let intent: {
        network: string;
        sender: string;
        moduleHash: string;
        bytes: string;
        signature: string;
        digest: string;
      };
      if (existsSync(intentPath)) {
        intent = JSON.parse(readFileSync(intentPath, "utf8"));
        if (
          intent.network !== "mainnet" ||
          intent.sender !== signer.toSuiAddress() ||
          intent.moduleHash !== moduleHash
        )
          throw new Error(
            "The saved Mainnet publication does not match this signer and build.",
          );
      } else {
        if (BigInt(balance.balance) < budget)
          throw new Error(
            `Mainnet sponsor ${signer.toSuiAddress()} needs at least 0.15 SUI to cover the deployment budget. No transaction was submitted.`,
          );
        const tx = makeTransaction();
        if (BigInt(balance.addressBalance) >= budget) tx.setGasPayment([]);
        const bytes = await tx.build({ client: gateway.client });
        const simulation = await gateway.client.simulateTransaction({
          transaction: bytes,
          checksEnabled: true,
          include: { effects: true },
        });
        if (!simulation.Transaction?.status.success)
          throw new Error(
            "Funded Mainnet publication simulation failed. No transaction was submitted.",
          );
        intent = {
          network: "mainnet",
          sender: signer.toSuiAddress(),
          moduleHash,
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
        /* Recover by resubmitting identical signed bytes. */
      }
      if (!result)
        result = await gateway.client.executeTransaction({
          transaction: fromBase64(intent.bytes),
          signatures: [intent.signature],
          include: { effects: true, objectTypes: true },
        });
      const confirmed = await gateway.client.waitForTransaction({
        result,
        include: { effects: true, objectTypes: true },
        timeout: 60000,
      });
      if (!confirmed.Transaction?.status.success)
        throw new Error("Mainnet publication did not confirm successfully.");
      const pkg = confirmed.Transaction.effects.changedObjects.find(
        (o) => o.outputState === "PackageWrite",
      );
      if (!pkg)
        throw new Error("The Mainnet receipt has no published package.");
      const receipt = await gateway.receipt(intent.digest);
      if (
        receipt.state !== "confirmed" ||
        receipt.transaction.digest !== intent.digest
      )
        throw new Error("Mainnet publication verification is pending.");
      const manifest = {
        network: "mainnet",
        provider: "Tatum",
        status: "published",
        packageId: pkg.objectId,
        originalPackageId: pkg.objectId,
        version: 4,
        digest: intent.digest,
        upgradeCap: Object.entries(confirmed.Transaction.objectTypes).find(
          ([, type]) => type.endsWith("::package::UpgradeCap"),
        )?.[0],
        gasUsed: confirmed.Transaction.effects.gasUsed,
        moduleHash,
        publishedAt: new Date().toISOString(),
        toolchain: "testnet-v1.82.2",
        eventTypeOrigins: Object.fromEntries(
          [
            "Created",
            "Executed",
            "Funded",
            "CorporateApplied",
            "LearnerEnrolled",
          ].map((name) => [name, pkg.objectId]),
        ),
        upgradePolicy: "Upgrade capability retained by the Mainnet deployer.",
      };
      writeFileSync(destination, JSON.stringify(manifest, null, 2) + "\n");
      console.log(JSON.stringify(manifest, null, 2));
    }
  }
} finally {
  gateway.destroy();
}
