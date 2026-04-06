import { type ProjectId, type ProviderKind } from "@t3tools/contracts";
import { create } from "zustand";

export interface PlanDraftModelSelection {
  provider: ProviderKind;
  model: string;
}

export interface PlanDraftState {
  prompt: string;
  cursor: number;
  selectedModels: PlanDraftModelSelection[];
}

interface PlanDraftStoreState {
  draftsByProjectId: Record<ProjectId, PlanDraftState>;
  getDraft: (projectId: ProjectId) => PlanDraftState;
  setPrompt: (projectId: ProjectId, prompt: string, cursor: number) => void;
  toggleModelSelection: (projectId: ProjectId, selection: PlanDraftModelSelection) => void;
  replaceSelectedModels: (
    projectId: ProjectId,
    selections: ReadonlyArray<PlanDraftModelSelection>,
  ) => void;
  clearDraft: (projectId: ProjectId) => void;
}

export const MAX_PLAN_DRAFT_MODELS = 3;

const EMPTY_SELECTED_MODELS: PlanDraftModelSelection[] = [];
const EMPTY_PLAN_DRAFT: PlanDraftState = Object.freeze({
  prompt: "",
  cursor: 0,
  selectedModels: EMPTY_SELECTED_MODELS,
});

function createEmptyPlanDraft(): PlanDraftState {
  return {
    prompt: "",
    cursor: 0,
    selectedModels: [],
  };
}

export function buildPlanModelSelectionKey(input: PlanDraftModelSelection): string {
  return `${input.provider}:${input.model}`;
}

function clampPlanDraftCursor(prompt: string, cursor: number): number {
  if (!Number.isFinite(cursor)) {
    return 0;
  }
  return Math.max(0, Math.min(prompt.length, Math.floor(cursor)));
}

function normalizePlanDraftSelections(
  selections: ReadonlyArray<PlanDraftModelSelection>,
): PlanDraftModelSelection[] {
  const normalizedSelections: PlanDraftModelSelection[] = [];
  const seen = new Set<string>();

  for (const selection of selections) {
    if (selection.provider !== "codex" && selection.provider !== "claudeAgent") {
      continue;
    }
    const model = selection.model.trim();
    if (model.length === 0) {
      continue;
    }
    const normalizedSelection = { provider: selection.provider, model };
    const key = buildPlanModelSelectionKey(normalizedSelection);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalizedSelections.push(normalizedSelection);
    if (normalizedSelections.length >= MAX_PLAN_DRAFT_MODELS) {
      break;
    }
  }

  return normalizedSelections;
}

function shouldRemovePlanDraft(draft: PlanDraftState): boolean {
  return draft.prompt.length === 0 && draft.cursor === 0 && draft.selectedModels.length === 0;
}

function areSelectionsEqual(
  left: ReadonlyArray<PlanDraftModelSelection>,
  right: ReadonlyArray<PlanDraftModelSelection>,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (selection, index) =>
        selection.provider === right[index]?.provider && selection.model === right[index]?.model,
    )
  );
}

export const usePlanDraftStore = create<PlanDraftStoreState>()((set, get) => ({
  draftsByProjectId: {},
  getDraft: (projectId) => get().draftsByProjectId[projectId] ?? EMPTY_PLAN_DRAFT,
  setPrompt: (projectId, prompt, cursor) => {
    if (projectId.length === 0) {
      return;
    }

    set((state) => {
      const existing = state.draftsByProjectId[projectId] ?? createEmptyPlanDraft();
      const nextPrompt = prompt;
      const nextCursor = clampPlanDraftCursor(nextPrompt, cursor);
      if (existing.prompt === nextPrompt && existing.cursor === nextCursor) {
        return state;
      }

      const nextDraft: PlanDraftState = {
        ...existing,
        prompt: nextPrompt,
        cursor: nextCursor,
      };
      if (shouldRemovePlanDraft(nextDraft)) {
        const { [projectId]: _removed, ...rest } = state.draftsByProjectId;
        return { draftsByProjectId: rest };
      }

      return {
        draftsByProjectId: {
          ...state.draftsByProjectId,
          [projectId]: nextDraft,
        },
      };
    });
  },
  toggleModelSelection: (projectId, selection) => {
    if (projectId.length === 0) {
      return;
    }

    set((state) => {
      const existing = state.draftsByProjectId[projectId] ?? createEmptyPlanDraft();
      const normalizedModel = selection.model.trim();
      if (
        normalizedModel.length === 0 ||
        (selection.provider !== "codex" && selection.provider !== "claudeAgent")
      ) {
        return state;
      }

      const normalizedSelection: PlanDraftModelSelection = {
        provider: selection.provider,
        model: normalizedModel,
      };
      const selectionKey = buildPlanModelSelectionKey(normalizedSelection);
      const existingIndex = existing.selectedModels.findIndex(
        (candidate) => buildPlanModelSelectionKey(candidate) === selectionKey,
      );

      const nextSelectedModels =
        existingIndex >= 0
          ? existing.selectedModels.filter((_, index) => index !== existingIndex)
          : existing.selectedModels.length < MAX_PLAN_DRAFT_MODELS
            ? [...existing.selectedModels, normalizedSelection]
            : existing.selectedModels;

      if (areSelectionsEqual(existing.selectedModels, nextSelectedModels)) {
        return state;
      }

      const nextDraft: PlanDraftState = {
        ...existing,
        selectedModels: nextSelectedModels,
      };
      if (shouldRemovePlanDraft(nextDraft)) {
        const { [projectId]: _removed, ...rest } = state.draftsByProjectId;
        return { draftsByProjectId: rest };
      }

      return {
        draftsByProjectId: {
          ...state.draftsByProjectId,
          [projectId]: nextDraft,
        },
      };
    });
  },
  replaceSelectedModels: (projectId, selections) => {
    if (projectId.length === 0) {
      return;
    }

    set((state) => {
      const existing = state.draftsByProjectId[projectId] ?? createEmptyPlanDraft();
      const nextSelectedModels = normalizePlanDraftSelections(selections);
      if (areSelectionsEqual(existing.selectedModels, nextSelectedModels)) {
        return state;
      }

      const nextDraft: PlanDraftState = {
        ...existing,
        selectedModels: nextSelectedModels,
      };
      if (shouldRemovePlanDraft(nextDraft)) {
        const { [projectId]: _removed, ...rest } = state.draftsByProjectId;
        return { draftsByProjectId: rest };
      }

      return {
        draftsByProjectId: {
          ...state.draftsByProjectId,
          [projectId]: nextDraft,
        },
      };
    });
  },
  clearDraft: (projectId) => {
    if (projectId.length === 0) {
      return;
    }

    set((state) => {
      if (!Object.hasOwn(state.draftsByProjectId, projectId)) {
        return state;
      }
      const { [projectId]: _removed, ...rest } = state.draftsByProjectId;
      return { draftsByProjectId: rest };
    });
  },
}));
