import { useCallback, useEffect, useState } from "react";

import { DownloadIcon, Loader2Icon } from "lucide-react";

import { cn } from "../../lib/utils";
import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { stackedThreadToast, toastManager } from "../ui/toast";

const ETAT_PATH = "/api/fork-update/etat";
const LANCER_PATH = "/api/fork-update/lancer";
const POLL_MS = 30 * 60 * 1000;

interface ForkUpdateEtat {
  readonly behind: number | null;
  readonly latestSubject: string | null;
  readonly building: boolean;
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

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(resolvePrimaryEnvironmentHttpUrl(ETAT_PATH), {
        cache: "no-store",
      });
      if (!response.ok) {
        setEtat(null);
        return;
      }
      setEtat((await response.json()) as ForkUpdateEtat);
    } catch {
      setEtat(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      const response = await fetch(resolvePrimaryEnvironmentHttpUrl(LANCER_PATH), {
        method: "POST",
      });
      const body = (await response.json()) as { started?: boolean };
      if (body.started === true) {
        toastManager.add(
          stackedThreadToast({
            type: "info",
            title: "Update en cours",
            description:
              "Pull + rebuild local (quelques minutes). La nouvelle app s'ouvre toute seule à la fin — ferme celle-ci à ce moment-là.",
          }),
        );
        setEtat((previous) => (previous === null ? null : { ...previous, building: true }));
        return;
      }
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Update non lancée",
          description: "Voir ~/.t3/logs/t3-maj.log — le dépôt a peut-être des modifs locales.",
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

  if (etat === null || etat.behind === null || (etat.behind <= 0 && !etat.building)) {
    return null;
  }

  const building = etat.building || launching;
  return (
    <button
      type="button"
      disabled={building}
      onClick={() => void launch()}
      title={etat.latestSubject ?? undefined}
      className={cn(
        "mb-1 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/15 px-3 py-2 text-left text-xs font-medium text-blue-100 transition-colors",
        building ? "cursor-default opacity-80" : "hover:bg-blue-500/25",
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
          : `Update available · ${etat.behind} commit${etat.behind > 1 ? "s" : ""}`}
      </span>
    </button>
  );
}
