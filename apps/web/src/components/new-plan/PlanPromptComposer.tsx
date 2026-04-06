import { ArrowUpIcon } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

import { ComposerPromptEditor, type ComposerPromptEditorHandle } from "../ComposerPromptEditor";
import { Button } from "../ui/button";

export function PlanPromptComposer(props: {
  prompt: string;
  cursor: number;
  selectedModelCount: number;
  canSubmit: boolean;
  submitting: boolean;
  onPromptChange: (nextPrompt: string, nextCursor: number) => void;
  onSubmit: () => void;
}) {
  const { prompt, cursor, selectedModelCount, canSubmit, submitting, onPromptChange, onSubmit } =
    props;
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const selectedModelLabel = useMemo(() => {
    const noun = selectedModelCount === 1 ? "model" : "models";
    return `${selectedModelCount} ${noun} selected`;
  }, [selectedModelCount]);

  const handleCommandKeyDown = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab") => {
      if (key !== "Enter") {
        return false;
      }
      if (canSubmit && !submitting) {
        onSubmit();
      }
      return true;
    },
    [canSubmit, onSubmit, submitting],
  );
  const handlePaste = useCallback(() => undefined, []);
  const handleRemoveTerminalContext = useCallback(() => undefined, []);

  return (
    <form
      className="mx-auto w-full min-w-0 max-w-[52rem]"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !submitting) {
          onSubmit();
        }
      }}
    >
      <div className="group rounded-[22px] p-px transition-colors duration-200">
        <div className="rounded-[20px] border border-border bg-card transition-colors duration-200 has-focus-visible:border-ring/45">
          <div className="relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4">
            <ComposerPromptEditor
              ref={editorRef}
              value={prompt}
              cursor={cursor}
              terminalContexts={[]}
              disabled={false}
              placeholder="Describe what you want to build..."
              onRemoveTerminalContext={handleRemoveTerminalContext}
              onChange={(nextValue, nextCursor) => onPromptChange(nextValue, nextCursor)}
              onCommandKeyDown={handleCommandKeyDown}
              onPaste={handlePaste}
            />
          </div>

          <div
            className="flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-hidden px-2.5 pb-2.5 sm:px-3 sm:pb-3"
            data-testid="plan-prompt-composer-footer"
          >
            <span
              className="min-w-0 truncate text-xs text-muted-foreground/70"
              data-testid="plan-model-selection-count"
            >
              {selectedModelLabel}
            </span>

            <div className="flex shrink-0 items-center justify-end gap-2">
              <Button
                size="icon-sm"
                type="submit"
                disabled={!canSubmit || submitting}
                aria-label={submitting ? "Starting plan comparison" : "Start planning"}
                title={submitting ? "Starting plan comparison" : "Start planning"}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
