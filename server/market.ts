import { createHash, randomUUID } from "node:crypto";
import type { DemoStore } from "./store.ts";
import type {
  DemoState,
  Instrument,
  CorporateAction,
} from "../shared/model.ts";
import {
  applyAdjustment,
  decimalMicro,
  decimalRatio,
} from "../shared/corporate-actions.ts";
import { instruments as samples } from "../shared/fixtures.ts";
import { MarketstackGateway } from "./integrations/marketstack.ts";
import { DomainError } from "./domain.ts";
import { portfolioValue } from "../shared/model.ts";

export interface Dataset {
  id: string;
  asOf: string;
  receivedAt: string;
  instruments: Instrument[];
  excluded?: number;
  actions?: CorporateAction[];
  rawInstruments?: Instrument[];
}
// Marketstack counts each symbol against the monthly allowance, including batches.
// A four-day import cadence keeps 12 symbols below 100 symbol-requests/month.
const TTL = 96 * 60 * 60_000;
export const marketStale = (asOf: string, now = Date.now()) =>
  now - Date.parse(asOf + "T21:00:00Z") > 5 * 86400_000;

/** One shared, private, persisted import. No browser requests ever call the provider. */
export class MarketService {
  private active?: Promise<void>;
  readonly store: DemoStore;
  readonly gateway?: Pick<MarketstackGateway, "histories">;
  constructor(
    store: DemoStore,
    gateway?: Pick<MarketstackGateway, "histories">,
  ) {
    this.store = store;
    this.gateway = gateway;
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS market_snapshots(id TEXT PRIMARY KEY, as_of TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS market_refresh(id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS portfolio_archives(id TEXT PRIMARY KEY,family TEXT NOT NULL,payload TEXT NOT NULL,recorded_at TEXT NOT NULL);`);
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS portfolio_marks(family TEXT NOT NULL,portfolio TEXT NOT NULL,date TEXT NOT NULL,value TEXT NOT NULL,dataset TEXT NOT NULL,PRIMARY KEY(family,portfolio,date))",
    );
  }
  latest(): Dataset | undefined {
    const row = this.store.db
      .prepare(
        "SELECT payload FROM market_snapshots ORDER BY received_at DESC LIMIT 1",
      )
      .get() as { payload: string } | undefined;
    return row && JSON.parse(row.payload);
  }
  dataset(id: string): Dataset {
    const row = this.store.db
      .prepare("SELECT payload FROM market_snapshots WHERE id=?")
      .get(id) as { payload: string } | undefined;
    if (!row)
      throw new DomainError(
        "This market snapshot is unavailable. Refresh your account before continuing.",
      );
    return JSON.parse(row.payload);
  }
  status(state: DemoState) {
    if (!state.portfolio)
      return {
        mode: "sample" as const,
        provider: "Authored samples",
        asOf: samples[0].prices.at(-1)!.date,
        stale: false,
        status: this.gateway
          ? "Market prices available for a new practice portfolio"
          : "Market prices not configured",
      };
    const data = this.dataset(state.portfolio.datasetId);
    const current = this.latest(),
      actionPending = Boolean(
        current &&
        current.id !== data.id &&
        this.hasCorporateAction(state, data, current),
      );
    return {
      mode: "market" as const,
      provider: "Marketstack daily close",
      asOf: data.asOf,
      receivedAt: data.receivedAt,
      datasetId: data.id,
      stale: marketStale(data.asOf),
      blocked: actionPending,
      status: actionPending
        ? "Applying automatic split and dividend entries."
        : marketStale(data.asOf)
          ? "Prices are stale. New practice orders are paused."
          : "Daily closing prices, not real-time quotes",
    };
  }
  instruments(state: DemoState) {
    return state.portfolio
      ? this.dataset(state.portfolio.datasetId).instruments
      : samples;
  }
  history(state: DemoState) {
    if (!state.portfolio) return undefined;
    const date = new Date().toISOString().slice(0, 10);
    const existing = this.store.db
      .prepare(
        "SELECT date,value FROM portfolio_marks WHERE family=? AND portfolio=? ORDER BY date",
      )
      .all(state.id, state.portfolio.id) as { date: string; value: string }[];
    if (!existing.length) {
      // Backfill existing local ledgers before the first persisted observation.
      // Earlier marks are preserved when a later snapshot changes share units.
      for (const point of accountHistory(
        state,
        this.instruments(state),
        (id) => this.dataset(id).instruments,
      ) ?? []) {
        if (point.date >= date) continue;
        this.store.db
          .prepare("INSERT OR IGNORE INTO portfolio_marks VALUES(?,?,?,?,?)")
          .run(
            state.id,
            state.portfolio.id,
            point.date,
            String(BigInt(Math.round(point.value * 1_000_000))),
            state.portfolio.datasetId,
          );
      }
    }
    const value = portfolioValue(state, this.instruments(state));
    this.store.db
      .prepare(
        "INSERT INTO portfolio_marks VALUES(?,?,?,?,?) ON CONFLICT(family,portfolio,date) DO UPDATE SET value=excluded.value,dataset=excluded.dataset",
      )
      .run(
        state.id,
        state.portfolio.id,
        date,
        String(value),
        state.portfolio.datasetId,
      );
    return (
      this.store.db
        .prepare(
          "SELECT date,value FROM portfolio_marks WHERE family=? AND portfolio=? ORDER BY date",
        )
        .all(state.id, state.portfolio.id) as { date: string; value: string }[]
    ).map((p) => ({ date: p.date, value: Number(p.value) / 1_000_000 }));
  }
  async refresh() {
    if (!this.gateway) return;
    if (this.active) return this.active;
    this.active = this.import().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async import() {
    const claimed = this.store.atomic(() => {
      const row = this.store.db
        .prepare("SELECT next_at FROM market_refresh WHERE id=1")
        .get() as { next_at: number } | undefined;
      if (row && row.next_at > Date.now()) return false;
      // Reserve before network I/O; restarts cannot consume the provider quota in a loop.
      this.store.db
        .prepare(
          "INSERT INTO market_refresh VALUES(1,?,'loading') ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at,status='loading'",
        )
        .run(Date.now() + TTL);
      return true;
    });
    if (!claimed) return;
    try {
      const now = new Date(),
        from = new Date(now.getTime() - 90 * 86400_000)
          .toISOString()
          .slice(0, 10);
      const results = await this.gateway!.histories(
        samples.map((i) => i.symbol),
        from,
        now.toISOString().slice(0, 10),
      );
      const common = results[0].prices
        .map((p) => p.date)
        .filter((date) =>
          results.every((r) => r.prices.some((p) => p.date === date)),
        );
      if (common.length < 2)
        throw new Error("Insufficient aligned market history.");
      const rawInstruments = samples.map((sample) => ({
        ...sample,
        prices: results.find((r) => r.symbol === sample.symbol)!.prices,
      }));
      const instruments = rawInstruments.map((sample) => ({
        ...sample,
        prices: results
          .find((r) => r.symbol === sample.symbol)!
          .prices.filter((p) => common.includes(p.date)),
      }));
      const asOf = common.at(-1)!;
      if (marketStale(asOf))
        throw new Error("The provider returned stale market history.");
      const receivedAt = new Date().toISOString(),
        id = createHash("sha256")
          .update(JSON.stringify(rawInstruments))
          .digest("hex");
      const data: Dataset = {
        id,
        asOf,
        receivedAt,
        instruments,
        rawInstruments,
        actions: corporateActions(rawInstruments),
        excluded: results.reduce((sum, r) => sum + (r.excluded ?? 0), 0),
      };
      this.store.db
        .prepare("INSERT OR IGNORE INTO market_snapshots VALUES(?,?,?,?)")
        .run(id, asOf, receivedAt, JSON.stringify(data));
      this.store.db
        .prepare("UPDATE market_refresh SET status='ready' WHERE id=1")
        .run();
    } catch {
      this.store.db
        .prepare("UPDATE market_refresh SET status='failed' WHERE id=1")
        .run();
      console.error(
        "[trove] Market import failed; cached prices remain labelled and stale prices cannot execute.",
      );
    }
  }
  enroll(family: string, allowArchive = false, clearExamples = false) {
    const data = this.latest();
    if (!data || marketStale(data.asOf))
      throw new DomainError("Fresh market prices are not available yet.");
    return this.store.atomic(() => {
      const state = this.store.get(family);
      if (state.portfolio) return state;
      if ((state.holdings.length || state.decisions.length) && !allowArchive)
        return state;
      this.store.db
        .prepare("INSERT INTO portfolio_archives VALUES(?,?,?,?)")
        .run(
          randomUUID(),
          family,
          JSON.stringify(state),
          new Date().toISOString(),
        );
      state.portfolio = {
        id: randomUUID(),
        startedAt: new Date().toISOString(),
        initialCash: "1000000000",
        datasetId: data.id,
      };
      state.cash = state.portfolio.initialCash;
      state.holdings = [];
      if (clearExamples) {
        state.decisions = state.decisions.filter((d) => d.origin !== "sample");
        state.memories = state.memories.filter((m) => m.origin !== "sample");
      }
      state.approvals = [];
      state.daySpent = "0";
      state.sequence++;
      this.store.set(state);
      return state;
    });
  }
  advance(family: string) {
    const data = this.latest(),
      state = this.store.get(family);
    if (!data || !state.portfolio || state.portfolio.datasetId === data.id)
      return state;
    const chainTables = this.store.db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='chain_intents'",
      )
      .get();
    if (
      chainTables &&
      this.store.db
        .prepare(
          "SELECT 1 FROM chain_intents WHERE family=? AND state IN ('building','prepared','submitting','pending')",
        )
        .get(family)
    )
      return state;
    const onchain =
      chainTables &&
      this.store.db
        .prepare("SELECT 1 FROM chain_accounts WHERE family=?")
        .get(family);
    const plan = this.plan(state);
    if (onchain && plan.entries.length) return state;
    return this.store.atomic(() => {
      for (const entry of plan.entries)
        applyAdjustment(state, entry, state.portfolio!.datasetId, data.id);
      state.portfolio!.datasetId = data.id;
      if (!onchain && !plan.entries.length) state.sequence++;
      this.store.set(state);
      return state;
    });
  }
  plan(state: DemoState) {
    const target = this.latest(),
      before = state.portfolio && this.dataset(state.portfolio.datasetId);
    const projected = structuredClone(state);
    const entries = [] as import("../shared/model.ts").Adjustment[];
    if (target && before && target.id !== before.id) {
      const actions = this.actionsBetween(before, target);
      for (const action of actions.filter(
        (a) => a.date > before.asOf && a.date <= target.asOf,
      )) {
        const entry = applyAdjustment(projected, action, before.id, target.id);
        if (entry) entries.push(entry);
      }
    }
    return { from: before, target, entries, projected };
  }
  private hasCorporateAction(state: DemoState, old: Dataset, data: Dataset) {
    return this.actionsBetween(old, data).some(
      (a) =>
        a.date > old.asOf &&
        a.date <= data.asOf &&
        state.holdings.some(
          (h) => h.symbol === a.symbol && BigInt(h.units) > 0n,
        ),
    );
  }
  private actionsBetween(old: Dataset, target: Dataset) {
    // Retain actions that have rolled out of the provider's current history window.
    const snapshots = this.store.db
      .prepare(
        "SELECT payload FROM market_snapshots WHERE as_of>? AND as_of<=? AND received_at<=? ORDER BY received_at",
      )
      .all(old.asOf, target.asOf, target.receivedAt) as { payload: string }[];
    const events = new Map<string, CorporateAction>();
    for (const { payload } of snapshots) {
      const data = JSON.parse(payload) as Dataset;
      for (const event of data.actions ??
        corporateActions(data.rawInstruments ?? data.instruments))
        events.set(event.id, event);
    }
    return [...events.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.symbol.localeCompare(b.symbol) ||
        (a.kind === b.kind ? 0 : a.kind === "split" ? -1 : 1),
    );
  }
  assertTradable(state: DemoState) {
    if (this.status(state).blocked)
      throw new DomainError(
        "Your portfolio is applying automatic split and dividend entries. Please try again shortly.",
      );
    if (state.portfolio && this.status(state).stale)
      throw new DomainError(
        "Prices are stale. Wait for a fresh daily close before making a practice order.",
      );
  }
}

export function corporateActions(instruments: Instrument[]): CorporateAction[] {
  const actions: CorporateAction[] = [];
  for (const instrument of instruments)
    for (const point of instrument.prices) {
      const base = {
        symbol: instrument.symbol,
        date: point.date,
        price: point.price,
      };
      if (point.splitFactor != null && point.splitFactor !== 1)
        actions.push({
          ...base,
          id: createHash("sha256")
            .update(`Marketstack:split:${instrument.symbol}:${point.date}`)
            .digest("hex"),
          kind: "split",
          ...decimalRatio(point.splitFactor),
          dividend: "0",
        });
      if ((point.dividend ?? 0) > 0)
        actions.push({
          ...base,
          id: createHash("sha256")
            .update(`Marketstack:dividend:${instrument.symbol}:${point.date}`)
            .digest("hex"),
          kind: "dividend",
          numerator: "1",
          denominator: "1",
          dividend: decimalMicro(point.dividend!),
        });
    }
  return actions.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.symbol.localeCompare(b.symbol) ||
      (a.kind === b.kind ? 0 : a.kind === "split" ? -1 : 1),
  );
}

/** Value the positions held at each actual observation, never today's positions in the past. */
export function accountHistory(
  state: DemoState,
  instruments: Instrument[],
  resolveDataset?: (id: string) => Instrument[],
) {
  if (!state.portfolio) return undefined;
  const start = state.portfolio.startedAt.slice(0, 10);
  const days = new Set(
    instruments[0].prices.filter((p) => p.date >= start).map((p) => p.date),
  );
  days.add(start);
  days.add(new Date().toISOString().slice(0, 10));
  const decisions = state.decisions
    .filter((d) => d.portfolioId === state.portfolio!.id)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const adjustments = (state.adjustments ?? []).filter(
    (a) => a.portfolioId === state.portfolio!.id,
  );
  const events = [
    ...decisions.map((d) => ({
      time: d.recordedAt,
      type: "trade" as const,
      value: d,
    })),
    ...adjustments.map((a) => ({
      time: a.recordedAt,
      type: "adjustment" as const,
      value: a,
    })),
  ].sort(
    (a, b) =>
      a.time.localeCompare(b.time) ||
      (a.type === "adjustment" && b.type === "adjustment"
        ? a.value.date.localeCompare(b.value.date) ||
          a.value.symbol.localeCompare(b.value.symbol) ||
          (a.value.kind === b.value.kind
            ? 0
            : a.value.kind === "split"
              ? -1
              : 1)
        : a.type === b.type
          ? 0
          : a.type === "adjustment"
            ? -1
            : 1),
  );
  for (const event of events) days.add(event.time.slice(0, 10));
  return [...days].sort().map((date) => {
    let cash = BigInt(state.portfolio!.initialCash);
    const positions = new Map<string, bigint>();
    // Before a booked adjustment, value old units against that exact old snapshot.
    const futureAdjustment = adjustments
      .filter((a) => a.recordedAt.slice(0, 10) > date)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
    const history =
      futureAdjustment && resolveDataset
        ? resolveDataset(futureAdjustment.fromDataset)
        : instruments;
    for (const event of events.filter((e) => e.time.slice(0, 10) <= date)) {
      if (event.type === "trade") {
        const d = event.value;
        cash += BigInt(d.amount) * (d.side === "buy" ? -1n : 1n);
        positions.set(
          d.symbol,
          (positions.get(d.symbol) ?? 0n) +
            BigInt(d.units) * (d.side === "buy" ? 1n : -1n),
        );
      } else {
        const a = event.value;
        cash += BigInt(a.cashDelta);
        positions.set(a.symbol, BigInt(a.unitsAfter));
      }
    }
    for (const [symbol, units] of positions) {
      const price = history
        .find((i) => i.symbol === symbol)!
        .prices.filter((p) => p.date <= date)
        .at(-1);
      if (price) cash += (units * BigInt(price.price)) / 100_000_000n;
    }
    return { date, value: Number(cash) / 1_000_000 };
  });
}
