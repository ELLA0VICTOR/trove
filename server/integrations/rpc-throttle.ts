import { UnaryCall } from "@protobuf-ts/runtime-rpc";
import type { RpcInterceptor } from "@protobuf-ts/runtime-rpc";
import { createHash } from "node:crypto";
const schedules = new Map<string, number>();

/** SDK builds issue parallel lookups; share pacing across clients using the same API key. */
export function rpcThrottle(key: string, interval = 650): RpcInterceptor {
  const scope = createHash("sha256").update(key).digest("hex");
  return {
    interceptUnary(next, method, input, options) {
      const start = Math.max(Date.now(), schedules.get(scope) ?? 0);
      schedules.set(scope, start + interval);
      const call = (async () => {
        const delay = start - Date.now();
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
        if (options.abort?.aborted)
          throw new Error("The queued RPC request was cancelled.");
        return await next(method, input, options);
      })();
      const headers = call.then((r) => r.headers),
        response = call.then((r) => r.response),
        status = call.then((r) => r.status),
        trailers = call.then((r) => r.trailers);
      for (const promise of [headers, response, status, trailers])
        void promise.catch(() => {});
      return new UnaryCall(
        method,
        options.meta ?? {},
        input,
        headers,
        response,
        status,
        trailers,
      );
    },
  };
}
