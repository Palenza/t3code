import { useCallback, useEffect, useRef, useState } from "react";

import { DownloadIcon, Loader2Icon } from "lucide-react";

import { cn } from "../../lib/utils";
import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { stackedThreadToast, toastManager } from "../ui/toast";

const ETAT_PATH = "/api/fork-update/etat";
const LANCER_PATH = "/api/fork-update/lancer";
const POLL_MS = 30 * 60 * 1000;
/** While a rebuild runs, its end (success restarts the app; failure must be
 * SAID) is worth watching closely — not once every thirty minutes. */
const BUILDING_POLL_MS = 5_000;

interface ForkUpdateEtat {
  readonly behind: number | null;
  readonly latestSubject: string | null;
  readonly building: boolean;
  readonly lastRebuildExitCode?: number | null;
  /** Pourquoi le dernier rebuild s'est arrêté, en clair. */
  readonly derniereRaison?: string | null;
  /** Commits de l'AMONT (Théo) qui nous manquent — l'info que le bouton
   * natif de la Nightly donne, et que notre fork ne peut pas avoir. */
  readonly amontBehind?: number | null;
  readonly amontSujet?: string | null;
}

/**
 * The Arc-style « New version available » bar, without an Apple signature
 * (décision fondateur 29/07) : upstream nightlies land in the fork's
 * `travail` branch on their own; when the LOCAL checkout is behind, this
 * pill appears — one click pulls, rebuilds locally (no quarantine, Enzo's
 * features kept by the merge) and opens the fresh app. Silent whenever the
 * checkout is current or the server cannot tell.
 */
export function SidebarForkUpdatePill() {
  const [etat, setEtat] = useState<ForkUpdateEtat | null>(null);
  const [launching, setLaunching] = useState(false);
  // Failure detection spans polls: `building` was true, now it is false and
  // the server remembers a non-zero exit — the rebuild died and the app was
  // NOT replaced. Without this toast the only symptom is 30 min of silence
  // (trouvaille essaim 29/07).
  const wasBuildingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(resolvePrimaryEnvironmentHttpUrl(ETAT_PATH), {
        cache: "no-store",
      });
      if (!response.ok) {
        setEtat(null);
        return;
      }
      const next = (await response.json()) as ForkUpdateEtat;
      if (
        wasBuildingRef.current &&
        !next.building &&
        typeof next.lastRebuildExitCode === "number" &&
        next.lastRebuildExitCode !== 0
      ) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Mise à jour impossible",
            description:
              next.derniereRaison ??
              `Le rebuild s'est arrêté (code ${next.lastRebuildExitCode}). L'app n'a pas changé — voir ~/.t3/logs/t3-maj.log.`,
          }),
        );
      }
      wasBuildingRef.current = next.building;
      setEtat(next);
    } catch {
      setEtat(null);
    }
  }, []);

  const building = (etat?.building ?? false) || launching;
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(
      () => void refresh(),
      building ? BUILDING_POLL_MS : POLL_MS,
    );
    return () => window.clearInterval(interval);
  }, [refresh, building]);

  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      const response = await fetch(resolvePrimaryEnvironmentHttpUrl(LANCER_PATH), {
        method: "POST",
      });
      const body = (await response.json()) as {
        started?: boolean;
        reason?: string;
        fichiers?: ReadonlyArray<string>;
      };
      if (body.started === true) {
        toastManager.add(
          stackedThreadToast({
            type: "info",
            title: "Update en cours",
            description:
              "Pull + rebuild local (quelques minutes). La nouvelle app s'ouvre toute seule à la fin — ferme celle-ci à ce moment-là.",
          }),
        );
        wasBuildingRef.current = true;
        setEtat((previous) => (previous === null ? null : { ...previous, building: true }));
        return;
      }
      // Le refus se DIT, avec sa raison et les fichiers en cause. « Voir le
      // log » renvoyait chercher au fond d'un fichier ce que le serveur venait
      // de constater en 30 ms — et seulement APRÈS avoir promis « quelques
      // minutes » (30/07).
      const fichiers = body.fichiers ?? [];
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Update non lancée",
          description:
            body.reason === "depot-sale"
              ? `Des modifications ne sont pas commitées — rien n'a été touché.${
                  fichiers.length > 0 ? ` ${fichiers.join(", ")}` : ""
                }`
              : body.reason === "already-running"
                ? "Une mise à jour est déjà en cours."
                : "Voir ~/.t3/logs/t3-maj.log.",
        }),
      );
    } catch {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Update non lancée",
          description: "Le serveur local n'a pas répondu.",
        }),
      );
    } finally {
      setLaunching(false);
    }
  }, []);

  const amont = etat?.amontBehind ?? 0;
  // On parle dès qu'il y a quelque chose à prendre : nos propres commits
  // non construits, OU des nouveautés amont.
  if (etat === null || (etat.behind ?? 0) <= 0) {
    if (etat === null || (amont <= 0 && !etat.building)) {
      return null;
    }
  }

  return (
    <button
      type="button"
      disabled={building}
      onClick={() => void launch()}
      title={etat.latestSubject ?? etat.amontSujet ?? undefined}
      className={cn(
        "mb-1 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-primary/25 bg-primary/12 px-3 py-2 text-left text-xs font-medium text-primary transition-colors",
        building ? "cursor-default opacity-80" : "hover:bg-primary/20",
      )}
    >
      {building ? (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <DownloadIcon className="size-3.5 shrink-0" />
      )}
      <span className="truncate">
        {building
          ? "Update en cours — rebuild local…"
          : (etat.behind ?? 0) > 0
            ? `Mettre à jour l'app · ${etat.behind} changement${(etat.behind ?? 0) > 1 ? "s" : ""}`
            : `Mettre à jour l'app · ${amont} nouveauté${amont > 1 ? "s" : ""}`}
      </span>
    </button>
  );
}
