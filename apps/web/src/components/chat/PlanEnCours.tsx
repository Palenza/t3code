import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { type ActivePlanState } from "../../session-logic";

/**
 * LE PLAN, DANS LE FIL — pas un mode, un AFFICHAGE.
 *
 * Ordre fondateur : « le mode plan doit être automatique, dans le sens où
 * c'est juste visuellement ; on n'est pas censé cliquer sur le mode plan, il
 * n'y a que build ». Ce panneau n'a donc aucun interrupteur : il apparaît
 * quand l'agent avance par étapes, il disparaît quand il n'y en a plus.
 *
 * La forme vient de deux références qu'Enzo a fournies :
 *
 *  · d'Abacus (capture du 31/07), la STRUCTURE — en-tête repliable, compteur
 *    N/M, barre fine, une ligne par étape, la ligne active détachée.
 *  · du `.mov` (pilule « Tasks »), la PEAU — le panneau EST la jauge : le
 *    remplissage l'envahit en dégradé diffus, sans bord net. Pas de barre
 *    séparée posée à côté ; la carte elle-même dit l'avancement.
 *
 * Un endroit où l'on va CONTRE la référence, assumé : le `.mov` remplit
 * depuis la droite. Une progression se lit de gauche à droite — on garde le
 * dégradé sans bord (ce qui est beau) et on inverse le sens (ce qui est
 * lisible).
 *
 * Et la couleur n'est pas fixe : elle vient de la palette de l'espace
 * (`sidebarThemeAccent`), consigne fondateur — « si quelqu'un change la
 * palette de couleur, ça change aussi la palette de ses notifs ». Sans thème,
 * on retombe sur le bleu de « Working ».
 */
export function PlanEnCours({
  plan,
  accent,
}: {
  readonly plan: ActivePlanState | null;
  readonly accent: string;
}) {
  const [replie, setReplie] = useState(false);

  if (plan === null || plan.steps.length === 0) return null;

  const total = plan.steps.length;
  const faites = plan.steps.filter((etape) => etape.status === "completed").length;
  const fini = faites === total;
  const pourcent = Math.round((faites / total) * 100);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        // Le fond de la carte, discret : c'est la jauge qui porte la couleur.
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.07)",
        background: "color-mix(in oklab, var(--card) 92%, transparent)",
      }}
    >
      {/* LA JAUGE — c'est la carte elle-même. À 0 %, opacité nulle : une jauge
          vide qui teinte déjà mentirait sur l'avancement. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: faites === 0 ? 0 : 1,
          // Doses BAISSÉES (22/14 → 13/8) : du texte passe par-dessus cette
          // jauge. Sur un voile déjà coloré, l'ancienne dose empilait deux
          // teintes et rendait les lignes pâteuses. Assez pour qu'on voie
          // l'avancement, assez peu pour qu'on lise ce qui est écrit.
          background: `linear-gradient(90deg,
            color-mix(in oklab, ${accent} 13%, transparent) 0%,
            color-mix(in oklab, ${accent} 8%, transparent) ${pourcent}%,
            transparent ${Math.min(100, pourcent + 22)}%)`,
        }}
      />

      <button
        type="button"
        aria-expanded={!replie}
        onClick={() => setReplie((etat) => !etat)}
        className="relative flex w-full cursor-pointer items-center gap-2.5 px-3 py-3 text-left"
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 opacity-50 transition-transform duration-200",
            !replie && "rotate-90",
          )}
        />
        <span className="text-[13.5px] font-semibold tracking-tight">Plan</span>
        <span className="text-[12px] tabular-nums opacity-55">
          {faites}/{total}
        </span>
        <span className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-white/8">
          <span
            className="block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${pourcent}%`, backgroundColor: accent }}
          />
        </span>
        {fini ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            style={{
              color: accent,
              backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)`,
            }}
          >
            Terminé
          </span>
        ) : null}
      </button>

      {replie ? null : (
        <div className="relative px-2 pb-2">
          {plan.steps.map((etape, index) => {
            const active = etape.status === "inProgress";
            return (
              <div
                // L'index EST l'identité : deux étapes peuvent porter le même
                // texte, et le plan se réécrit entier à chaque mise à jour.
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] leading-snug",
                  etape.status === "pending" && "opacity-45",
                  etape.status === "completed" && "opacity-70",
                  active && "font-semibold",
                )}
                // LA LIGNE ACTIVE SE DÉTACHE SANS SE COLORER.
                //
                // Première version : un fond à 12 % de l'accent. Sur un voile
                // déjà rose, la ligne rose se cognait au fond et le texte
                // luttait pour se lire — le défaut exact corrigé le matin même
                // pour « Working », reproduit ici trois heures plus tard.
                //
                // La correction est la même règle : la couleur ne se pose pas
                // PAR-DESSUS, elle se mélange à l'encre. Le fond de la ligne
                // est donc neutre (du blanc translucide, qui marche sur
                // n'importe quel voile) et l'accent ne sert qu'au LISERÉ et au
                // spinner — deux surfaces fines, où la teinte se voit sans
                // jamais passer sous du texte.
                style={
                  active
                    ? {
                        background: "rgb(255 255 255 / 0.06)",
                        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 45%, transparent)`,
                      }
                    : undefined
                }
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {etape.status === "completed" ? (
                    <CheckIcon className="size-3.5" style={{ color: accent }} />
                  ) : active ? (
                    <span
                      className="size-3.5 animate-spin rounded-full border-[1.5px] border-transparent motion-reduce:animate-none"
                      style={{
                        borderColor: `color-mix(in oklab, ${accent} 28%, transparent)`,
                        borderTopColor: accent,
                        animationDuration: "900ms",
                      }}
                    />
                  ) : (
                    <span className="size-3 rounded-full ring-[1.5px] ring-white/22" />
                  )}
                </span>
                <span className="min-w-0 flex-1">{etape.step}</span>
                {active ? <span className="text-[10.5px] opacity-55">en cours</span> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
