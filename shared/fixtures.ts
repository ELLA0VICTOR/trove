import { buy, USD_SCALE } from "./model.ts";
import type { DemoState, Instrument } from "./model.ts";

// Authored, deterministic sample prices. These are NOT a market-data feed.
const catalog = [
  [
    "AAPL",
    "Apple",
    "The devices, software, and services you use every day.",
    "Technology",
    "#a5ad9a",
    180,
    0.11,
  ],
  [
    "MSFT",
    "Microsoft",
    "Software, cloud computing, and tools for work and play.",
    "Technology",
    "#acb1ca",
    400,
    0.08,
  ],
  [
    "NVDA",
    "NVIDIA",
    "Chips powering graphics, computing, and artificial intelligence.",
    "Technology",
    "#8ee573",
    115,
    0.19,
  ],
  [
    "AMD",
    "AMD",
    "Processors and graphics chips for computers and data centers.",
    "Technology",
    "#cea89d",
    145,
    -0.07,
  ],
  [
    "ADBE",
    "Adobe",
    "Creative software for images, documents, and design.",
    "Technology",
    "#c69494",
    480,
    -0.12,
  ],
  [
    "KO",
    "Coca-Cola",
    "A global collection of familiar beverage brands.",
    "Consumer staples",
    "#cca7a0",
    60,
    0.045,
  ],
  [
    "JNJ",
    "Johnson & Johnson",
    "Medicines and medical technologies.",
    "Healthcare",
    "#b9a7c5",
    155,
    0.03,
  ],
  [
    "XOM",
    "Exxon Mobil",
    "Energy production, fuels, and materials.",
    "Energy",
    "#b8b490",
    110,
    -0.035,
  ],
  [
    "WMT",
    "Walmart",
    "Everyday groceries and goods, in stores and online.",
    "Consumer staples",
    "#9cb2c8",
    75,
    0.07,
  ],
  [
    "DIS",
    "Disney",
    "Stories, entertainment, streaming, and experiences.",
    "Communication",
    "#b2a6d0",
    95,
    -0.02,
  ],
  [
    "SPY",
    "S&P 500 fund",
    "A sample fund representing a broad group of large US companies.",
    "Broad-market fund",
    "#9fbca5",
    550,
    0.055,
  ],
  [
    "VTI",
    "Total market fund",
    "A sample fund representing companies across the US market.",
    "Broad-market fund",
    "#b0bc90",
    270,
    0.049,
  ],
] as const;
const dates: string[] = [];
for (
  let day = new Date("2026-07-06T12:00:00Z");
  dates.length < 60;
  day.setUTCDate(day.getUTCDate() + 1)
) {
  if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6)
    dates.push(day.toISOString().slice(0, 10));
}
export const instruments: Instrument[] = catalog.map(
  ([symbol, name, description, sector, color, base, trend], asset) => ({
    symbol,
    name,
    description,
    sector,
    color,
    prices: dates.map((date, index) => {
      const t = index / (dates.length - 1);
      const common =
        Math.sin(t * 10) * 0.028 -
        Math.exp(-((t - 0.59) ** 2) / 0.006) * (asset < 5 ? 0.1 : 0.02);
      const variation =
        (Math.sin(index * 1.37 + asset) - Math.sin(asset)) *
        (asset < 5 ? 0.009 : 0.003);
      const price = Math.round(
        base * (1 + trend * t + common + variation) * 100,
      );
      return { date, price: String(BigInt(price) * 10_000n) };
    }),
  }),
);

export function seedState(id: string): DemoState {
  const holdings = instruments.slice(0, 5).map((instrument) => {
    const order = buy(150n * USD_SCALE, BigInt(instrument.prices[0].price));
    return {
      symbol: instrument.symbol,
      units: String(order.units),
      cost: String(order.amount),
    };
  });
  const cost = holdings.reduce(
    (sum, holding) => sum + BigInt(holding.cost),
    0n,
  );
  const decisions = holdings.map((holding, index) => ({
    id: `sample-${holding.symbol}`,
    symbol: holding.symbol,
    side: "buy" as const,
    amount: holding.cost,
    units: holding.units,
    price: instruments[index].prices[0].price,
    reason:
      index === 0
        ? "I chose five different companies, so I think I have spread out my risk."
        : [
            "I like the company and want to understand how it grows.",
            "I want to learn how AI chips fit into the market.",
            "I want to compare two companies in the same industry.",
            "I use their products and want to understand their business.",
          ][index - 1],
    recordedAt: `2026-07-06T12:${String(index).padStart(2, "0")}:00Z`,
    marketDate: dates[0],
    origin: "sample" as const,
    memoryStatus: "local" as const,
  }));
  return {
    id,
    role: "learner",
    learner: "Maya",
    cash: String(1000n * USD_SCALE - cost),
    holdings,
    sequence: 0,
    policy: {
      perTrade: String(100n * USD_SCALE),
      daily: String(250n * USD_SCALE),
      paused: false,
      revision: 1,
      allowed: instruments.map((i) => i.symbol),
    },
    decisions,
    memories: decisions.map((decision) => ({
      id: `memory-${decision.id}`,
      kind: "decision",
      text: decision.reason,
      decisionId: decision.id,
      recordedAt: decision.recordedAt,
      active: true,
      origin: "sample",
    })),
    approvals: [],
    attempts: [],
    daySpent: "0",
    spendDay: new Date().toISOString().slice(0, 10),
  };
}
