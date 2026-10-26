import test from "node:test";
import assert from "node:assert/strict";
import { configuredValue, setupReport } from "../server/config.ts";

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
