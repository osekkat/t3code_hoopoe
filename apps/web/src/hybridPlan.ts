import {
  type ClientOrchestrationCommand,
  type ModelSelection,
  type ProjectId,
  type ServerProvider,
  type ThreadId,
} from "@t3tools/contracts";
import { truncate } from "@t3tools/shared/String";

import { newCommandId, newMessageId, newThreadId } from "./lib/utils";
import { formatOutgoingPrompt } from "./outgoingPrompt";

const HYBRID_PLAN_FALLBACK_TITLE = "Improved plan";
export const TWO_PLAN_MERGE_PARAGRAPH =
  "Merge these 2 proposed plans into one superior hybrid plan that preserves the best ideas from each, resolves conflicts, and improves clarity and execution details.";
const THREE_PLAN_MERGE_PARAGRAPH =
  "Merge these 3 proposed plans into one superior hybrid plan that preserves the best ideas from each, resolves conflicts, and improves clarity and execution details.";
const COMPARISON_MODEL_SUFFIX_RE = /\s+\((Claude (?:Opus|Sonnet|Haiku) [^)]+|GPT-[^)]+)\)\s*$/u;

interface NativeOrchestrationApi {
  orchestration: {
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
  };
}

export interface HybridPlanSource {
  threadId: ThreadId;
  modelLabel: string;
  planMarkdown: string;
}

export interface HybridPlanOrigin {
  runId?: string | undefined;
  projectId: ProjectId;
  threadIds: ThreadId[];
}

export interface HybridPlanArchiveCandidateThread {
  id: ThreadId;
  archivedAt: string | null;
}

export interface HybridPlanMergeModelResolution {
  modelSelection: ModelSelection;
  modelLabel: string;
  fallbackReason: string | null;
}

export function getHybridPlanSourceThreadIdsToArchive(input: {
  hybridOrigin: HybridPlanOrigin | null | undefined;
  protectedThreadIds?: ReadonlyArray<ThreadId>;
  threads: ReadonlyArray<HybridPlanArchiveCandidateThread>;
}): ThreadId[] {
  if (!input.hybridOrigin) {
    return [];
  }

  const protectedThreadIds = new Set(input.protectedThreadIds ?? []);
  const threadsById = new Map(input.threads.map((thread) => [thread.id, thread] as const));
  const seen = new Set<ThreadId>();

  return input.hybridOrigin.threadIds.filter((threadId) => {
    if (protectedThreadIds.has(threadId) || seen.has(threadId)) {
      return false;
    }
    seen.add(threadId);

    const knownThread = threadsById.get(threadId);
    return knownThread?.archivedAt === null || knownThread === undefined;
  });
}

export async function archiveHybridPlanSourceThreads(input: {
  api: NativeOrchestrationApi;
  hybridOrigin: HybridPlanOrigin | null | undefined;
  protectedThreadIds?: ReadonlyArray<ThreadId>;
  threads: ReadonlyArray<HybridPlanArchiveCandidateThread>;
}): Promise<{
  attemptedThreadIds: ThreadId[];
  failedThreadIds: ThreadId[];
}> {
  const attemptedThreadIds = getHybridPlanSourceThreadIdsToArchive({
    hybridOrigin: input.hybridOrigin,
    threads: input.threads,
    ...(input.protectedThreadIds ? { protectedThreadIds: input.protectedThreadIds } : {}),
  });

  if (attemptedThreadIds.length === 0) {
    return {
      attemptedThreadIds: [],
      failedThreadIds: [],
    };
  }

  const archiveResults = await Promise.allSettled(
    attemptedThreadIds.map((threadId) =>
      input.api.orchestration.dispatchCommand({
        type: "thread.archive",
        commandId: newCommandId(),
        threadId,
      }),
    ),
  );

  return {
    attemptedThreadIds,
    failedThreadIds: archiveResults.flatMap((result, index) =>
      result.status === "rejected" ? [attemptedThreadIds[index]!] : [],
    ),
  };
}

