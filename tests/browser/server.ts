// Browser-only transport fixture: never imported by application runtime.
import { serve } from "@hono/node-server";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntime } from "../../server/runtime.ts";
import { createApp } from "../../server/app.ts";
const directory = resolve(
  process.env.TROVE_BROWSER_DATA_DIR ?? ".artifacts/browser-store",
);
mkdirSync(directory, { recursive: true });
const runtime = await createRuntime();
const pending = new Set<Promise<unknown>>();
const app = createApp(runtime.store, {
  market: runtime.market,
  chain: runtime.chain,
  learning: runtime.learning,
  publicOrigin: process.env.PUBLIC_ORIGIN,
  mail: {
    send: async (input) => {
      appendFileSync(
        resolve(directory, "mail.jsonl"),
        JSON.stringify(input) + "\n",
      );
      return crypto.randomUUID();
    },
  },
  defer: (work) => {
    pending.add(work);
    void work.finally(() => pending.delete(work));
  },
});
const server = serve({
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3001),
});
async function close() {
  server.close();
  await Promise.allSettled(pending);
  await runtime.close();
}
process.once("SIGTERM", () => void close());
process.once("SIGINT", () => void close());
