import {
  type ClaudeCodeEffort,
  type ClientOrchestrationCommand,
  type CodexReasoningEffort,
  type ModelSelection,
  type ProjectId,
  PROVIDER_DISPLAY_NAMES,
  type ServerProvider,
  type ThreadId,
} from "@t3tools/contracts";
import { truncate } from "@t3tools/shared/String";

import { newCommandId, newMessageId, newThreadId, randomUUID } from "./lib/utils";
import { formatOutgoingPrompt } from "./outgoingPrompt";
import { type PlanComparisonPaneDescriptor } from "./planComparisonStore";
import { type PlanDraftModelSelection } from "./planDraftStore";
import {
  buildNewPlanModelOptionKey,
  getNewPlanModelOptions,
  getProviderModelCapabilities,
  getProviderModels,
} from "./providerModels";

interface NativeOrchestrationApi {
  orchestration: {
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{
      sequence: number;
    }>;
  };
}

export interface ResolvedNewPlanLaunchTarget {
  key: string;
  provider: PlanDraftModelSelection["provider"];
  providerLabel: string;
  model: string;
  modelName: string;
  modelSelection: ModelSelection;
  threadId: ThreadId;
  title: string;
}

export interface LaunchNewPlanComparisonResult {
  runId: string;
  panes: PlanComparisonPaneDescriptor[];
  successfulThreadIds: ThreadId[];
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown error.";
}

function findHighestNativeEffortLevel(
  caps: Pick<
    NonNullable<ServerProvider["models"][number]["capabilities"]>,
    "reasoningEffortLevels" | "promptInjectedEffortLevels"
  >,
): string | null {
  const nativeOptions = caps.reasoningEffortLevels.filter(
    (level) => !caps.promptInjectedEffortLevels.includes(level.value),
  );
  return nativeOptions.at(-1)?.value ?? null;
}

function resolveCodexPlanningOptions(
  providers: ReadonlyArray<ServerProvider>,
  model: string,
): ModelSelection["options"] | undefined {
  const caps = getProviderModelCapabilities(getProviderModels(providers, "codex"), model, "codex");
  const reasoningEffort = findHighestNativeEffortLevel(caps);
  if (!reasoningEffort) {
    return undefined;
  }
  return {
    reasoningEffort: reasoningEffort as CodexReasoningEffort,
  };
}

function resolveClaudePlanningOptions(
  providers: ReadonlyArray<ServerProvider>,
  model: string,
): ModelSelection["options"] | undefined {
  const caps = getProviderModelCapabilities(
    getProviderModels(providers, "claudeAgent"),
    model,
    "claudeAgent",
  );
  const effortLevels = new Set(caps.reasoningEffortLevels.map((level) => level.value));
  if (effortLevels.has("max")) {
    return { effort: "max" satisfies ClaudeCodeEffort };
  }
  if (effortLevels.has("ultrathink")) {
    return { effort: "ultrathink" satisfies ClaudeCodeEffort };
  }
  if (caps.supportsThinkingToggle) {
    return { thinking: true };
  }
  const fallbackEffort = findHighestNativeEffortLevel(caps);
  if (!fallbackEffort) {
    return undefined;
  }
  return {
    effort: fallbackEffort as ClaudeCodeEffort,
  };
}

export function resolveNewPlanLaunchModelSelection(
  providers: ReadonlyArray<ServerProvider>,
  selection: PlanDraftModelSelection,
): ModelSelection | null {
  const normalizedModels = getProviderModels(providers, selection.provider);
  const matchingModel = normalizedModels.find((model) => model.slug === selection.model);
  if (!matchingModel) {
    return null;
  }

  switch (selection.provider) {
    case "codex": {
      const options = resolveCodexPlanningOptions(providers, matchingModel.slug);
      return {
        provider: "codex",
        model: matchingModel.slug,
        ...(options ? { options } : {}),
      };
    }
    case "claudeAgent": {
      const options = resolveClaudePlanningOptions(providers, matchingModel.slug);
      return {
        provider: "claudeAgent",
        model: matchingModel.slug,
        ...(options ? { options } : {}),
      };
    }
  }
}

export function buildNewPlanThreadTitle(prompt: string, modelName: string): string {
  const trimmedPrompt = prompt.trim();
  const suffix = ` (${modelName})`;
  const maxLength = 50;

  if (!trimmedPrompt) {
    return truncate(`New plan${suffix}`, maxLength);
  }

  const availablePromptLength = maxLength - suffix.length;
  if (trimmedPrompt.length <= availablePromptLength) {
    return `${trimmedPrompt}${suffix}`;
  }

  const ellipsis = "...";
  const truncatedPromptLength = Math.max(0, availablePromptLength - ellipsis.length);
  const truncatedPrompt = trimmedPrompt.slice(0, truncatedPromptLength).trimEnd();
  return `${truncatedPrompt}${ellipsis}${suffix}`;
}

