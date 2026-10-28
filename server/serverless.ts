import { waitUntil, attachDatabasePool } from "@vercel/functions";
import { createApp } from "./app.ts";
import { createRuntime } from "./runtime.ts";

type Runtime = Awaited<ReturnType<typeof createRuntime>>;
export function configuredOrigin(env = process.env) {
  const host =
    env.VERCEL_ENV === "preview"
      ? env.VERCEL_URL
      : (env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL);
  return (
    env.PUBLIC_ORIGIN ?? (host ? `https://${host}` : env.RENDER_EXTERNAL_URL)
  )?.replace(/\/$/, "");
}

/** One lazy pool per warm instance; durable jobs run within a bounded invocation. */
export function createServerlessHandler(
  options: {
    runtime?: () => Promise<Runtime>;
    defer?: (work: Promise<unknown>) => void;
    origin?: string;
  } = {},
) {
  let backend:
    | Promise<{ app: ReturnType<typeof createApp>; runtime: Runtime }>
    | undefined;
  const defer = options.defer ?? waitUntil;
  const initialize = () => {
    if (backend) return backend;
    backend = (async () => {
      if (!options.runtime && !process.env.DATABASE_URL)
        throw new Error("DATABASE_URL is required for hosted persistence.");
      const origin = options.origin ?? configuredOrigin();
      if (!origin?.startsWith("https://"))
        throw new Error("Configure the trusted HTTPS application origin.");
      const runtime = await (options.runtime?.() ??
        createRuntime({ serverless: true }));
      if (runtime.store.db.pool && process.env.VERCEL)
        attachDatabasePool(runtime.store.db.pool);
      const app = createApp(runtime.store, {
        market: runtime.market,
        chain: runtime.chain,
        learning: runtime.learning,
        mail: runtime.mail,
        defer,
        publicOrigin: origin,
        afterRequest: () => defer(runtime.maintenance().catch(() => {})),
      });
      app.get("/health", async (c) => {
        await runtime.store.db.prepare("SELECT 1").get();
        return c.json({ status: "ok" });
      });
      app.all("*", (c) => c.json({ error: "Endpoint not found." }, 404));
      return { app, runtime };
    })().catch((error) => {
      backend = undefined;
      throw error;
    });
    return backend;
  };
  return {
    async fetch(request: Request) {
      try {
        const { app } = await initialize();
        const url = new URL(request.url),
          path = url.searchParams.get("__trove_path");
        if (url.searchParams.get("__trove_health") === "1")
          url.pathname = "/health";
        else if (path !== null) {
          if (!/^[a-zA-Z0-9_/-]*$/.test(path))
            return Response.json(
              { error: "Invalid API path." },
              { status: 400 },
            );
          url.pathname = "/api/" + path;
        }
        url.searchParams.delete("__trove_path");
        url.searchParams.delete("__trove_health");
        return await app.fetch(new Request(url, request));
      } catch {
        console.error(
          "[trove] The hosted API could not initialize; check server configuration and database access.",
        );
        return Response.json(
          {
            error:
              "Trove could not connect to its data service. Please try again shortly.",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    },
    async close() {
      const value = await backend;
      backend = undefined;
      await value?.runtime.close();
    },
  };
}
