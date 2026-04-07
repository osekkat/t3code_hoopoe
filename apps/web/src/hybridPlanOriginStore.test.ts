import { ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { useHybridPlanOriginStore } from "./hybridPlanOriginStore";

function resetHybridPlanOriginStore() {
  useHybridPlanOriginStore.setState({ originsByHybridThreadId: {} });
}

describe("hybridPlanOriginStore", () => {
  beforeEach(() => {
    resetHybridPlanOriginStore();
  });

  it("does not rewrite an identical origin entry", () => {
    const hybridThreadId = ThreadId.makeUnsafe("hybrid-thread");
    const sourceThreadIds = [
      ThreadId.makeUnsafe("source-thread-1"),
      ThreadId.makeUnsafe("source-thread-2"),
    ];
    const projectId = ProjectId.makeUnsafe("project-1");

    useHybridPlanOriginStore.getState().setOrigin(hybridThreadId, {
      projectId,
      threadIds: sourceThreadIds,
    });

    const initialOrigins = useHybridPlanOriginStore.getState().originsByHybridThreadId;

    useHybridPlanOriginStore.getState().setOrigin(hybridThreadId, {
      projectId,
      threadIds: [...sourceThreadIds],
    });

    expect(useHybridPlanOriginStore.getState().originsByHybridThreadId).toBe(initialOrigins);
  });

  it("updates the entry when the origin changes", () => {
    const hybridThreadId = ThreadId.makeUnsafe("hybrid-thread");
    const projectId = ProjectId.makeUnsafe("project-1");

    useHybridPlanOriginStore.getState().setOrigin(hybridThreadId, {
      projectId,
      threadIds: [ThreadId.makeUnsafe("source-thread-1")],
    });

    const initialOrigins = useHybridPlanOriginStore.getState().originsByHybridThreadId;

    useHybridPlanOriginStore.getState().setOrigin(hybridThreadId, {
      projectId,
      runId: "run-2",
      threadIds: [ThreadId.makeUnsafe("source-thread-1"), ThreadId.makeUnsafe("source-thread-2")],
    });

    const nextOrigins = useHybridPlanOriginStore.getState().originsByHybridThreadId;
    expect(nextOrigins).not.toBe(initialOrigins);
    expect(nextOrigins[hybridThreadId]).toEqual({
      projectId,
      runId: "run-2",
      threadIds: [ThreadId.makeUnsafe("source-thread-1"), ThreadId.makeUnsafe("source-thread-2")],
    });
  });
});