export function resolveHybridPlanMergeModel(
  providers: ReadonlyArray<ServerProvider>,
): HybridPlanMergeModelResolution | null {
  const claude = providers.find((provider) => provider.provider === "claudeAgent");
  const opusAvailable =
    claude?.enabled === true &&
    claude.installed === true &&
    claude.status === "ready" &&
    claude.models.some((model) => model.slug === "claude-opus-4-6");
  if (opusAvailable) {
    return {
      modelSelection: {
        provider: "claudeAgent",
        model: "claude-opus-4-6",
        options: { effort: "max" },
      },
      modelLabel: "Claude Opus 4.6",
      fallbackReason: null,
    };
  }

  const codex = providers.find((provider) => provider.provider === "codex");
  const gptAvailable =
    codex?.enabled === true &&
    codex.installed === true &&
    codex.status === "ready" &&
    codex.models.some((model) => model.slug === "gpt-5.4");
  if (!gptAvailable) {
    return null;
  }

  return {
    modelSelection: {
      provider: "codex",
      model: "gpt-5.4",
      options: { reasoningEffort: "xhigh" },
    },
    modelLabel: "GPT-5.4",
    fallbackReason: "Claude Opus 4.6 is currently unavailable.",
  };
}

export function buildHybridPlanTitle(sourceThreadTitle: string | null | undefined): string {
  const normalized = sourceThreadTitle?.trim();
  if (!normalized) {
    return HYBRID_PLAN_FALLBACK_TITLE;
  }
  const withoutModelSuffix = normalized.replace(COMPARISON_MODEL_SUFFIX_RE, "").trim();
  const base = withoutModelSuffix.length > 0 ? withoutModelSuffix : normalized;
  return truncate(`Improved ${base}`, 64);
}

export function buildHybridPlanMergePrompt(input: {
  plans: ReadonlyArray<HybridPlanSource>;
  twoPlanParagraph?: string;
}): string {
  const count = input.plans.length;
  if (count < 2 || count > 3) {
    throw new Error("Hybrid plan merge requires exactly 2 or 3 plans.");
  }

  const baseParagraph =
    count === 2 ? (input.twoPlanParagraph ?? TWO_PLAN_MERGE_PARAGRAPH) : THREE_PLAN_MERGE_PARAGRAPH;

  const sections = input.plans
    .map(
      (plan, index) =>
        `\n\n## Plan ${index + 1} (${plan.modelLabel})\n\n${plan.planMarkdown.trim()}`,
    )
    .join("");

  return `${baseParagraph}${sections}`;
}

export async function launchHybridPlanThread(input: {
  api: NativeOrchestrationApi;
  projectId: ProjectId;
  title: string;
  prompt: string;
  providers: ReadonlyArray<ServerProvider>;
  modelSelection: ModelSelection;
}): Promise<ThreadId> {
  const createdAt = new Date().toISOString();
  const threadId = newThreadId();
  const promptText = formatOutgoingPrompt({
    providers: input.providers,
    modelSelection: input.modelSelection,
    text: input.prompt,
  });

  await input.api.orchestration.dispatchCommand({
    type: "thread.create",
    commandId: newCommandId(),
    threadId,
    projectId: input.projectId,
    title: input.title,
    modelSelection: input.modelSelection,
    runtimeMode: "full-access",
    interactionMode: "plan",
    branch: null,
    worktreePath: null,
    createdAt,
  });

  await input.api.orchestration.dispatchCommand({
    type: "thread.turn.start",
    commandId: newCommandId(),
    threadId,
    message: {
      messageId: newMessageId(),
      role: "user",
      text: promptText,
      attachments: [],
    },
    modelSelection: input.modelSelection,
    titleSeed: input.title,
    runtimeMode: "full-access",
    interactionMode: "plan",
    createdAt,
  });

  return threadId;
}
