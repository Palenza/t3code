import { TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * CE QUE LE SYSTÈME N'A PAS SU LIRE.
 *
 * Quand un tour meurt, son message d'erreur passe par un classement qui décide
 * s'il faut basculer de compte, attendre, ou abandonner. Ce classement rend
 * aussi un drapeau : ai-je RECONNU ce message, ou l'ai-je rangé par défaut ?
 * Deux vraies pannes ont traversé ce classement en une seule nuit, chacune
 * déguisée en « transitoire », chacune laissant un fil mort sans explication.
 *
 * Le serveur compte désormais ces inconnus et les garde au redémarrage. Ce
 * panneau est l'autre moitié : sans lui, le comptage se ferait dans un fichier
 * que personne n'ouvre — un état invisible, exactement ce qu'on corrige.
 *
 * Silencieux tant qu'il n'y a rien. C'est la condition pour qu'il soit cru le
 * jour où il parle.
 */

interface EntreeCarnet {
  readonly signature: string;
  readonly exemple: string;
  readonly occurrences: number;
  readonly premiereVue: string;
  readonly derniereVue: string;
  readonly comptes: ReadonlyArray<string>;
}

/** Assez rare pour ne rien coûter, assez fréquent pour ne pas dater. */
const RELECTURE_MS = 120_000;

export function SidebarCarnet() {
  const [entrees, setEntrees] = useState<ReadonlyArray<EntreeCarnet>>([]);
  const [seuil, setSeuil] = useState(2);

  useEffect(() => {
    let vivant = true;
    const relire = async () => {
      try {
        const reponse = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/carnet"));
        if (!reponse.ok) return;
        const corps = (await reponse.json()) as {
          seuil?: number;
          entrees?: ReadonlyArray<EntreeCarnet>;
        };
        if (!vivant) return;
        setEntrees(corps.entrees ?? []);
        if (typeof corps.seuil === "number") setSeuil(corps.seuil);
      } catch {
        // Serveur local absent : le panneau reste muet. Il n'a rien à dire,
        // et prétendre le contraire serait pire que se taire.
      }
    };
    void relire();
    const minuterie = setInterval(() => void relire(), RELECTURE_MS);
    return () => {
      vivant = false;
      clearInterval(minuterie);
    };
  }, []);

  if (entrees.length === 0) return null;

  const recurrents = entrees.filter((entree) => entree.occurrences >= seuil).length;

  return (
    <div className="px-2 pb-1">
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Messages d'échec non reconnus"
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left",
                "transition-colors hover:bg-sidebar-row-hover",
                // Le ton ne s'allume qu'au seuil. Peindre en orange dès la
                // première occurrence userait le signal avant qu'il ne serve.
                recurrents > 0 ? "text-warning" : "text-sidebar-foreground/55",
              )}
            >
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {entrees.length} panne{entrees.length > 1 ? "s" : ""} non reconnue
                {entrees.length > 1 ? "s" : ""}
              </span>
              {recurrents > 0 && (
                <span className="shrink-0 text-[11px] tabular-nums opacity-80">
                  {recurrents} à classer
                </span>
              )}
            </button>
          }
        />
        <PopoverPopup className="max-h-full w-[28rem] overflow-y-auto p-1.5">
          {/* Ce qu'il faut EN FAIRE est dit ici. Un panneau qui montre un
              problème sans dire quel geste le résout est un panneau qu'on
              apprend à ignorer. */}
          <p className="px-2.5 pt-1 pb-2 text-xs leading-snug text-muted-foreground">
            Ces messages d'erreur n'ont correspondu à aucun motif connu : le système a basculé au
            jugé. Ajouter le motif manquant dans{" "}
            <code className="rounded bg-accent/60 px-1 py-0.5 text-[11px]">comptePool.ts</code> rend
            la panne reconnue la prochaine fois.
          </p>
          {entrees.map((entree) => {
            const alarme = entree.occurrences >= seuil;
            return (
              <div key={entree.signature} className="rounded-md px-2.5 py-2 hover:bg-accent/50">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-semibold tabular-nums",
                      alarme ? "text-warning" : "text-muted-foreground/60",
                    )}
                  >
                    ×{entree.occurrences}
                  </span>
                  {/* Le message BRUT, verbatim. La signature normalisée sert à
                      compter, pas à être lue : c'est ce texte-ci qu'on recopie
                      pour écrire le motif. */}
                  <p className="min-w-0 flex-1 font-mono text-[12px] leading-snug break-words">
                    {entree.exemple}
                  </p>
                </div>
                <p className="pt-1 pl-7 text-[11px] text-muted-foreground/60">
                  {entree.comptes.length > 1
                    ? `${entree.comptes.length} comptes touchés`
                    : `compte ${entree.comptes[0] ?? "?"}`}
                  {entree.derniereVue !== "" &&
                    ` · vu le ${new Date(entree.derniereVue).toLocaleDateString("fr-FR")}`}
                </p>
              </div>
            );
          })}
        </PopoverPopup>
      </Popover>
    </div>
  );
}
