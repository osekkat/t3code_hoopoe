import { describe, expect, it } from "vitest";
import { type ServerProvider } from "@t3tools/contracts";

import { getNewPlanModelOptions } from "./providerModels";

function makeProvider(input: {
  provider: ServerProvider["provider"];
  status?: ServerProvider["status"];
  enabled?: boolean;
  installed?: boolean;
  models: Array<{ slug: string; name: string }>;
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
      capabilities: null,
    })),
  };
}

describe("getNewPlanModelOptions", () => {
  it("includes only ready installed enabled providers while preserving order and deduping", () => {
    const options = getNewPlanModelOptions([
      makeProvider({
        provider: "codex",
        models: [
          { slug: "gpt-5.4", name: "GPT-5.4" },
          { slug: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
        ],
      }),
      makeProvider({
        provider: "claudeAgent",
        status: "warning",
        models: [{ slug: "claude-opus-4-6", name: "Claude Opus 4.6" }],
      }),
      makeProvider({
        provider: "claudeAgent",
        models: [{ slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }],
      }),
      makeProvider({
        provider: "codex",
        installed: false,
        models: [{ slug: "gpt-5.2-codex", name: "GPT-5.2 Codex" }],
      }),
      makeProvider({
        provider: "codex",
        models: [
          { slug: "gpt-5.4", name: "GPT-5.4" },
          { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
        ],
      }),
    ]);

    expect(options).toEqual([
      {
        key: "codex:gpt-5.4",
        provider: "codex",
        providerLabel: "Codex",
        vendor: "OpenAI",
        model: "gpt-5.4",
        name: "GPT-5.4",
      },
      {
        key: "codex:gpt-5.4-mini",
        provider: "codex",
        providerLabel: "Codex",
        vendor: "OpenAI",
        model: "gpt-5.4-mini",
        name: "GPT-5.4 Mini",
      },
      {
        key: "claudeAgent:claude-sonnet-4-6",
        provider: "claudeAgent",
        providerLabel: "Claude",
        vendor: "Anthropic",
        model: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
      },
      {
        key: "codex:gpt-5.3-codex",
        provider: "codex",
        providerLabel: "Codex",
        vendor: "OpenAI",
        model: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
      },
    ]);
  });

  it("returns an empty list when no provider is currently selectable", () => {
    const options = getNewPlanModelOptions([
      makeProvider({
        provider: "codex",
        enabled: false,
        models: [{ slug: "gpt-5.4", name: "GPT-5.4" }],
      }),
      makeProvider({
        provider: "claudeAgent",
        installed: false,
        models: [{ slug: "claude-opus-4-6", name: "Claude Opus 4.6" }],
      }),
    ]);

    expect(options).toEqual([]);
  });
});
