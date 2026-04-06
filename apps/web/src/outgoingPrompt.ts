import {
  type ClaudeCodeEffort,
  type ModelSelection,
  type ServerProvider,
} from "@t3tools/contracts";
import { applyClaudePromptEffortPrefix } from "@t3tools/shared/model";

import { getProviderModelCapabilities, getProviderModels } from "./providerModels";

export function formatOutgoingPrompt(input: {
  providers: ReadonlyArray<ServerProvider>;
  modelSelection: ModelSelection;
  text: string;
}): string {
  if (input.modelSelection.provider !== "claudeAgent") {
    return input.text;
  }

  const caps = getProviderModelCapabilities(
    getProviderModels(input.providers, input.modelSelection.provider),
    input.modelSelection.model,
    input.modelSelection.provider,
  );
  const effort = input.modelSelection.options?.effort ?? null;
  if (effort && caps.promptInjectedEffortLevels.includes(effort)) {
    return applyClaudePromptEffortPrefix(input.text, effort as ClaudeCodeEffort | null);
  }
  return input.text;
}
