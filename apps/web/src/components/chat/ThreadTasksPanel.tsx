import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { deriveWorkLogEntries, type WorkLogEntry } from "../../session-logic";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { ScrollArea } from "../ui/scroll-area";
import { Spinner } from "../ui/spinner";

/**
 * Right-panel surface listing what the thread's agent is doing right now —
 * every tool and sub-task with its state — and what it has already done.
 *
 * The rows are the same `deriveWorkLogEntries` projection the timeline uses:
 * one source of truth for "what ran", so this panel can never disagree with
 * the transcript. A row is "running" when its lifecycle status says so, not
 * when the panel guesses.
 */

const isRunningEntry = (entry: WorkLogEntry): boolean =>
  entry.toolLifecycleStatus === "inProgress" || entry.sourceActivityKind === "task.progress";

const SETTLED_ROWS_CAP = 100;

export function deriveTaskPanelSections(activities: ReadonlyArray<OrchestrationThreadActivity>): {
  running: WorkLogEntry[];
  settled: WorkLogEntry[];
} {
  const entries = deriveWorkLogEntries(activities);
  const running: WorkLogEntry[] = [];
  const settled: WorkLogEntry[] = [];
  for (const entry of entries) {
    (isRunningEntry(entry) ? running : settled).push(entry);
  }
  settled.reverse();
  return { running, settled: settled.slice(0, SETTLED_ROWS_CAP) };
}

const formatElapsed = (startedAtIso: string, now: number): string | null => {
  const startedAt = Date.parse(startedAtIso);
  if (Number.isNaN(startedAt)) {
    return null;
  }
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const STATUS_DOT: Record<string, string> = {
  completed: "bg-muted-foreground/50",
  failed: "bg-destructive",
  declined: "bg-warning",
  stopped: "bg-warning",
};

function TaskRow({ entry, now }: { entry: WorkLogEntry; now: number | null }) {
  const running = isRunningEntry(entry);
  const command = entry.command ?? entry.rawCommand;
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40">
      <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
        {running ? (
          <Spinner className="size-3 text-muted-foreground" aria-label="Running" />
        ) : (
          <span
            className={cn(
              "size-1.5 rounded-full",
              (entry.toolLifecycleStatus && STATUS_DOT[entry.toolLifecycleStatus]) ??
                (entry.tone === "error" ? "bg-destructive" : "bg-muted-foreground/50"),
            )}
            aria-hidden="true"
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-[13px] leading-5",
              running ? "text-foreground" : "text-muted-foreground/90",
              entry.tone === "error" && "text-destructive",
            )}
          >
            {entry.label}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
            {running && now !== null
              ? formatElapsed(entry.createdAt, now)
              : formatRelativeTimeLabel(entry.createdAt)}
          </span>
        </div>
        {command ? (
          <div className="truncate font-mono text-[11px] leading-4 text-muted-foreground/60">
            {command}
          </div>
        ) : entry.detail ? (
          <div className="line-clamp-2 text-[11px] leading-4 text-muted-foreground/60">
            {entry.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/60 uppercase">
      {children}
    </div>
  );
}

export function ThreadTasksPanel({
  activities,
}: {
  activities: ReadonlyArray<OrchestrationThreadActivity>;
}) {
  const { running, settled } = useMemo(() => deriveTaskPanelSections(activities), [activities]);

  // The elapsed labels of running rows are live; a dead clock under a spinner
  // would read as a hang. Ticks only while something actually runs.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (running.length === 0) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [running.length]);

  if (running.length === 0 && settled.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <p className="max-w-56 text-center text-[13px] leading-[1.45] text-muted-foreground/70">
          Tools and agents run by this thread will appear here, with their live status.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-0.5 p-2">
        {running.length > 0 ? (
          <>
            <SectionHeader>Running · {running.length}</SectionHeader>
            {running.map((entry) => (
              <TaskRow key={entry.id} entry={entry} now={now} />
            ))}
          </>
        ) : null}
        {settled.length > 0 ? (
          <>
            <SectionHeader>Done</SectionHeader>
            {settled.map((entry) => (
              <TaskRow key={entry.id} entry={entry} now={now} />
            ))}
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}
