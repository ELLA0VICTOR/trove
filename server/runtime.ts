import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { configuredValue } from "./config.ts";
import { DemoStore } from "./store.ts";
import { Accounts, AccessError } from "./auth.ts";
import { WalrusMemoryGateway } from "./integrations/walrus.ts";
import type { MemoryReader } from "./integrations/walrus.ts";
import { CoachGateway } from "./integrations/coach.ts";
import { CoachBudget, COACH_MODEL } from "./jobs/coach-budget.ts";
import { LearningService, LearningUnavailable } from "./learning-service.ts";
import type { LiveLearning } from "./learning-service.ts";

export function createRuntime() {
  const value = (name: string) => configuredValue(process.env, name);
  const enabled = process.env.TROVE_LIVE_SERVICES !== "0";
  const memoryReady = Boolean(
    enabled && value("MEMWAL_ACCOUNT_ID") && value("MEMWAL_PRIVATE_KEY"),
  );
  const coachReady = Boolean(
    enabled && value("OPENAI_API_KEY") && value("COACH_MODEL"),
  );
  const store = new DemoStore(resolve(".trove/local.sqlite"), {
    liveMemory: memoryReady,
  });
  const accounts = new Accounts(store);
  const memory = (scope: string): MemoryReader => {
    const profiles = store.db
      .prepare("SELECT family,memory_enabled FROM account_profiles")
      .all() as { family: string; memory_enabled: number }[];
    const owner = profiles.find(
      (profile) => store.memoryScope(profile.family) === scope,
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
        if (!store.profile(owner.family)?.memory_enabled)
          throw new AccessError("Remembering is paused for this family.");
        accounts.limit("walrus-writes:global", 500, 86400_000);
        return gateway.submit(record, key);
      },
      status: (id) => gateway.status(id),
      recall: (query) => gateway.recall(query),
      destroy: () => gateway.destroy(),
    };
  };
  let usageDb: DatabaseSync | undefined;
  let service: LearningService | undefined;
  if (memoryReady && coachReady) {
    mkdirSync(resolve(".trove"), { recursive: true });
    usageDb = new DatabaseSync(resolve(".trove/coach-usage.sqlite"));
    const budget = new CoachBudget(
      usageDb,
      value("COACH_BUDGET_USD") ?? "1.00",
    );
    const coach = new CoachGateway(
      value("OPENAI_API_KEY")!,
      value("COACH_MODEL") ?? COACH_MODEL,
      budget,
    );
    service = new LearningService(store, memory, coach);
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
  let stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<unknown> | undefined;
  const tick = async () => {
    if (stopped || !memoryReady) return;
    try {
      active = store.memoryOutbox.processOne(memory);
      await active;
    } catch {
      console.error(
        "[trove] Memory worker could not complete its database cycle; it will retry.",
      );
    }
    active = undefined;
    if (!stopped) {
      timer = setTimeout(() => void tick(), 1500);
      timer.unref();
    }
  };
  return {
    store,
    learning,
    start: () => void tick(),
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await active?.catch(() => {});
    },
    close: () => {
      stopped = true;
      clearTimeout(timer);
      usageDb?.close();
      store.db.close();
    },
  };
}
