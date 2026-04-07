import { describe, expect, it } from "vitest";
import { ThreadId, type ModelCapabilities, type ServerProvider } from "@t3tools/contracts";

import {
  buildHybridPlanMergePrompt,
  buildHybridPlanTitle,
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
        { threadId: ThreadId.makeUnsafe("thread-1"), modelLabel: "Claude Opus 4.6", planMarkdown: "# A" },
        { threadId: ThreadId.makeUnsafe("thread-2"), modelLabel: "GPT-5.4", planMarkdown: "# B" },
      ],
      twoPlanParagraph: "Use this exact paragraph.",
    });
    expect(twoPlanPrompt.startsWith("Use this exact paragraph.")).toBe(true);
    expect(twoPlanPrompt).toContain("## Plan 1 (Claude Opus 4.6)");
    expect(twoPlanPrompt).toContain("## Plan 2 (GPT-5.4)");

    const threePlanPrompt = buildHybridPlanMergePrompt({
      plans: [
        { threadId: ThreadId.makeUnsafe("thread-1"), modelLabel: "Claude Opus 4.6", planMarkdown: "# A" },
        { threadId: ThreadId.makeUnsafe("thread-2"), modelLabel: "GPT-5.4", planMarkdown: "# B" },
        { threadId: ThreadId.makeUnsafe("thread-3"), modelLabel: "Claude Sonnet 4.6", planMarkdown: "# C" },
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
});
