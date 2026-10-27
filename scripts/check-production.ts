import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

mkdirSync(".artifacts", { recursive: true });
const directory = mkdtempSync(resolve(".artifacts/production-check-"));
const port = 3101,
  base = `http://127.0.0.1:${port}`,
  origin = "https://trove-production-check.onrender.com";
let child: ReturnType<typeof spawn> | undefined;
async function start() {
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "",
      RENDER_EXTERNAL_URL: origin,
      TROVE_DATA_DIR: directory,
      TROVE_LIVE_SERVICES: "0",
      DATABASE_URL: "",
      PORT: String(port),
    },
    stdio: "pipe",
    windowsHide: true,
  });
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  for (let i = 0; i < 80; i++) {
    if (exited)
      throw new Error("The production server stopped before readiness.");
    if (
      await fetch(base + "/health")
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Production readiness timed out.");
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((r) => child!.once("exit", () => r()));
  child.kill();
  await exited;
}
try {
  await start();
  assert.deepEqual(await fetch(base + "/health").then((r) => r.json()), {
    status: "ok",
  });
  const html = await fetch(base + "/app/explore").then((r) => r.text());
  assert.match(html, /id="root"/);
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(asset);
  const assetResponse = await fetch(base + asset);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("cache-control") ?? "", /immutable/);
  assert.equal((await fetch(base + "/api/not-an-endpoint")).status, 404);
  const registered = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      username: "production_smoke",
      password: "synthetic-production-smoke-password",
    }),
  });
  assert.equal(registered.status, 200);
  const cookie = registered.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const auth = cookie.match(/trove_session=[^;]+/)![0],
    original = await registered.json();
  const forbidden = await fetch(base + "/api/policy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: auth,
      Origin: "https://untrusted.invalid",
    },
    body: "{}",
  });
  assert.equal(forbidden.status, 403);
  await stop();
  await start();
  const restored = await fetch(base + "/api/state", {
    headers: { Cookie: auth },
  }).then((r) => r.json());
  assert.equal(restored.id, original.id);
  assert.equal(restored.session.username, "production_smoke");
  const proof = {
    checkedAt: new Date().toISOString(),
    runtime:
      "production Node server; loopback HTTP with HTTPS-origin configuration",
    checks: [
      "health",
      "SPA deep link",
      "built asset and immutable cache",
      "API 404",
      "trusted origin",
      "Secure/HttpOnly/SameSite cookie",
      "foreign-origin refusal",
      "account/session persistence after restart",
    ],
    hostedTlsVerified: false,
    containerVerified: false,
    providerCalls: 0,
  };
  writeFileSync(
    ".artifacts/production-check.json",
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await stop();
}
