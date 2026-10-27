import { defineConfig } from "@playwright/test";
const baseURL = `http://127.0.0.1:${process.env.TROVE_WEB_PORT ?? 5173}`;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: baseURL + "/api/state",
    reuseExistingServer: false,
    env: {
      TROVE_LIVE_SERVICES: "0",
      DATABASE_URL: "",
      TROVE_DATA_DIR:
        process.env.TROVE_BROWSER_DATA_DIR ?? ".artifacts/browser-store",
    },
    timeout: 60_000,
  },
});
