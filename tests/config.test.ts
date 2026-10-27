import test from "node:test";
import assert from "node:assert/strict";
import { configuredValue, setupReport } from "../server/config.ts";
import { practiceDeployment } from "../server/chain-config.ts";
import manifest from "../contracts/practice/deployment.testnet.json" with { type: "json" };

test("the bundled deployment enables current capabilities and retains the original type identity", () => {
  assert.deepEqual(practiceDeployment(), {
    packageId: manifest.packageId,
    originalPackageId: manifest.originalPackageId,
    fundingReady: true,
    enrollmentReady: true,
  });
  for (const value of [
    manifest.packageId,
    `  "${manifest.packageId}"  `,
    "0x" + manifest.packageId.slice(2).toUpperCase(),
  ]) {
    assert.deepEqual(practiceDeployment(value), practiceDeployment());
  }
});

test("an unknown or older contract never inherits the current contract capabilities", () => {
  for (const value of [manifest.previousPackageId, "0x1", "invalid-package"]) {
    const deployment = practiceDeployment(value, manifest.originalPackageId);
    assert.equal(deployment.enrollmentReady, false);
    assert.equal(deployment.fundingReady, false);
    assert.equal(deployment.originalPackageId, manifest.originalPackageId);
  }
});

test("setup checks reject placeholders and never include credential values", () => {
  for (const value of [
    "",
    "  ",
    "REPLACE_ME_TATUM_KEY",
    "YOUR_API_KEY",
    "<key>",
  ])
    assert.equal(configuredValue({ TOKEN: value }, "TOKEN"), undefined);
  const secret = "a-private-value-that-must-not-be-printed";
  const report = setupReport({
    TATUM_API_KEY: secret,
    MEMWAL_PRIVATE_KEY: "not-a-32-byte-delegate-key",
    MEMWAL_ACCOUNT_ID: "REPLACE_ME_ACCOUNT",
  });
  assert.equal(
    report.find((r) => r.variable === "TATUM_API_KEY")!.status,
    "ready-to-check",
  );
  assert.equal(
    report.find((r) => r.variable === "MEMWAL_PRIVATE_KEY")!.status,
    "invalid-format",
  );
  assert.equal(
    report.find((r) => r.variable === "MEMWAL_ACCOUNT_ID")!.status,
    "placeholder",
  );
  assert.ok(!JSON.stringify(report).includes(secret));
});
