import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createRuntime } from "./runtime.ts";

const runtime = createRuntime();
const app = createApp(runtime.store, { learning: runtime.learning });
const server = serve(
  { fetch: app.fetch, hostname: "127.0.0.1", port: 3001 },
  (info) =>
    console.log(
      `Trove local API: http://127.0.0.1:${info.port} (sample data; no live transactions)`,
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
