import { createHash, randomUUID } from "node:crypto";
import type { GuideReply } from "../shared/model.ts";
import type { DemoStore } from "./store.ts";
import type { MemoryReader } from "./integrations/walrus.ts";
import { AccessError } from "./auth.ts";

export class LearningUnavailable extends Error {
  readonly status: 409 | 503;
  constructor(message: string, status: 409 | 503 = 503) {
    super(message);
    this.status = status;
  }
}
export interface LiveLearning {
  ready: boolean;
  coachReady: boolean;
  explain(family: string, question: string): Promise<GuideReply>;
}
export class LearningService implements LiveLearning {
  readonly ready = true;
  readonly coachReady = true;
  private readonly store: DemoStore;
  private readonly memory: (scope: string) => MemoryReader;
  private readonly coach: {
    explain(
      question: string,
      memories: { id: string; text: string; kind?: string }[],
    ): Promise<GuideReply>;
  };
  constructor(
    store: DemoStore,
    memory: (scope: string) => MemoryReader,
    coach: LearningService["coach"],
  ) {
    this.store = store;
    this.memory = memory;
    this.coach = coach;
  }
  private fingerprint(family: string) {
    return createHash("sha256")
      .update(
        JSON.stringify(
          this.store
            .get(family)
            .memories.filter((record) => record.active)
            .map((record) => [
              record.id,
              record.kind,
              record.text,
              record.supersedes,
              record.blobId,
            ]),
        ),
      )
      .digest("hex");
  }
  async explain(family: string, question: string) {
    if (!this.store.profile(family)?.memory_enabled)
      throw new AccessError(
        "Your parent can enable remembering in Account settings.",
      );
    const state = this.store.get(family);
    const active = state.memories.filter(
      (record) => record.active && record.origin === "local",
    );
    if (active.some((record) => !record.blobId))
      throw new LearningUnavailable(
        "Your latest thoughts are still syncing. Check Saved thoughts, then try again.",
        409,
      );
    const fingerprint = this.fingerprint(family);
    const cacheKey = createHash("sha256")
      .update(JSON.stringify([question.trim(), fingerprint]))
      .digest("hex");
    const token = randomUUID(),
      now = Date.now();
    const cached = this.store.atomic(() => {
      const previous = this.store.db
        .prepare(
          "SELECT reply,until_at FROM coaching_cache WHERE family=? AND cache_key=?",
        )
        .get(family, cacheKey) as
        { reply: string | null; until_at: number } | undefined;
      if (previous && previous.until_at > now) {
        if (previous.reply)
          return { ...JSON.parse(previous.reply), cached: true } as GuideReply;
        throw new LearningUnavailable(
          "That explanation is already being prepared. Please wait a moment.",
          409,
        );
      }
      this.store.db
        .prepare(
          `INSERT INTO coaching_cache(family,cache_key,token,until_at) VALUES(?,?,?,?)
        ON CONFLICT(family,cache_key) DO UPDATE SET token=excluded.token,until_at=excluded.until_at,reply=NULL`,
        )
        .run(family, cacheKey, token, now + 60_000);
      return null;
    });
    if (cached) return cached;
    let gateway: MemoryReader | undefined;
    let stage = "recall";
    try {
      const scope = this.store.memoryScope(family);
      gateway = this.memory(scope);
      let hits = active.length ? await gateway.recall(question) : [];
      const correction = active.find((record) => record.kind === "correction");
      if (
        correction &&
        !hits.some((hit) => hit.record.eventId === correction.id)
      )
        hits = [...hits, ...(await gateway.recall(correction.text))];
      const canonical = new Map(active.map((record) => [record.id, record]));
      const verified = new Map<
        string,
        { id: string; text: string; kind: string; blobId: string }
      >();
      for (const hit of hits) {
        const stored = canonical.get(hit.record.eventId);
        if (
          !stored ||
          hit.record.learnerScope !== scope ||
          hit.record.text !== stored.text ||
          hit.record.kind !== stored.kind ||
          hit.record.recordedAt !== stored.recordedAt ||
          hit.record.decisionId !== stored.decisionId ||
          hit.record.supersedes !== stored.supersedes ||
          !hit.blobId ||
          hit.blobId !== stored.blobId
        )
          continue;
        verified.set(stored.id, {
          id: stored.id,
          text: stored.text,
          kind: stored.kind,
          blobId: hit.blobId,
        });
      }
      if (correction && !verified.has(correction.id))
        throw new LearningUnavailable(
          "Your current correction could not be retrieved. Try again shortly; an older interpretation will not replace it.",
        );
      // Corrections take precedence even when semantic recall ranked them lower.
      const context = [...verified.values()]
        .sort(
          (a, b) =>
            (b.id === correction?.id ? 1 : 0) -
            (a.id === correction?.id ? 1 : 0),
        )
        .slice(0, 6);
      if (active.length && !context.length)
        throw new LearningUnavailable(
          "Your saved learning context could not be retrieved. Please try again shortly.",
        );
      stage = "coach";
      const reply = await this.coach.explain(
        question,
        context.map(({ id, text, kind }) => ({
          id,
          text,
          kind,
        })),
      );
      if (
        reply.sources.some(
          (source) => !context.some((record) => record.id === source),
        )
      )
        throw new LearningUnavailable(
          "The explanation cited unavailable evidence. Please try again.",
        );
      if (correction && !reply.sources.includes(correction.id))
        throw new LearningUnavailable(
          "The explanation did not account for your latest correction. It was not shown; please try again.",
        );
      if (
        !this.store.profile(family)?.memory_enabled ||
        this.fingerprint(family) !== fingerprint
      )
        throw new LearningUnavailable(
          "Your saved thoughts changed during this explanation. Ask again with the latest context.",
          409,
        );
      const result: GuideReply = {
        ...reply,
        evidence: context
          .filter((record) => reply.sources.includes(record.id))
          .map(({ id, kind, blobId }) => ({ id, kind, blobId })),
      };
      this.store.db
        .prepare(
          "UPDATE coaching_cache SET reply=?,until_at=? WHERE family=? AND cache_key=? AND token=?",
        )
        .run(
          JSON.stringify(result),
          Date.now() + 5 * 60_000,
          family,
          cacheKey,
          token,
        );
      return result;
    } catch (error) {
      if (error instanceof LearningUnavailable || error instanceof AccessError)
        throw error;
      console.error(
        `[trove] Remembered guide unavailable at ${stage}; no raw provider error or memory text logged.`,
      );
      throw new LearningUnavailable(
        "The remembered guide is temporarily unavailable or its allowance is exhausted. Your choices are saved; try again later.",
      );
    } finally {
      gateway?.destroy?.();
      this.store.db
        .prepare(
          "DELETE FROM coaching_cache WHERE family=? AND cache_key=? AND token=? AND reply IS NULL",
        )
        .run(family, cacheKey, token);
    }
  }
}
