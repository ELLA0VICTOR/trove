import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "./database.ts";
import { configuredValue } from "./config.ts";
import { DemoStore, memoryNamespace } from "./store.ts";
import { Accounts, AccessError } from "./auth.ts";
import { WalrusMemoryGateway } from "./integrations/walrus.ts";
import type { MemoryReader } from "./integrations/walrus.ts";
import { CoachGateway } from "./integrations/coach.ts";
import { CoachBudget, COACH_MODEL } from "./jobs/coach-budget.ts";
import { LearningService, LearningUnavailable } from "./learning-service.ts";
import type { LiveLearning } from "./learning-service.ts";
import { MarketService } from "./market.ts";
import { MarketstackGateway } from "./integrations/marketstack.ts";
import { AlpacaGateway } from "./integrations/alpaca.ts";
import { ChainService } from "./chain.ts";
import { chainConfig } from "./chain-config.ts";
import { ResendAccountMail } from "./integrations/account-mail.ts";

export async function createRuntime(
  options: { database?: Database; serverless?: boolean } = {},
) {
  const value = (name: string) => configuredValue(process.env, name);
  const enabled = process.env.TROVE_LIVE_SERVICES !== "0";
  const memoryReady = Boolean(
    enabled && value("MEMWAL_ACCOUNT_ID") && value("MEMWAL_PRIVATE_KEY"),
  );
  const coachReady = Boolean(
    enabled && value("OPENAI_API_KEY") && value("COACH_MODEL"),
  );
  let mail: ResendAccountMail | undefined;
  if (enabled && value("RESEND_API_KEY") && value("EMAIL_FROM")) {
    try {
      mail = new ResendAccountMail(
        value("RESEND_API_KEY")!,
        value("EMAIL_FROM")!,
      );
    } catch {
      console.error(
        "[trove] Account email settings are invalid; email delivery is disabled.",
      );
    }
  }
  const dataDir = resolve(value("TROVE_DATA_DIR") ?? ".trove");
  const database =
    options.database ??
    new Database(
      value("DATABASE_URL")
        ? { url: value("DATABASE_URL") }
        : { filename: resolve(dataDir, "local.sqlite") },
    );
  try {
    await database.ready;
  } catch (error) {
    if (!options.database) await database.close();
    throw error;
  }
  const store = new DemoStore(database, { liveMemory: memoryReady });
  const market = new MarketService(
    store,
    enabled && value("ALPACA_API_KEY") && value("ALPACA_API_SECRET")
      ? new AlpacaGateway(value("ALPACA_API_KEY")!, value("ALPACA_API_SECRET")!)
      : enabled && value("MARKETSTACK_API_KEY")
        ? new MarketstackGateway(value("MARKETSTACK_API_KEY")!)
        : undefined,
  );
  const chain = new ChainService(
    store,
    market,
    enabled ? chainConfig(dataDir) : undefined,
  );
  const accounts = new Accounts(store);
  const memory = async (scope: string): Promise<MemoryReader> => {
    const profiles = (await database
      .prepare("SELECT family,memory_enabled FROM account_profiles")
      .all()) as { family: string; memory_enabled: number }[];
    const owner = profiles.find(
      (profile) => memoryNamespace(profile.family, true) === scope,
    );
    if (!owner || !scope.startsWith("account_"))
      throw new AccessError(
        "This memory scope is not an authenticated family.",
      );
    const gateway = new WalrusMemoryGateway({
      accountId: value("MEMWAL_ACCOUNT_ID")!,
      delegateKey: value("MEMWAL_PRIVATE_KEY")!,
      learnerScope: scope,
      serverUrl: value("MEMWAL_SERVER_URL"),
    });
    return {
      submit: async (record, key) => {
        if (!(await store.profile(owner.family))?.memory_enabled)
          throw new AccessError("Remembering is paused for this family.");
        await accounts.limit("walrus-writes:global", 500, 86400_000);
        return gateway.submit(record, key);
      },
      status: (id) => gateway.status(id),
      recall: (query) => gateway.recall(query),
      destroy: () => gateway.destroy(),
    };
  };
  let usageDb: Database | undefined;
  let service: LearningService | undefined;
  if (memoryReady && coachReady) {
    usageDb =
      database.kind === "postgres"
        ? database
        : new Database({ filename: resolve(dataDir, "coach-usage.sqlite") });
    await usageDb.ready;
    service = new LearningService(
      store,
      memory,
      new CoachGateway(
        value("OPENAI_API_KEY")!,
        value("COACH_MODEL") ?? COACH_MODEL,
        new CoachBudget(usageDb, value("COACH_BUDGET_USD") ?? "1.00"),
      ),
    );
  }
  const learning: LiveLearning = {
    ready: memoryReady,
    coachReady,
    explain: (family, question) => {
      if (!service)
        throw new LearningUnavailable(
          "The remembered guide is not configured yet.",
        );
      return service.explain(family, question);
    },
  };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  const requestDriven = options.serverless || database.kind === "postgres";
  const maintenance = () => {
    if (stopped) return Promise.resolve();
    if (active) return active;
    active = (async () => {
      const token = randomUUID(),
        now = Date.now();
      const claimed = await database
        .prepare(
          `INSERT INTO maintenance_leases(key,token,until_at) VALUES('runtime',?,?)
        ON CONFLICT(key) DO UPDATE SET token=excluded.token,until_at=excluded.until_at
        WHERE maintenance_leases.until_at<=? RETURNING key`,
        )
        .get(token, now + 120_000, now);
      if (!claimed) return;
      try {
        // Independent workers must not hold up a memory confirmation behind
        // a stock-data import or a slow chain receipt.
        const outcomes = await Promise.allSettled([
          market.refresh(),
          chain.config ? chain.reconcilePending(2) : undefined,
          memoryReady ? store.memoryOutbox.processOne(memory) : undefined,
        ]);
        if (outcomes.some((result) => result.status === "rejected"))
          console.error(
            "[trove] A background worker will retry from persisted state.",
          );
      } catch {
        console.error(
          "[trove] A maintenance cycle will resume from its persisted state.",
        );
      } finally {
        await database
          .prepare(
            "UPDATE maintenance_leases SET until_at=? WHERE key='runtime' AND token=?",
          )
          .run(Date.now() + 1000, token);
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };
  const tick = async () => {
    if (stopped) return;
    await maintenance().catch(() => {});
    if (!stopped) {
      timer = setTimeout(() => void tick(), 1500);
      timer.unref();
    }
  };
  return {
    store,
    market,
    chain,
    learning,
    mail,
    requestDriven,
    maintenance,
    start: () => {
      if (!requestDriven) void tick();
    },
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await active?.catch(() => {});
    },
    close: async () => {
      stopped = true;
      clearTimeout(timer);
      await active?.catch(() => {});
      chain.config?.gateway.destroy();
      if (usageDb && usageDb !== database) await usageDb.close();
      await database.close();
    },
  };
}
