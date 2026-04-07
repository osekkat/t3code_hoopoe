import { ProjectId, ThreadId, TurnId } from "@t3tools/contracts";

export interface DiffRouteSearch {
  diff?: "1" | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
  comparisonProjectId?: ProjectId | undefined;
  comparisonRunId?: string | undefined;
  comparisonThreadIds?: ThreadId[] | undefined;
}

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
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

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "diff" | "diffTurnId" | "diffFilePath"> {
  const { diff: _diff, diffTurnId: _diffTurnId, diffFilePath: _diffFilePath, ...rest } = params;
  return rest as Omit<T, "diff" | "diffTurnId" | "diffFilePath">;
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const diff = isDiffOpenValue(search.diff) ? "1" : undefined;
  const diffTurnIdRaw = diff ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.makeUnsafe(diffTurnIdRaw) : undefined;
  const diffFilePath = diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;
  const comparisonProjectIdRaw = normalizeSearchString(search.comparisonProjectId);
  const comparisonProjectId = comparisonProjectIdRaw
    ? ProjectId.makeUnsafe(comparisonProjectIdRaw)
    : undefined;
  const comparisonRunId = normalizeSearchString(search.comparisonRunId);
  const comparisonThreadIds = normalizeSearchStringList(search.comparisonThreadIds).map(
    (threadId) => ThreadId.makeUnsafe(threadId),
  );

  return {
    ...(diff ? { diff } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
    ...(comparisonProjectId ? { comparisonProjectId } : {}),
    ...(comparisonRunId ? { comparisonRunId } : {}),
    ...(comparisonThreadIds.length > 0 ? { comparisonThreadIds } : {}),
  };
}
