import { AlertCircleIcon, ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import ChatView from "../components/ChatView";
import { NewPlanScreenLayout } from "../components/new-plan/NewPlanScreenLayout";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { parseNewPlanCompareRouteSearch } from "../newPlanRouteSearch";
import { usePlanComparisonStore, type PlanComparisonPaneDescriptor } from "../planComparisonStore";
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
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const projectId = search.projectId ?? null;
  const project = useProjectById(projectId);
  const comparisonRun = usePlanComparisonStore((store) =>
    search.runId ? (store.runsById[search.runId] ?? null) : null,
  );
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
