import { ProjectId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { MAX_PLAN_DRAFT_MODELS, usePlanDraftStore } from "./planDraftStore";

const PROJECT_ID = ProjectId.makeUnsafe("project-plan-test");

function resetPlanDraftStore() {
  usePlanDraftStore.setState({ draftsByProjectId: {} });
}

describe("planDraftStore", () => {
  beforeEach(() => {
    resetPlanDraftStore();
  });

  it("enforces the max selected-model count while allowing later replacement", () => {
    const store = usePlanDraftStore.getState();
    store.toggleModelSelection(PROJECT_ID, { provider: "codex", model: "gpt-5.4" });
    store.toggleModelSelection(PROJECT_ID, { provider: "codex", model: "gpt-5.4-mini" });
    store.toggleModelSelection(PROJECT_ID, { provider: "codex", model: "gpt-5.3-codex" });
    store.toggleModelSelection(PROJECT_ID, { provider: "claudeAgent", model: "claude-opus-4-6" });

    expect(usePlanDraftStore.getState().getDraft(PROJECT_ID).selectedModels).toEqual([
      { provider: "codex", model: "gpt-5.4" },
      { provider: "codex", model: "gpt-5.4-mini" },
      { provider: "codex", model: "gpt-5.3-codex" },
    ]);
    expect(usePlanDraftStore.getState().getDraft(PROJECT_ID).selectedModels).toHaveLength(
      MAX_PLAN_DRAFT_MODELS,
    );

    store.toggleModelSelection(PROJECT_ID, { provider: "codex", model: "gpt-5.4-mini" });
    store.toggleModelSelection(PROJECT_ID, { provider: "claudeAgent", model: "claude-opus-4-6" });

    expect(usePlanDraftStore.getState().getDraft(PROJECT_ID).selectedModels).toEqual([
      { provider: "codex", model: "gpt-5.4" },
      { provider: "codex", model: "gpt-5.3-codex" },
      { provider: "claudeAgent", model: "claude-opus-4-6" },
    ]);
  });

  it("preserves prompt state while selections change for the same project", () => {
    const store = usePlanDraftStore.getState();

    store.setPrompt(PROJECT_ID, "Build a kanban board with offline sync", 12);
    store.toggleModelSelection(PROJECT_ID, { provider: "codex", model: "gpt-5.4" });
    store.toggleModelSelection(PROJECT_ID, { provider: "claudeAgent", model: "claude-sonnet-4-6" });

    expect(usePlanDraftStore.getState().getDraft(PROJECT_ID)).toEqual({
      prompt: "Build a kanban board with offline sync",
      cursor: 12,
      selectedModels: [
        { provider: "codex", model: "gpt-5.4" },
        { provider: "claudeAgent", model: "claude-sonnet-4-6" },
      ],
    });
  });
});
