import { setupReport } from "../server/config.ts";

// Intentionally offline: do not import SDK clients or print environment values.
const report = setupReport(process.env);
console.table(report);
console.log(
  "Offline check only. Ready-to-check means a value is present, not that access is verified. No keys are printed and no provider calls are made. See docs/ACCOUNT-SETUP.md.",
);
if (report.some((item) => item.status === "invalid-format"))
  process.exitCode = 1;
