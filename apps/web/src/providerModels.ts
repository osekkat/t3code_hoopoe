import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelCapabilities,
  type ProviderKind,
  PROVIDER_DISPLAY_NAMES,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { normalizeModelSlug } from "@t3tools/shared/model";

const EMPTY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};
const MODEL_VENDOR_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "OpenAI",
  claudeAgent: "Anthropic",
};

export interface NewPlanModelOption {
  key: string;
  provider: ProviderKind;
  providerLabel: string;
  vendor: string;
  model: string;
  name: string;
}

export function getProviderModels(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind,
): ReadonlyArray<ServerProviderModel> {
  return providers.find((candidate) => candidate.provider === provider)?.models ?? [];
}

export function getProviderSnapshot(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind,
): ServerProvider | undefined {
  return providers.find((candidate) => candidate.provider === provider);
}

export function getProviderModelSnapshot(
  models: ReadonlyArray<ServerProviderModel>,
  model: string | null | undefined,
  provider: ProviderKind,
): ServerProviderModel | undefined {
  const slug = normalizeModelSlug(model, provider);
  return models.find((candidate) => candidate.slug === slug);
}

export function isProviderEnabled(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind,
): boolean {
  return getProviderSnapshot(providers, provider)?.enabled ?? true;
}

export function resolveSelectableProvider(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind | null | undefined,
): ProviderKind {
  const requested = provider ?? "codex";
  if (isProviderEnabled(providers, requested)) {
    return requested;
  }
  return providers.find((candidate) => candidate.enabled)?.provider ?? requested;
}

export function getProviderModelCapabilities(
  models: ReadonlyArray<ServerProviderModel>,
  model: string | null | undefined,
  provider: ProviderKind,
): ModelCapabilities {
  return getProviderModelSnapshot(models, model, provider)?.capabilities ?? EMPTY_CAPABILITIES;
}

export function getProviderModelName(
  models: ReadonlyArray<ServerProviderModel>,
  model: string | null | undefined,
  provider: ProviderKind,
): string {
  const snapshot = getProviderModelSnapshot(models, model, provider);
  return (
    snapshot?.name ?? normalizeModelSlug(model, provider) ?? DEFAULT_MODEL_BY_PROVIDER[provider]
  );
}

export function getDefaultServerModel(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind,
): string {
  const models = getProviderModels(providers, provider);
  return (
    models.find((model) => !model.isCustom)?.slug ??
    models[0]?.slug ??
    DEFAULT_MODEL_BY_PROVIDER[provider]
  );
}

export function buildNewPlanModelOptionKey(input: {
  provider: ProviderKind;
  model: string;
}): string {
  return `${input.provider}:${input.model}`;
}

export function getNewPlanModelOptions(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<NewPlanModelOption> {
  const seen = new Set<string>();
  const options: NewPlanModelOption[] = [];

  for (const providerSnapshot of providers) {
    if (
      !providerSnapshot.enabled ||
      !providerSnapshot.installed ||
      providerSnapshot.status !== "ready"
    ) {
      continue;
    }

    for (const model of providerSnapshot.models) {
      const key = buildNewPlanModelOptionKey({
        provider: providerSnapshot.provider,
        model: model.slug,
      });
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push({
        key,
        provider: providerSnapshot.provider,
        providerLabel: PROVIDER_DISPLAY_NAMES[providerSnapshot.provider],
        vendor: MODEL_VENDOR_BY_PROVIDER[providerSnapshot.provider],
        model: model.slug,
        name: model.name,
      });
    }
  }

  return options;
}
