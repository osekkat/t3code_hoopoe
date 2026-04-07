import { AlertCircleIcon, ArrowLeftIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import ChatView from "../components/ChatView";
import { NewPlanScreenLayout } from "../components/new-plan/NewPlanScreenLayout";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { toastManager } from "../components/ui/toast";
import {
  buildHybridPlanMergePrompt,
  buildHybridPlanTitle,
  launchHybridPlanThread,
  resolveHybridPlanMergeModel,
} from "../hybridPlan";
import { useHybridPlanOriginStore } from "../hybridPlanOriginStore";
import { cn } from "../lib/utils";
import { parseNewPlanCompareRouteSearch } from "../newPlanRouteSearch";
import { readNativeApi } from "../nativeApi";
import { usePlanComparisonStore, type PlanComparisonPaneDescriptor } from "../planComparisonStore";
import { useServerProviders } from "../rpc/serverState";
import { findLatestProposedPlan } from "../session-logic";
import { useStore } from "../store";
import { useProjectById, useThreadById } from "../storeSelectors";

function getComparisonGridClassName(paneCount: number): string {
  if (paneCount >= 3) {
    return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  }
  if (paneCount === 2) {
    return "grid-cols-1 md:grid-cols-2";
  }
  return "grid-cols-1";
}

function PlanComparisonThreadPane(props: {
  pane: PlanComparisonPaneDescriptor;
  loadingLabel: string;
}) {
  const thread = useThreadById(props.pane.threadId);

  if (!thread) {
    return (
      <div
        className="flex h-full min-h-[32rem] flex-col rounded-3xl border border-border/80 bg-card/60 p-6"
        data-testid="plan-compare-loading-pane"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" />
          <span>{props.loadingLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-3xl border border-border/80 bg-background shadow-[0_20px_60px_-36px_color-mix(in_srgb,var(--foreground)_18%,transparent)]"
      data-testid="plan-compare-chat-pane"
    >
      <ChatView threadId={thread.id} viewMode="comparison" />
    </div>
  );
}

function PlanComparisonErrorPane(props: { pane: PlanComparisonPaneDescriptor }) {
  return (
    <Alert
      variant="error"
      className="flex h-full min-h-[32rem] content-start flex-col rounded-3xl p-6"
      data-testid="plan-compare-error-pane"
    >
      <AlertCircleIcon />
      <AlertTitle>{props.pane.modelName || "Plan launch failed"}</AlertTitle>
      <AlertDescription>{props.pane.error ?? "Unable to start this plan thread."}</AlertDescription>
    </Alert>
  );
}

function NewPlanCompareRouteView() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const providers = useServerProviders();
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const threads = useStore((store) => store.threads);
  const setHybridOrigin = useHybridPlanOriginStore((store) => store.setOrigin);
  const projectId = search.projectId ?? null;
  const project = useProjectById(projectId);
  const comparisonRun = usePlanComparisonStore((store) =>
    search.runId ? (store.runsById[search.runId] ?? null) : null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLaunchingHybrid, setIsLaunchingHybrid] = useState(false);
  const panes = useMemo<PlanComparisonPaneDescriptor[]>(() => {
    if (comparisonRun && comparisonRun.projectId === projectId) {
      return comparisonRun.panes;
    }
    return (search.threadIds ?? []).map((threadId) => ({
      provider: "codex",
      providerLabel: "",
      model: "",
      modelName: "",
      threadId,
      state: "ready",
      error: null,
    }));
  }, [comparisonRun, projectId, search.threadIds]);

  const eligiblePanes = useMemo(() => {
    const threadsById = new Map(threads.map((thread) => [thread.id, thread] as const));
    return panes.flatMap((pane) => {
      if (pane.state !== "ready" || !pane.threadId) {
        return [];
      }
      const thread = threadsById.get(pane.threadId);
      if (!thread) {
        return [];
      }
      const latestProposedPlan = findLatestProposedPlan(
        thread.proposedPlans,
        thread.latestTurn?.turnId ?? null,
      );
      if (!latestProposedPlan) {
        return [];
      }
      return [
        {
          pane,
          thread,
          latestProposedPlan,
        },
      ];
    });
  }, [panes, threads]);

  const mergeModel = useMemo(() => resolveHybridPlanMergeModel(providers), [providers]);

  const handleCreateHybridPlan = useCallback(async () => {
    if (!projectId || eligiblePanes.length < 2) {
      return;
    }
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Planning is unavailable",
        description: "The native API is not connected.",
      });
      return;
    }
    const resolvedMergeModel = resolveHybridPlanMergeModel(providers);
    if (!resolvedMergeModel) {
      toastManager.add({
        type: "error",
        title: "No merge model available",
        description: "Claude Opus 4.6 and GPT-5.4 are both unavailable right now.",
      });
      return;
    }

    const sourcePlans = eligiblePanes.slice(0, 3).map((entry) => ({
      threadId: entry.thread.id,
      modelLabel: entry.pane.modelName || entry.thread.modelSelection.model,
      planMarkdown: entry.latestProposedPlan.planMarkdown,
    }));

    setIsLaunchingHybrid(true);
    try {
      const threadId = await launchHybridPlanThread({
        api,
        projectId,
        title: buildHybridPlanTitle(eligiblePanes[0]?.thread.title ?? null),
        prompt: buildHybridPlanMergePrompt({ plans: sourcePlans }),
        providers,
        modelSelection: resolvedMergeModel.modelSelection,
      });

      setHybridOrigin(threadId, {
        runId: search.runId,
        projectId,
        threadIds: sourcePlans.map((plan) => plan.threadId),
      });

      await navigate({
        to: "/$threadId",
        params: { threadId },
        search: {
          comparisonProjectId: projectId,
          comparisonRunId: search.runId,
          comparisonThreadIds: sourcePlans.map((plan) => plan.threadId),
        },
      });
      setConfirmOpen(false);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not create hybrid plan",
        description:
          error instanceof Error ? error.message : "An error occurred while launching the hybrid.",
      });
    } finally {
      setIsLaunchingHybrid(false);
    }
  }, [eligiblePanes, navigate, projectId, providers, search.runId, setHybridOrigin]);

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }
    if (!projectId || !project) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, project, projectId]);

  if (!bootstrapComplete || !projectId || !project) {
    return null;
  }

  return (
    <NewPlanScreenLayout title="Plan comparison">
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-col overflow-hidden px-4 py-6 sm:px-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Plan comparison
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Review planning threads side by side. Each pane keeps the model and planning mode
                pinned to the original launch configuration.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 px-2 text-muted-foreground/80 hover:text-foreground"
                onClick={() =>
                  void navigate({
                    to: "/new-plan/configure",
                    search: { projectId },
                  })
                }
              >
                <ArrowLeftIcon className="size-4" />
                Back
              </Button>
              {eligiblePanes.length >= 2 ? (
                <Button
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  data-testid="plan-compare-improve-button"
                >
                  <SparklesIcon className="size-4" />
                  Improve plan
                </Button>
              ) : null}
            </div>
          </div>

          {panes.length === 0 ? (
            <Alert variant="warning" className="mx-auto mt-6 max-w-3xl">
              <AlertCircleIcon />
              <AlertTitle>No comparison panes available</AlertTitle>
              <AlertDescription>
                Start a new plan from the configure screen to launch one or more planning threads.
              </AlertDescription>
            </Alert>
          ) : (
            <div
              className={cn(
                "grid min-h-0 flex-1 auto-rows-fr gap-4 overflow-hidden",
                getComparisonGridClassName(panes.length),
              )}
              data-testid="plan-compare-grid"
            >
              {panes.map((pane) => (
                <div
                  key={pane.threadId ?? `${pane.provider}:${pane.model}:${pane.state}`}
                  className="min-h-0 overflow-hidden"
                  data-testid="plan-compare-item"
                >
                  {pane.state === "error" ? (
                    <PlanComparisonErrorPane pane={pane} />
                  ) : pane.threadId ? (
                    <PlanComparisonThreadPane
                      pane={pane}
                      loadingLabel={`Starting ${pane.modelName || "planning"} thread...`}
                    />
                  ) : (
                    <PlanComparisonErrorPane
                      pane={{
                        ...pane,
                        error: pane.error ?? "This planning thread did not start correctly.",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogPopup className="max-w-xl" data-testid="plan-compare-improve-modal">
          <DialogHeader>
            <DialogTitle>Create a hybrid plan?</DialogTitle>
            <DialogDescription>
              T3 Code will combine the visible ready plans into one best-of-all-worlds hybrid plan.
              The merge model is <strong>{mergeModel?.modelLabel ?? "unavailable"}</strong>
              {mergeModel?.fallbackReason ? ` (${mergeModel.fallbackReason})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="text-sm text-muted-foreground">
            This uses the latest proposed plan from each ready pane and keeps your current pane
            order.
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isLaunchingHybrid}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleCreateHybridPlan()} disabled={isLaunchingHybrid}>
              Create hybrid plan
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </NewPlanScreenLayout>
  );
}

export const Route = createFileRoute("/_chat/new-plan/compare")({
  validateSearch: (search) => parseNewPlanCompareRouteSearch(search),
  beforeLoad: ({ search }) => {
    if (!search.projectId) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: NewPlanCompareRouteView,
});
