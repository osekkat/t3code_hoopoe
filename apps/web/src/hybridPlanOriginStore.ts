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

export const useHybridPlanOriginStore = create<HybridPlanOriginStoreState>()((set) => ({
  originsByHybridThreadId: {},
  setOrigin: (hybridThreadId, origin) => {
    set((state) => ({
      originsByHybridThreadId: {
        ...state.originsByHybridThreadId,
        [hybridThreadId]: origin,
      },
    }));
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
