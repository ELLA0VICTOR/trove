import type { AppSnapshot } from "../../shared/model.ts";

export interface MemoryProgress {
  records: {
    id: string;
    status: string;
    blobId?: string;
    withdrawn: boolean;
  }[];
}

export function waitingForMemory(state: AppSnapshot | null) {
  return Boolean(
    state?.session?.mode === "account" &&
    state.session.memoryEnabled &&
    state.session.servicesReady &&
    state.memories.some(
      (memory) =>
        memory.active &&
        memory.origin === "local" &&
        !memory.blobId &&
        memory.syncStatus !== "failed",
    ),
  );
}

/** Progress changes only existing immutable records; it cannot add or reactivate a thought. */
export function applyMemoryProgress(
  state: AppSnapshot,
  progress: MemoryProgress,
): AppSnapshot {
  const jobs = new Map(
    progress.records
      .filter((job) => !job.withdrawn)
      .map((job) => [job.id, job]),
  );
  let changed = false;
  const memories = state.memories.map((memory) => {
    const job = jobs.get(memory.id);
    if (
      !memory.active ||
      memory.origin !== "local" ||
      !job ||
      job.status === "held"
    )
      return memory;
    if (memory.blobId && job.status !== "confirmed") return memory;
    const blobId = job.status === "confirmed" ? job.blobId : undefined;
    if (job.status === memory.syncStatus && blobId === memory.blobId)
      return memory;
    changed = true;
    return { ...memory, syncStatus: job.status, blobId };
  });
  return changed ? { ...state, memories } : state;
}

/** An older full response must not erase confirmation already received by the progress poll. */
export function retainMemoryConfirmations(
  previous: AppSnapshot | null,
  next: AppSnapshot,
) {
  if (!previous || previous.id !== next.id) return next;
  const confirmed = previous.memories.filter(
    (memory) => memory.active && memory.origin === "local" && memory.blobId,
  );
  return {
    ...next,
    memories: next.memories.map((memory) => {
      const old = confirmed.find(
        (item) => item.id === memory.id && item.text === memory.text,
      );
      return old && memory.active && !memory.blobId
        ? { ...memory, blobId: old.blobId, syncStatus: "confirmed" }
        : memory;
    }),
  };
}
