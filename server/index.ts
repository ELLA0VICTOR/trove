import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { DemoStore } from "./store.ts";

const store = new DemoStore(resolve(".trove/local.sqlite"));
const app = createApp(store);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3001 }, (info) =>
  console.log(
    `Trove local API: http://127.0.0.1:${info.port} (sample data; no live transactions)`,
  ),
);
