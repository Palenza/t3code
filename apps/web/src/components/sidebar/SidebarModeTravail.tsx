import { useCallback, useEffect, useState } from "react";

import { ShieldIcon } from "lucide-react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { stackedThreadToast, toastManager } from "../ui/toast";

const MODE_PATH = "/api/mode";

interface ModeDisponible {
  readonly slug: string;
  readonly nom: string;
  readonly role: string;
  readonly quandUtiliser: string | null;
  readonly perimetre: ReadonlyArray<string>;
}

/**
 * Le mode de travail — et surtout, ce qu'il INTERDIT.
 *
 * Chaque mode annonce son périmètre en clair, parce que c'est le seul détail
 * qui compte au moment de choisir : « Revue » n'est pas une intention polie,
 * c'est une impossibilité d'écrire. Le libellé dit donc l'interdiction, pas
 * l'intention.
 *
 * Silencieux tant qu'aucun mode restrictif n'est posé : un badge permanent
 * pour dire « rien n'est restreint » serait du bruit.
 */
export function SidebarModeTravail() {
  const [disponibles, setDisponibles] = useState<ReadonlyArray<ModeDisponible>>([]);
  const [actif, setActif] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);

  const relire = useCallback(async () => {
    try {
      const reponse = await fetch(resolvePrimaryEnvironmentHttpUrl(MODE_PATH), {
        cache: "no-store",
      });
      if (!reponse.ok) return;
      const etat = (await reponse.json()) as {
        actif: string | null;
        disponibles: ReadonlyArray<ModeDisponible>;
      };
      setDisponibles(etat.disponibles);
      setActif(etat.actif);
    } catch {
      // Serveur local absent : le sélecteur reste muet plutôt que menteur.
    }
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  const poser = useCallback(
    async (slug: string | null) => {
      try {
        const reponse = await fetch(resolvePrimaryEnvironmentHttpUrl(MODE_PATH), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const corps = (await reponse.json()) as {
          pose?: boolean;
          comptes?: number;
          raison?: string;
        };
        if (corps.pose !== true) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Mode non appliqué",
              description: corps.raison ?? "Le serveur local a refusé.",
            }),
          );
          return;
        }
        setActif(slug);
        setOuvert(false);
        // Le nombre de comptes touchés est DIT : un mode qui ne s'applique à
        // rien (aucun compte avec dossier propre) ressemblerait à un succès.
        toastManager.add(
          stackedThreadToast({
            type: corps.comptes === 0 ? "error" : "info",
            title: corps.comptes === 0 ? "Mode sans effet" : "Mode appliqué",
            description:
              corps.comptes === 0
                ? "Aucun compte n'a de dossier de configuration propre — rien n'a été restreint."
                : `${corps.comptes} compte${(corps.comptes ?? 0) > 1 ? "s" : ""} concerné${(corps.comptes ?? 0) > 1 ? "s" : ""}.`,
          }),
        );
      } catch {
        toastManager.add(
          stackedThreadToast({ type: "error", title: "Le serveur local n'a pas répondu" }),
        );
      }
    },
    [],
  );

  if (disponibles.length === 0) return null;
  const modeActif = disponibles.find((mode) => mode.slug === actif) ?? null;
  // Sans restriction, le sélecteur ne s'affiche pas : un badge permanent qui
  // dit « rien n'est bloqué » est du bruit.
  const restreint = (modeActif?.perimetre.length ?? 0) > 0 || modeActif?.slug === "revue";

  return (
    <div className="px-2 pb-1">
      <Popover open={ouvert} onOpenChange={setOuvert}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Mode de travail"
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-sidebar-row-hover",
                restreint
                  ? "text-sidebar-foreground ring-1 ring-sidebar-border"
                  : "text-sidebar-foreground/55",
              )}
            >
              <ShieldIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {modeActif?.nom ?? "Mode de travail"}
              </span>
            </button>
          }
        />
        <PopoverPopup className="w-80 p-1.5">
          {disponibles.map((mode) => (
            <button
              key={mode.slug}
              type="button"
              onClick={() => void poser(mode.slug)}
              className={cn(
                "flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent",
                mode.slug === actif && "bg-accent",
              )}
            >
              <span className="text-sm font-medium">{mode.nom}</span>
              <span className="text-xs text-muted-foreground">{mode.role}</span>
              {mode.perimetre.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  Écriture limitée à {mode.perimetre.join(", ")}
                </span>
              ) : mode.slug === "revue" ? (
                <span className="text-xs text-muted-foreground">Aucune écriture possible</span>
              ) : null}
            </button>
          ))}
        </PopoverPopup>
      </Popover>
    </div>
  );
}
