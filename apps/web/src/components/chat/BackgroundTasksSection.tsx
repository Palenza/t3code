import { useEffect, useMemo, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";

import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { cn } from "../../lib/utils";
import {
  deriveLatestContextWindowSnapshot,
  formatContextWindowTokens,
} from "../../lib/contextWindow";
import { useProjects, useThreadDetail, useThreadShells } from "../../state/entities";
import type { WorkLogEntry } from "../../session-logic";
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
      // Les agents encore actifs.
      //
      // Le journal partagé masque `task.started` — c'est voulu, le fil de
      // discussion n'a pas à porter une ligne « démarré » par agent. Mais le
      // panneau, lui, en a besoin : sans elle un agent reste INVISIBLE jusqu'à
      // son premier rapport de progression, parfois très longtemps, pendant
      // lesquelles ce panneau affirme « rien ne tourne » alors que si.
      //
      // On lit donc les départs directement dans les activités, et on ne garde
      // que ceux qu'aucune progression n'a encore remplacés.
      agents: ((): ReadonlyArray<WorkLogEntry> => {
        const enCours = sections.running.filter(
          (entry) => entry.sourceActivityKind === "task.progress",
        );
        const dejaVus = new Set(enCours.map((entry) => entry.taskId).filter(Boolean));
        const demarrages = turnActivities
          .filter((activity) => activity.kind === "task.started")
          .map((activity) => {
            const payload = (activity.payload ?? {}) as Record<string, unknown>;
            const taskId = typeof payload["taskId"] === "string" ? payload["taskId"] : undefined;
            const nom =
              typeof payload["description"] === "string"
                ? payload["description"]
                : activity.summary;
            // Même forme qu'une progression : un agent qui vient de démarrer
            // n'a pas encore d'activité ni de tokens, et c'est la vérité — on
            // n'affiche donc rien à leur place plutôt qu'un zéro.
            return {
              id: activity.id,
              createdAt: activity.createdAt,
              label: nom,
              tone: "thinking" as const,
              ...(taskId === undefined ? {} : { taskId }),
              taskName: nom,
            };
          })
          .filter((depart) => depart.taskId !== undefined && !dejaVus.has(depart.taskId));
        // Les terminés ne comptent pas : un agent fini n'est plus « en cours ».
        const finis = new Set(
          turnActivities
            .filter((activity) => activity.kind === "task.completed")
            .map((activity) => (activity.payload as { taskId?: string } | undefined)?.taskId)
            .filter(Boolean),
        );
        return [
          ...enCours.filter((entry) => !entry.taskId || !finis.has(entry.taskId)),
          ...demarrages.filter((depart) => !finis.has(depart.taskId as string)),
        ];
      })(),
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
        <div className="mt-2 ml-5.5 flex flex-col gap-1.5 border-l border-border/40 pl-2.5">
          {agents.map((agent) => {
            // Le NOM est stable, l'ACTIVITÉ change. On ne répète pas la même
            // phrase deux fois quand le fournisseur n'envoie que l'une.
            const nom = agent.taskName ?? agent.label;
            const activite = agent.taskName && agent.label !== agent.taskName ? agent.label : null;
            return (
              <div key={agent.id} className="flex min-w-0 items-baseline gap-2">
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 animate-pulse self-start rounded-full bg-sky-400/80"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] leading-4 font-medium text-foreground/80">
                    {nom}
                  </div>
                  {activite ? (
                    <div className="truncate text-[11px] leading-4 text-muted-foreground/60">
                      {activite}
                    </div>
                  ) : null}
                </div>
                {/* Les chiffres à droite, alignés : on les compare d'un coup
                    d'œil entre agents. Rien ne s'affiche si rien n'est mesuré —
                    jamais de zéro inventé. */}
                <div className="flex shrink-0 items-baseline gap-2 text-[10.5px] tabular-nums text-muted-foreground/50">
                  {agent.taskLastTool ? (
                    <span className="max-w-24 truncate">{agent.taskLastTool}</span>
                  ) : null}
                  {agent.taskTokens ? (
                    <span>{formatContextWindowTokens(agent.taskTokens)}</span>
                  ) : null}
                  <span>{formatElapsed(agent.createdAt, now)}</span>
                </div>
              </div>
            );
          })}
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
        <ChevronRightIcon className={cn("size-3 transition-transform", doneOpen && "rotate-90")} />
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
