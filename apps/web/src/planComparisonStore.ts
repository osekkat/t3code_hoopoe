import { type ProjectId, type ProviderKind, type ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

export type PlanComparisonPaneState = "ready" | "error";

export interface PlanComparisonPaneDescriptor {
  provider: ProviderKind;
  providerLabel: string;
  model: string;
  modelName: string;
  threadId: ThreadId | null;
  state: PlanComparisonPaneState;
  error: string | null;
}

export interface PlanComparisonRun {
  projectId: ProjectId;
  panes: PlanComparisonPaneDescriptor[];
}

interface PlanComparisonStoreState {
  runsById: Record<string, PlanComparisonRun>;
  setRun: (runId: string, run: PlanComparisonRun) => void;
  clearRun: (runId: string) => void;
}

export const usePlanComparisonStore = create<PlanComparisonStoreState>()((set) => ({
  runsById: {},
  setRun: (runId, run) => {
    if (!runId.trim()) {
      return;
    }
    set((state) => ({
      runsById: {
        ...state.runsById,
        [runId]: run,
      },
    }));
  },
  clearRun: (runId) => {
    if (!runId.trim()) {
      return;
    }
    set((state) => {
      if (!Object.hasOwn(state.runsById, runId)) {
        return state;
      }
      const { [runId]: _removed, ...rest } = state.runsById;
      return { runsById: rest };
    });
  },
}));
