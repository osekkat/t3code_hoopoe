import { ArrowRightIcon, ClipboardListIcon, Layers3Icon, SparklesIcon } from "lucide-react";
import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { NewPlanScreenLayout } from "../components/new-plan/NewPlanScreenLayout";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { parseNewPlanRouteSearch } from "../newPlanRouteSearch";
import { useStore } from "../store";
import { useProjectById } from "../storeSelectors";

function NewPlanIntroRouteView() {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = Route.useSearch();
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const projectId = search.projectId ?? null;
  const project = useProjectById(projectId);

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }
    if (!projectId || !project) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, project, projectId]);

  if (pathname !== "/new-plan") {
    return <Outlet />;
  }

  if (!bootstrapComplete || !projectId || !project) {
    return null;
  }

  return (
    <NewPlanScreenLayout title="New plan">
      <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(34rem_16rem_at_top,color-mix(in_srgb,var(--color-blue-500)_14%,transparent),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_96%,var(--color-black))_0%,var(--background)_60%)]" />
        </div>

        <section className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <div className="flex size-28 items-center justify-center rounded-[2rem] border border-blue-400/25 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-blue-500)_88%,white_12%)_0%,color-mix(in_srgb,var(--color-blue-600)_90%,black_10%)_100%)] shadow-[0_24px_80px_-28px_color-mix(in_srgb,var(--color-blue-500)_60%,transparent)]">
            <ClipboardListIcon className="size-12 text-white" strokeWidth={2.2} />
          </div>

          <h1 className="mt-10 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Start a new comprehensive plan
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-lg leading-8 text-muted-foreground sm:text-xl">
            Create a detailed plan with multiple AI models working in parallel. Compare approaches
            and pick the best strategy.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Badge
              variant="outline"
              size="lg"
              className="rounded-full border-border/80 bg-background/60 px-3.5 text-sm text-muted-foreground"
            >
              <Layers3Icon className="size-4" />
              Multi-model
            </Badge>
            <Badge
              variant="outline"
              size="lg"
              className="rounded-full border-border/80 bg-background/60 px-3.5 text-sm text-muted-foreground"
            >
              <SparklesIcon className="size-4" />
              Parallel generation
            </Badge>
          </div>

          <Button
            size="xl"
            className="mt-12 rounded-2xl px-8"
            onClick={() =>
              void navigate({
                to: "/new-plan/configure",
                search: { projectId },
              })
            }
          >
            Start planning
            <ArrowRightIcon className="size-5" />
          </Button>
        </section>
      </div>
    </NewPlanScreenLayout>
  );
}

export const Route = createFileRoute("/_chat/new-plan")({
  validateSearch: (search) => parseNewPlanRouteSearch(search),
  beforeLoad: ({ search }) => {
    if (!search.projectId) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: NewPlanIntroRouteView,
});
