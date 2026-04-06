import { describe, expect, it } from "vitest";
import { type ModelCapabilities, type ServerProvider } from "@t3tools/contracts";

import { buildNewPlanThreadTitle, resolveNewPlanLaunchTargets } from "./newPlanLaunch";
import { formatOutgoingPrompt } from "./outgoingPrompt";

function effort(
  value: string,
  isDefault = false,
): ModelCapabilities["reasoningEffortLevels"][number] {
  return {
    value,
    label: value.toUpperCase(),
    ...(isDefault ? { isDefault: true } : {}),
  };
}

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

describe("newPlanLaunch model resolution", () => {
  it("resolves GPT-5.4 to codex xhigh planning", () => {
    const providers = [
      makeProvider({
        provider: "codex",
        models: [
          {
            slug: "gpt-5.4",
            name: "GPT-5.4",
            capabilities: capabilities({
              reasoningEffortLevels: [
                effort("low"),
                effort("medium"),
                effort("high"),
                effort("xhigh", true),
              ],
            }),
          },
        ],
      }),
    ];

    const targets = resolveNewPlanLaunchTargets({
      prompt: "Build a roadmap planner",
      selectedModels: [{ provider: "codex", model: "gpt-5.4" }],
      providers,
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.modelSelection).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      options: {
        reasoningEffort: "xhigh",
      },
    });
  });

  it("resolves claude planning tiers for opus, sonnet, and haiku", () => {
    const providers = [
      makeProvider({
        provider: "claudeAgent",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Claude Opus 4.6",
            capabilities: capabilities({
              reasoningEffortLevels: [effort("low"), effort("high"), effort("max", true)],
            }),
          },
          {
            slug: "claude-sonnet-4-6",
            name: "Claude Sonnet 4.6",
            capabilities: capabilities({
              reasoningEffortLevels: [effort("low"), effort("high", true), effort("ultrathink")],
              promptInjectedEffortLevels: ["ultrathink"],
            }),
          },
          {
            slug: "claude-haiku-4-5",
            name: "Claude Haiku 4.5",
            capabilities: capabilities({
              supportsThinkingToggle: true,
            }),
          },
        ],
      }),
    ];

    const targets = resolveNewPlanLaunchTargets({
      prompt: "Plan an analytics dashboard",
      selectedModels: [
        { provider: "claudeAgent", model: "claude-opus-4-6" },
        { provider: "claudeAgent", model: "claude-sonnet-4-6" },
        { provider: "claudeAgent", model: "claude-haiku-4-5" },
      ],
      providers,
    });

    expect(targets.map((target) => target.modelSelection)).toEqual([
      {
        provider: "claudeAgent",
        model: "claude-opus-4-6",
        options: { effort: "max" },
      },
      {
        provider: "claudeAgent",
        model: "claude-sonnet-4-6",
        options: { effort: "ultrathink" },
      },
      {
        provider: "claudeAgent",
        model: "claude-haiku-4-5",
        options: { thinking: true },
      },
    ]);

    expect(
      formatOutgoingPrompt({
        providers,
        modelSelection: targets[1]!.modelSelection,
        text: "Build a migration plan",
      }),
    ).toBe("Ultrathink:\nBuild a migration plan");
  });

  it("excludes unavailable or unsupported selected models", () => {
    const providers = [
      makeProvider({
        provider: "codex",
        models: [
          {
            slug: "gpt-5.4",
            name: "GPT-5.4",
            capabilities: capabilities({
              reasoningEffortLevels: [effort("high"), effort("xhigh", true)],
            }),
          },
        ],
      }),
      makeProvider({
        provider: "claudeAgent",
        status: "warning",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Claude Opus 4.6",
            capabilities: capabilities({
              reasoningEffortLevels: [effort("max", true)],
            }),
          },
        ],
      }),
      makeProvider({
        provider: "claudeAgent",
        installed: false,
        models: [
          {
            slug: "claude-sonnet-4-6",
            name: "Claude Sonnet 4.6",
            capabilities: capabilities({
              reasoningEffortLevels: [effort("ultrathink", true)],
              promptInjectedEffortLevels: ["ultrathink"],
            }),
          },
        ],
      }),
    ];

    const targets = resolveNewPlanLaunchTargets({
      prompt: "Build a release checklist",
      selectedModels: [
        { provider: "codex", model: "gpt-5.4" },
        { provider: "claudeAgent", model: "claude-opus-4-6" },
        { provider: "claudeAgent", model: "claude-sonnet-4-6" },
      ],
      providers,
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.modelSelection.provider).toBe("codex");
    expect(targets[0]?.modelSelection.model).toBe("gpt-5.4");
  });

  it("preserves the model suffix when deriving long plan thread titles", () => {
    const title = buildNewPlanThreadTitle(
      "Build a kanban board with offline sync and cross-device conflict resolution",
      "Claude Opus 4.6",
    );

    expect(title.endsWith(" (Claude Opus 4.6)")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(50);
  });
});
