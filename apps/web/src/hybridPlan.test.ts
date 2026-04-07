import { describe, expect, it, vi } from "vitest";
import {
  ProjectId,
  ThreadId,
  type ModelCapabilities,
  type ServerProvider,
} from "@t3tools/contracts";

import {
  archiveHybridPlanSourceThreads,
  buildHybridPlanMergePrompt,
  buildHybridPlanTitle,
  getHybridPlanSourceThreadIdsToArchive,
  resolveHybridPlanMergeModel,
} from "./hybridPlan";

function capabilities(input: Partial<ModelCapabilities> = {}): ModelCapabilities {
  return {
    reasoningEffortLevels: [],
    supportsFastMode: false,
    supportsThinkingToggle: false,
    contextWindowOptions: [],
    promptInjectedEffortLevels: [],
    ...input,
  };
}

function makeProvider(input: {
  provider: ServerProvider["provider"];
  status?: ServerProvider["status"];
  enabled?: boolean;
  installed?: boolean;
  models: Array<{ slug: string; name: string; capabilities: ModelCapabilities | null }>;
}): ServerProvider {
  return {
    provider: input.provider,
    enabled: input.enabled ?? true,
    installed: input.installed ?? true,
    version: "1.0.0",
    status: input.status ?? "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-04-06T12:00:00.000Z",
    models: input.models.map((model) => ({
      slug: model.slug,
      name: model.name,
      isCustom: false,
      capabilities: model.capabilities,
    })),
  };
}

describe("hybrid plan helpers", () => {
  it("prefers Claude Opus 4.6 max when available", () => {
    const providers = [
      makeProvider({
        provider: "claudeAgent",
        models: [
          { slug: "claude-opus-4-6", name: "Claude Opus 4.6", capabilities: capabilities() },
        ],
      }),
    ];

    expect(resolveHybridPlanMergeModel(providers)).toEqual({
      modelSelection: {
        provider: "claudeAgent",
        model: "claude-opus-4-6",
        options: { effort: "max" },
      },
      modelLabel: "Claude Opus 4.6",
      fallbackReason: null,
    });
  });

  it("falls back to GPT-5.4 xhigh when Opus is unavailable", () => {
    const providers = [
      makeProvider({
        provider: "claudeAgent",
        status: "warning",
        models: [
          { slug: "claude-opus-4-6", name: "Claude Opus 4.6", capabilities: capabilities() },
        ],
      }),
      makeProvider({
        provider: "codex",
        models: [{ slug: "gpt-5.4", name: "GPT-5.4", capabilities: capabilities() }],
      }),
    ];

    expect(resolveHybridPlanMergeModel(providers)).toEqual({
      modelSelection: {
        provider: "codex",
        model: "gpt-5.4",
        options: { reasoningEffort: "xhigh" },
      },
      modelLabel: "GPT-5.4",
      fallbackReason: "Claude Opus 4.6 is currently unavailable.",
    });
  });

  it("builds merge prompt for 2 and 3 plans", () => {
    const twoPlanPrompt = buildHybridPlanMergePrompt({
      plans: [
        {
          threadId: ThreadId.makeUnsafe("thread-1"),
          modelLabel: "Claude Opus 4.6",
          planMarkdown: "# A",
        },
        { threadId: ThreadId.makeUnsafe("thread-2"), modelLabel: "GPT-5.4", planMarkdown: "# B" },
      ],
      twoPlanParagraph: "Use this exact paragraph.",
    });
    expect(twoPlanPrompt.startsWith("Use this exact paragraph.")).toBe(true);
    expect(twoPlanPrompt).toContain("## Plan 1 (Claude Opus 4.6)");
    expect(twoPlanPrompt).toContain("## Plan 2 (GPT-5.4)");

    const threePlanPrompt = buildHybridPlanMergePrompt({
      plans: [
        {
          threadId: ThreadId.makeUnsafe("thread-1"),
          modelLabel: "Claude Opus 4.6",
          planMarkdown: "# A",
        },
        { threadId: ThreadId.makeUnsafe("thread-2"), modelLabel: "GPT-5.4", planMarkdown: "# B" },
        {
          threadId: ThreadId.makeUnsafe("thread-3"),
          modelLabel: "Claude Sonnet 4.6",
          planMarkdown: "# C",
        },
      ],
    });
    expect(threePlanPrompt.startsWith("Merge these 3 proposed plans")).toBe(true);
    expect(threePlanPrompt).toContain("## Plan 3 (Claude Sonnet 4.6)");
  });

  it("derives hybrid title from source title and strips suffix", () => {
    expect(buildHybridPlanTitle("Build deploy workflow (Claude Opus 4.6)")).toBe(
      "Improved Build deploy workflow",
    );
    expect(buildHybridPlanTitle("Build parser (v2)")).toBe("Improved Build parser (v2)");
    expect(buildHybridPlanTitle("   ")).toBe("Improved plan");
  });

  it("selects only active source threads to archive after hybrid implementation", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const sourceThread1 = ThreadId.makeUnsafe("thread-source-1");
    const sourceThread2 = ThreadId.makeUnsafe("thread-source-2");
    const sourceThread3 = ThreadId.makeUnsafe("thread-source-3");
    const hybridThread = ThreadId.makeUnsafe("thread-hybrid");

    expect(
      getHybridPlanSourceThreadIdsToArchive({
        hybridOrigin: {
          projectId,
          threadIds: [sourceThread1, sourceThread2, sourceThread1, sourceThread3],
        },
        protectedThreadIds: [hybridThread, sourceThread3],
        threads: [
          { id: sourceThread1, archivedAt: null },
          { id: sourceThread2, archivedAt: "2026-04-07T18:00:00.000Z" },
        ],
      }),
    ).toEqual([sourceThread1]);
  });

  it("archives hybrid source threads and reports failures without aborting", async () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const sourceThread1 = ThreadId.makeUnsafe("thread-source-1");
    const sourceThread2 = ThreadId.makeUnsafe("thread-source-2");
    const dispatchCommand = vi
      .fn()
      .mockResolvedValueOnce({ sequence: 1 })
      .mockRejectedValueOnce(new Error("archive failed"));

    const result = await archiveHybridPlanSourceThreads({
      api: {
        orchestration: {
          dispatchCommand,
        },
      },
      hybridOrigin: {
        projectId,
        threadIds: [sourceThread1, sourceThread2],
      },
      protectedThreadIds: [],
      threads: [
        { id: sourceThread1, archivedAt: null },
        { id: sourceThread2, archivedAt: null },
      ],
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(2);
    expect(dispatchCommand.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        type: "thread.archive",
        threadId: sourceThread1,
      }),
    );
    expect(dispatchCommand.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        type: "thread.archive",
        threadId: sourceThread2,
      }),
    );
    expect(result).toEqual({
      attemptedThreadIds: [sourceThread1, sourceThread2],
      failedThreadIds: [sourceThread2],
    });
  });
});
