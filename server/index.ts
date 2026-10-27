import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createRuntime } from "./runtime.ts";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";

const runtime = createRuntime();
const production = process.env.NODE_ENV === "production";
const publicOrigin = (
  process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL
)?.replace(/\/$/, "");
if (
  production &&
  (!publicOrigin?.startsWith("https://") ||
    !process.env.TROVE_DATA_DIR ||
    !existsSync("dist/index.html"))
) {
  runtime.close();
  throw new Error(
    "Production needs HTTPS PUBLIC_ORIGIN, persistent TROVE_DATA_DIR, and a built frontend.",
  );
}
const app = createApp(runtime.store, {
  learning: runtime.learning,
  market: runtime.market,
  chain: runtime.chain,
  publicOrigin,
});
app.get("/health", (c) => {
  runtime.store.db.prepare("SELECT 1").get();
  return c.json({ status: "ok" });
});
app.get(
  "/assets/*",
  async (c, next) => {
    c.header("Cache-Control", "public,max-age=31536000,immutable");
    await next();
  },
  serveStatic({ root: "./dist" }),
);
app.get("/api/*", (c) => c.json({ error: "Endpoint not found." }, 404));
app.get("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));
const server = serve(
  {
    fetch: app.fetch,
    hostname: production ? "0.0.0.0" : "127.0.0.1",
    port: Number(process.env.PORT ?? 3001),
  },
  (info) =>
    console.log(
      `Trove ${production ? "server" : "local API"} listening on port ${info.port}`,
    ),
);
runtime.start();
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(0), 25_000);
  deadline.unref();
  await runtime.stop();
  server.close(() => {
    runtime.close();
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
