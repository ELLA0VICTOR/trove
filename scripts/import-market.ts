import { createRuntime } from "../server/runtime.ts";
const runtime = await createRuntime();
try {
  await runtime.market.refresh();
  const data = await runtime.market.latest();
  console.log(
    JSON.stringify(
      data
        ? {
            ready: true,
            id: data.id,
            asOf: data.asOf,
            receivedAt: data.receivedAt,
            symbols: data.instruments.map((i) => ({
              symbol: i.symbol,
              bars: i.prices.length,
              adjusted: i.prices.every((p) => Boolean(p.adjustedPrice)),
            })),
          }
        : { ready: false },
      null,
      2,
    ),
  );
  if (!data) process.exitCode = 1;
} finally {
  await runtime.close();
}
