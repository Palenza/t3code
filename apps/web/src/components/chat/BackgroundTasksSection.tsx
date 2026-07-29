import { useEffect, useMemo, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { cn } from "../../lib/utils";
import { deriveLatestContextWindowSnapshot, formatContextWindowTokens } from "../../lib/contextWindow";
import { useProjects, useThreadDetail, useThreadShells } from "../../state/entities";
import { deriveTaskPanelSections } from "./ThreadTasksPanel";

/**
 * « Tâches en arrière-plan » GLOBAL (demande fondateur 29/07, calqué sur le
 * panneau de Claude Code) : tous les fils en train de TRAVAILLER, tous
 * projets confondus — chrono vivant, tokens, nombre d'outils, et les agents
 * du fil en sous-lignes. Cliquer une carte rouvre le fil. Les fils
 * récemment terminés vivent dans une section repliée, comptée.
 */

const DONE_CAP = 20;

function formatElapsed(from: string | null, now: number): string {
  if (from === null) return "…";
  const seconds = Math.max(0, Math.floor((now - Date.parse(from)) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function isWorking(shell: EnvironmentThreadShell): boolean {
  return (
    shell.latestTurn?.state === "running" ||
    shell.session?.status === "running" ||
    shell.session?.status === "starting"
  );
}

/** Une carte de fil en cours — s'abonne à SON détail pour les métriques. */
function RunningTaskCard({ shell, now }: { shell: EnvironmentThreadShell; now: number }) {
  const router = useRouter();
  const ref = useMemo(
    () => scopeThreadRef(shell.environmentId, shell.id),
    [shell.environmentId, shell.id],
  );
  const detail = useThreadDetail(ref);
  const projects = useProjects();
  const projectTitle =
    projects.find(
      (project) => project.environmentId === shell.environmentId && project.id === shell.projectId,
    )?.title ?? null;

  const turnId = shell.latestTurn?.turnId ?? null;
  const { toolCount, tokensLabel, agents } = useMemo(() => {
    const activities = detail?.activities ?? [];
    const turnActivities =
      turnId === null ? activities : activities.filter((activity) => activity.turnId === turnId);
    const sections = deriveTaskPanelSections(turnActivities);
    const contextWindow = deriveLatestContextWindowSnapshot(activities);
    return {
      toolCount: sections.running.length + sections.settled.length,
      tokensLabel:
        contextWindow?.usedTokens != null
          ? formatContextWindowTokens(contextWindow.usedTokens)
          : null,
      // Les agents du CLI (task.*) encore actifs — les sous-lignes de la carte.
      agents: sections.running.filter((entry) => entry.sourceActivityKind === "task.progress"),
    };
  }, [detail?.activities, turnId]);

  return (
    <button
      type="button"
      onClick={() =>
        void router.navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: shell.environmentId, threadId: shell.id },
        })
      }
      className="w-full cursor-pointer rounded-xl bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
    >
      <div className="flex items-center gap-2">
        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{shell.title}</span>
      </div>
      <div className="flex items-center gap-2 pt-1 pl-5.5 text-[11px] tabular-nums text-muted-foreground/70">
        {projectTitle ? <span className="truncate">{projectTitle}</span> : null}
        <span>{formatElapsed(shell.latestTurn?.startedAt ?? null, now)}</span>
        {tokensLabel ? <span>{tokensLabel} tokens</span> : null}
        <span>
          {toolCount} outil{toolCount > 1 ? "s" : ""}
        </span>
      </div>
      {agents.length > 0 ? (
        <div className="pt-1.5 pl-5.5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-1.5 text-[11px] leading-5 text-muted-foreground/60"
            >
              <span className="size-1 shrink-0 rounded-full bg-current" />
              <span className="min-w-0 truncate">{agent.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </button>
  );
}

export function BackgroundTasksSection() {
  const shells = useThreadShells();
  const router = useRouter();
  const [doneOpen, setDoneOpen] = useState(false);

  const { working, done } = useMemo(() => {
    const visible = shells.filter((shell) => shell.archivedAt === null);
    const workingShells = visible
      .filter(isWorking)
      .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const doneShells = visible
      .filter(
        (shell) =>
          !isWorking(shell) &&
          shell.latestTurn !== null &&
          (shell.latestTurn.state === "completed" ||
            shell.latestTurn.state === "error" ||
            shell.latestTurn.state === "interrupted"),
      )
      .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { working: workingShells, done: doneShells };
  }, [shells]);

  // Chrono vivant partagé — ne bat que quand quelque chose tourne.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (working.length === 0) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [working.length]);

  return (
    <div className="flex flex-col gap-1 px-2 pt-2">
      <div className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/60 uppercase">
        En cours
      </div>
      {working.length === 0 ? (
        <p className="px-2 pb-1 text-[12px] text-muted-foreground/50">
          Rien ne tourne en arrière-plan.
        </p>
      ) : (
        working.map((shell) => (
          <RunningTaskCard
            key={`${shell.environmentId}:${shell.id}`}
            shell={shell}
            now={now ?? Date.now()}
          />
        ))
      )}

      <button
        type="button"
        onClick={() => setDoneOpen((open) => !open)}
        className="mt-1 flex cursor-pointer items-center gap-1 px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground/60 uppercase transition-colors hover:text-muted-foreground"
      >
        Terminé <span className="tabular-nums">{done.length}</span>
        <ChevronRightIcon
          className={cn("size-3 transition-transform", doneOpen && "rotate-90")}
        />
      </button>
      {doneOpen
        ? done.slice(0, DONE_CAP).map((shell) => {
            const turn = shell.latestTurn;
            const duration =
              turn?.startedAt && turn.completedAt
                ? formatElapsed(turn.startedAt, Date.parse(turn.completedAt))
                : null;
            return (
              <button
                key={`${shell.environmentId}:${shell.id}`}
                type="button"
                onClick={() =>
                  void router.navigate({
                    to: "/$environmentId/$threadId",
                    params: { environmentId: shell.environmentId, threadId: shell.id },
                  })
                }
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    turn?.state === "error"
                      ? "bg-red-400"
                      : turn?.state === "interrupted"
                        ? "bg-amber-400/80"
                        : "bg-emerald-400/80",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[12px]">{shell.title}</span>
                {duration ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                    {duration}
                  </span>
                ) : null}
              </button>
            );
          })
        : null}
    </div>
  );
}