export function resolveNewPlanLaunchTargets(input: {
  prompt: string;
  selectedModels: ReadonlyArray<PlanDraftModelSelection>;
  providers: ReadonlyArray<ServerProvider>;
}): ResolvedNewPlanLaunchTarget[] {
  const selectableModels = new Map(
    getNewPlanModelOptions(input.providers).map((model) => [model.key, model] as const),
  );

  return input.selectedModels.flatMap((selection) => {
    const key = buildNewPlanModelOptionKey(selection);
    const selectableModel = selectableModels.get(key);
    if (!selectableModel) {
      return [];
    }

    const modelSelection = resolveNewPlanLaunchModelSelection(input.providers, selection);
    if (!modelSelection) {
      return [];
    }

    return [
      {
        key,
        provider: selection.provider,
        providerLabel:
          selectableModel.providerLabel ?? PROVIDER_DISPLAY_NAMES[selectableModel.provider],
        model: selectableModel.model,
        modelName: selectableModel.name,
        modelSelection,
        threadId: newThreadId(),
        title: buildNewPlanThreadTitle(input.prompt, selectableModel.name),
      },
    ];
  });
}

export async function launchNewPlanComparison(input: {
  api: NativeOrchestrationApi;
  projectId: ProjectId;
  prompt: string;
  selectedModels: ReadonlyArray<PlanDraftModelSelection>;
  providers: ReadonlyArray<ServerProvider>;
}): Promise<LaunchNewPlanComparisonResult> {
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const targets = resolveNewPlanLaunchTargets({
    prompt: input.prompt,
    selectedModels: input.selectedModels,
    providers: input.providers,
  });

  const createResults = await Promise.allSettled(
    targets.map(async (target) => {
      await input.api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId: target.threadId,
        projectId: input.projectId,
        title: target.title,
        modelSelection: target.modelSelection,
        runtimeMode: "full-access",
        interactionMode: "plan",
        branch: null,
        worktreePath: null,
        createdAt,
      });
      return target;
    }),
  );

  const pendingTurns: ResolvedNewPlanLaunchTarget[] = [];
  const panesByKey = new Map<string, PlanComparisonPaneDescriptor>();

  for (const [index, result] of createResults.entries()) {
    const target = targets[index];
    if (!target) {
      continue;
    }

    if (result.status === "fulfilled") {
      pendingTurns.push(result.value);
      continue;
    }

    panesByKey.set(target.key, {
      provider: target.provider,
      providerLabel: target.providerLabel,
      model: target.model,
      modelName: target.modelName,
      threadId: null,
      state: "error",
      error: `Failed to create ${target.modelName} plan thread. ${normalizeErrorMessage(result.reason)}`,
    });
  }

  const turnResults = await Promise.allSettled(
    pendingTurns.map(async (target) => {
      await input.api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: target.threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: formatOutgoingPrompt({
            providers: input.providers,
            modelSelection: target.modelSelection,
            text: input.prompt.trim(),
          }),
          attachments: [],
        },
        modelSelection: target.modelSelection,
        titleSeed: target.title,
        runtimeMode: "full-access",
        interactionMode: "plan",
        createdAt,
      });
      return target;
    }),
  );

  for (const [index, result] of turnResults.entries()) {
    const target = pendingTurns[index];
    if (!target) {
      continue;
    }

    if (result.status === "fulfilled") {
      panesByKey.set(target.key, {
        provider: target.provider,
        providerLabel: target.providerLabel,
        model: target.model,
        modelName: target.modelName,
        threadId: target.threadId,
        state: "ready",
        error: null,
      });
      continue;
    }

    panesByKey.set(target.key, {
      provider: target.provider,
      providerLabel: target.providerLabel,
      model: target.model,
      modelName: target.modelName,
      threadId: target.threadId,
      state: "error",
      error: `Failed to start ${target.modelName} planning turn. ${normalizeErrorMessage(result.reason)}`,
    });
  }

  const panes = targets.flatMap((target) => {
    const pane = panesByKey.get(target.key);
    return pane ? [pane] : [];
  });
  const successfulThreadIds = panes.flatMap((pane) =>
    pane.state === "ready" && pane.threadId ? [pane.threadId] : [],
  );

  return {
    runId,
    panes,
    successfulThreadIds,
  };
}
