import { AlertCircleIcon, ArrowLeftIcon, CheckCircle2Icon, CircleIcon } from "lucide-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PlanPromptComposer } from "../components/new-plan/PlanPromptComposer";
import { NewPlanScreenLayout } from "../components/new-plan/NewPlanScreenLayout";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { launchNewPlanComparison } from "../newPlanLaunch";
import { parseNewPlanRouteSearch } from "../newPlanRouteSearch";
import { readNativeApi } from "../nativeApi";
import { usePlanComparisonStore } from "../planComparisonStore";
import {
  MAX_PLAN_DRAFT_MODELS,
  buildPlanModelSelectionKey,
  type PlanDraftModelSelection,
  usePlanDraftStore,
} from "../planDraftStore";
import {
  buildNewPlanModelOptionKey,
  getNewPlanModelOptions,
  type NewPlanModelOption,
} from "../providerModels";
import { useServerProviders } from "../rpc/serverState";
import { useStore } from "../store";
import { useProjectById } from "../storeSelectors";
import { cn } from "../lib/utils";

const EMPTY_SELECTED_MODELS: ReadonlyArray<PlanDraftModelSelection> = [];

function NewPlanConfigureRouteView() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const providers = useServerProviders();
  const projectId = search.projectId ?? null;
  const project = useProjectById(projectId);
  const draft = usePlanDraftStore((store) =>
    projectId ? (store.draftsByProjectId[projectId] ?? null) : null,
  );
  const setPrompt = usePlanDraftStore((store) => store.setPrompt);
  const toggleModelSelection = usePlanDraftStore((store) => store.toggleModelSelection);
  const replaceSelectedModels = usePlanDraftStore((store) => store.replaceSelectedModels);
  const clearDraft = usePlanDraftStore((store) => store.clearDraft);
  const setComparisonRun = usePlanComparisonStore((store) => store.setRun);
  const prompt = draft?.prompt ?? "";
  const cursor = draft?.cursor ?? 0;
  const selectedModels = draft?.selectedModels ?? EMPTY_SELECTED_MODELS;
  const [launchErrors, setLaunchErrors] = useState<string[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const selectableModels = useMemo(() => getNewPlanModelOptions(providers), [providers]);
  const selectableModelKeys = useMemo(
    () => new Set(selectableModels.map((model) => model.key)),
    [selectableModels],
  );
  const selectedModelKeys = useMemo(
    () => new Set(selectedModels.map((selection) => buildPlanModelSelectionKey(selection))),
    [selectedModels],
  );
  const hasReachedSelectionLimit = selectedModels.length >= MAX_PLAN_DRAFT_MODELS;
  const canSubmit = prompt.trim().length > 0 && selectedModels.length > 0 && !isLaunching;

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }
    if (!projectId || !project) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, project, projectId]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const visibleSelections = selectedModels.filter((selection) =>
      selectableModelKeys.has(buildPlanModelSelectionKey(selection)),
    );
    if (visibleSelections.length === selectedModels.length) {
      return;
    }
    replaceSelectedModels(projectId, visibleSelections);
  }, [projectId, replaceSelectedModels, selectableModelKeys, selectedModels]);

  const handlePromptChange = useCallback(
    (nextPrompt: string, nextCursor: number) => {
      if (!projectId) {
        return;
      }
      setLaunchErrors([]);
      setPrompt(projectId, nextPrompt, nextCursor);
    },
    [projectId, setPrompt],
  );

  const handleToggleModel = useCallback(
    (model: NewPlanModelOption) => {
      if (!projectId || isLaunching) {
        return;
      }
      setLaunchErrors([]);
      toggleModelSelection(projectId, {
        provider: model.provider,
        model: model.model,
      });
    },
    [isLaunching, projectId, toggleModelSelection],
  );

  const handleSubmit = useCallback(async () => {
    if (!projectId || !project || isLaunching) {
      return;
    }
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0 || selectedModels.length === 0) {
      return;
    }
    const api = readNativeApi();
    if (!api) {
      setLaunchErrors(["Planning is unavailable because the native API is not connected."]);
      return;
    }

    setLaunchErrors([]);
    setIsLaunching(true);

    try {
      const result = await launchNewPlanComparison({
        api,
        projectId,
        prompt: trimmedPrompt,
        selectedModels,
        providers,
      });

      if (result.successfulThreadIds.length === 0) {
        setLaunchErrors(
          result.panes.flatMap((pane) => (pane.error ? [pane.error] : [])) || [
            "Unable to start plan comparison.",
          ],
        );
        return;
      }

      setComparisonRun(result.runId, {
        projectId,
        panes: result.panes,
      });
      clearDraft(projectId);
      await navigate({
        to: "/new-plan/compare",
        search: {
          projectId,
          runId: result.runId,
          threadIds: result.successfulThreadIds,
        },
      });
    } catch (error) {
      setLaunchErrors([
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unable to start plan comparison.",
      ]);
    } finally {
      setIsLaunching(false);
    }
  }, [
    clearDraft,
    isLaunching,
    navigate,
    project,
    projectId,
    prompt,
    providers,
    selectedModels,
    setComparisonRun,
  ]);

  if (!bootstrapComplete || !projectId || !project) {
    return null;
  }

  return (
    <NewPlanScreenLayout title="New plan">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6">
        <div className="flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-5 px-2 text-muted-foreground/80 hover:text-foreground"
            onClick={() =>
              void navigate({
                to: "/new-plan",
                search: { projectId },
              })
            }
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>

          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Select AI Models
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Choose which models will generate plans in parallel (max {MAX_PLAN_DRAFT_MODELS}).
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectableModels.map((model) => {
              const isSelected = selectedModelKeys.has(
                buildNewPlanModelOptionKey({
                  provider: model.provider,
                  model: model.model,
                }),
              );
              const isDisabled = !isSelected && hasReachedSelectionLimit;

              return (
                <button
                  key={model.key}
                  type="button"
                  data-testid={`plan-model-card-${model.provider}-${model.model}`}
                  aria-pressed={isSelected}
                  disabled={isDisabled || isLaunching}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors",
                    isSelected
                      ? "border-primary/65 bg-primary/10 shadow-[0_18px_44px_-30px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
                      : "border-border/80 bg-card hover:border-border hover:bg-accent/30",
                    isDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                  )}
                  onClick={() => handleToggleModel(model)}
                >
                  <span className="mt-0.5 shrink-0 text-primary/90">
                    {isSelected ? (
                      <CheckCircle2Icon className="size-5" />
                    ) : (
                      <CircleIcon className="size-5 text-muted-foreground/55" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground sm:text-base">
                      {model.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground/75 sm:text-sm">
                      {model.vendor}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {launchErrors.length > 0 ? (
            <Alert variant="error" className="mx-auto mt-8 max-w-3xl">
              <AlertCircleIcon />
              <AlertTitle>Unable to start plan comparison</AlertTitle>
              <AlertDescription>
                {launchErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          {selectableModels.length === 0 ? (
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-dashed border-border/80 bg-card/40 px-5 py-6 text-center text-sm text-muted-foreground">
              No supported planning models are available right now.
            </div>
          ) : null}
        </div>

        <div className="mt-8 pb-2 sm:pb-4">
          <PlanPromptComposer
            prompt={prompt}
            cursor={cursor}
            selectedModelCount={selectedModels.length}
            canSubmit={canSubmit}
            submitting={isLaunching}
            onPromptChange={handlePromptChange}
            onSubmit={() => {
              void handleSubmit();
            }}
          />
        </div>
      </div>
    </NewPlanScreenLayout>
  );
}

export const Route = createFileRoute("/_chat/new-plan/configure")({
  validateSearch: (search) => parseNewPlanRouteSearch(search),
  beforeLoad: ({ search }) => {
    if (!search.projectId) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: NewPlanConfigureRouteView,
});
