import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

import { deriveTaskPanelSections } from "./ThreadTasksPanel";

const activity = (
  overrides: Partial<Omit<OrchestrationThreadActivity, "id">> & { id: string },
): OrchestrationThreadActivity =>
  ({
    tone: "tool",
    kind: "tool.updated",
    summary: "Tool",
    payload: {},
    turnId: null,
    createdAt: "2026-07-28T20:00:00.000Z",
    ...overrides,
  }) as OrchestrationThreadActivity;

describe("deriveTaskPanelSections", () => {
  it("splits running tools from settled ones", () => {
    const sections = deriveTaskPanelSections([
      activity({
        id: "a1",
        summary: "Bash",
        payload: { itemType: "tool", status: "inProgress", detail: "pnpm test" },
      }),
      activity({
        id: "a2",
        kind: "tool.completed",
        summary: "Read file",
        payload: { itemType: "tool", status: "completed" },
        createdAt: "2026-07-28T20:01:00.000Z",
      }),
    ]);
    expect(sections.running.map((entry) => entry.label)).toEqual(["Bash"]);
    expect(sections.settled.map((entry) => entry.label)).toEqual(["Read file"]);
  });

  it("treats agent task progress as running and lists newest settled first", () => {
    const sections = deriveTaskPanelSections([
      activity({
        id: "t1",
        kind: "task.progress",
        tone: "info",
        summary: "Agent running",
        payload: { summary: "Explore the repo" },
      }),
      activity({
        id: "c1",
        kind: "tool.completed",
        summary: "Old tool",
        createdAt: "2026-07-28T19:00:00.000Z",
        payload: { itemType: "tool" },
      }),
      activity({
        id: "c2",
        kind: "tool.completed",
        summary: "New tool",
        createdAt: "2026-07-28T21:00:00.000Z",
        payload: { itemType: "tool" },
      }),
    ]);
    expect(sections.running.map((entry) => entry.label)).toEqual(["Explore the repo"]);
    expect(sections.settled.map((entry) => entry.label)).toEqual(["New tool", "Old tool"]);
  });

  it("returns empty sections for an idle thread", () => {
    expect(deriveTaskPanelSections([])).toEqual({ running: [], settled: [] });
  });
});
