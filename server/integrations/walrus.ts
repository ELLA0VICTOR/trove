import { MemWal } from "@mysten-incubation/memwal";
import { z } from "zod";

export const memoryEnvelope = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().min(1),
    learnerScope: z.string().min(1),
    kind: z.enum(["decision", "reflection", "correction", "learning"]),
    text: z.string().max(1500),
    recordedAt: z.iso.datetime(),
    decisionId: z.string().optional(),
    supersedes: z.string().optional(),
  })
  .strict();
export type MemoryEnvelope = z.infer<typeof memoryEnvelope>;

export interface MemoryGateway {
  submit(record: MemoryEnvelope, operationKey: string): Promise<string>;
  status(
    jobId: string,
  ): Promise<{ state: "waiting" | "confirmed" | "failed"; blobId?: string }>;
}
export class WalrusMemoryGateway implements MemoryGateway {
  private client: MemWal;
  private scope: string;
  constructor(config: {
    accountId: string;
    delegateKey: string;
    learnerScope: string;
    serverUrl?: string;
  }) {
    if (
      !/^0x[a-fA-F0-9]{1,64}$/.test(config.accountId) ||
      !/^[a-zA-Z0-9_-]{1,90}$/.test(config.learnerScope)
    )
      throw new Error(
        "Invalid Walrus account or server-derived learner scope.",
      );
    const url = config.serverUrl ?? "https://relayer.memory.walrus.xyz";
    if (url !== "https://relayer.memory.walrus.xyz")
      throw new Error(
        "The final memory adapter is restricted to the configured Mainnet managed relayer.",
      );
    this.scope = config.learnerScope;
    this.client = MemWal.create({
      key: config.delegateKey,
      accountId: config.accountId,
      serverUrl: url,
      namespace: `trove-${this.scope}`,
      requestTimeoutMs: 15_000,
    });
  }
  async submit(input: MemoryEnvelope, operationKey: string) {
    const record = memoryEnvelope.parse(input);
    if (record.learnerScope !== this.scope)
      throw new Error("Memory scope mismatch.");
    const accepted = await this.client.remember(JSON.stringify(record), {
      idempotencyKey: operationKey,
    });
    return accepted.job_id;
  }
  async status(
    jobId: string,
  ): Promise<{ state: "waiting" | "confirmed" | "failed"; blobId?: string }> {
    const result = await this.client.getRememberStatus(jobId);
    if (result.status === "done" && result.blob_id)
      return { state: "confirmed", blobId: result.blob_id };
    if (result.status === "failed" || result.status === "not_found")
      return { state: "failed" };
    return { state: "waiting" };
  }
  async recall(query: string) {
    const response = await this.client.recall({
      query,
      limit: 12,
      namespace: `trove-${this.scope}`,
    });
    return response.results.flatMap((hit) => {
      try {
        const parsed = memoryEnvelope.safeParse(JSON.parse(hit.text));
        return parsed.success && parsed.data.learnerScope === this.scope
          ? [{ record: parsed.data, blobId: hit.blob_id }]
          : [];
      } catch {
        return [];
      }
    });
  }
  destroy() {
    this.client.destroy();
  }
}
