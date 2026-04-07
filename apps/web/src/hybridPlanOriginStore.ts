import { type ProjectId, type ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export interface HybridPlanOriginEntry {
  runId?: string | undefined;
  projectId: ProjectId;
  threadIds: ThreadId[];
}

interface HybridPlanOriginStoreState {
  originsByHybridThreadId: Record<string, HybridPlanOriginEntry>;
  setOrigin: (hybridThreadId: ThreadId, origin: HybridPlanOriginEntry) => void;
  clearOrigin: (hybridThreadId: ThreadId) => void;
}

function hybridPlanOriginsEqual(
  left: HybridPlanOriginEntry | undefined,
  right: HybridPlanOriginEntry,
): boolean {
  if (!left) {
    return false;
  }
  if (left.projectId !== right.projectId || left.runId !== right.runId) {
    return false;
  }
  if (left.threadIds.length !== right.threadIds.length) {
    return false;
  }
  return left.threadIds.every((threadId, index) => threadId === right.threadIds[index]);
}

export const useHybridPlanOriginStore = create<HybridPlanOriginStoreState>()((set) => ({
  originsByHybridThreadId: {},
  setOrigin: (hybridThreadId, origin) => {
    set((state) => {
      const existing = state.originsByHybridThreadId[hybridThreadId];
      if (hybridPlanOriginsEqual(existing, origin)) {
        return state;
      }
      return {
        originsByHybridThreadId: {
          ...state.originsByHybridThreadId,
          [hybridThreadId]: {
            ...origin,
            threadIds: [...origin.threadIds],
          },
        },
      };
    });
  },
  clearOrigin: (hybridThreadId) => {
    set((state) => {
      if (!Object.hasOwn(state.originsByHybridThreadId, hybridThreadId)) {
        return state;
      }
      const { [hybridThreadId]: _removed, ...rest } = state.originsByHybridThreadId;
      return { originsByHybridThreadId: rest };
    });
  },
}));
