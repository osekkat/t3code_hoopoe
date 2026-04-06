import { ProjectId, ThreadId } from "@t3tools/contracts";

export interface NewPlanRouteSearch {
  projectId?: ProjectId | undefined;
}

export interface NewPlanCompareRouteSearch extends NewPlanRouteSearch {
  runId?: string | undefined;
  threadIds?: ThreadId[] | undefined;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function parseNewPlanRouteSearch(search: Record<string, unknown>): NewPlanRouteSearch {
  const projectIdRaw = normalizeSearchString(search.projectId);
  const projectId = projectIdRaw ? ProjectId.makeUnsafe(projectIdRaw) : undefined;

  return projectId ? { projectId } : {};
}

function normalizeSearchStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const normalized = normalizeSearchString(entry);
      return normalized ? [normalized] : [];
    });
  }

  const normalized = normalizeSearchString(value);
  return normalized ? [normalized] : [];
}

export function parseNewPlanCompareRouteSearch(
  search: Record<string, unknown>,
): NewPlanCompareRouteSearch {
  const base = parseNewPlanRouteSearch(search);
  const runId = normalizeSearchString(search.runId);
  const threadIds = normalizeSearchStringList(search.threadIds).map((threadId) =>
    ThreadId.makeUnsafe(threadId),
  );

  return {
    ...base,
    ...(runId ? { runId } : {}),
    ...(threadIds.length > 0 ? { threadIds } : {}),
  };
}
