import { BrainIcon, XIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useMemoireStore } from "../../memoireStore";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * CE QUE L'APP A RETENU DE TOI — et le geste pour le lui retirer.
 *
 * La capture existait sans son contraire. Quand tu poses une règle
 * (« ne fais jamais X »), elle est extraite et écrite dans le fichier que la
 * CLI relit au démarrage de CHAQUE session, sur CHACUN de tes comptes. La
 * fonction `oublier()` était écrite — et n'avait aucun appelant : rien, nulle
 * part, ne permettait de retirer une ligne. Corriger le fichier à la main ne
 * servait à rien non plus, il est réécrit à la capture suivante.
 *
 * Une phrase lâchée un soir de débogage devenait donc une règle éternelle,
 * sur trois comptes, sans date affichée et sans marche arrière. Ce panneau est
 * le frein qui manquait ; il vient AVANT toute boucle qui apprendrait seule.
 *
 * Silencieux tant que rien n'a été retenu : un bouton permanent qui dit
 * « aucune consigne » serait du bruit.
 */
export function SidebarMemoire() {
  const consignes = useMemoireStore((state) => state.consignes);
  const oublier = useMemoireStore((state) => state.oublier);

  if (consignes.length === 0) return null;

  return (
    <div className="px-2 pb-1">
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Ce que l'app a retenu"
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left",
                "text-sidebar-foreground/55 transition-colors hover:bg-sidebar-row-hover",
              )}
            >
              <BrainIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {consignes.length} consigne{consignes.length > 1 ? "s" : ""} retenue
                {consignes.length > 1 ? "s" : ""}
              </span>
            </button>
          }
        />
        <PopoverPopup className="w-96 p-1.5">
          {/* La PORTÉE est dite ici, pas déduite : ces phrases entrent dans
              toutes les sessions de tous les comptes, y compris celles qui
              produisent des données. C'est la seule information qui permet de
              décider d'en retirer une. */}
          <p className="px-2.5 pt-1 pb-2 text-xs leading-snug text-muted-foreground">
            Ces phrases sont relues au début de chaque session, sur tous tes comptes. Retire celles
            qui ne valent plus.
          </p>
          {consignes.map((consigne) => (
            <div
              key={consigne.id}
              className="flex items-start gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug">{consigne.phrase}</p>
                <p className="pt-0.5 text-[11px] text-muted-foreground/60">
                  {/* La DATE compte : une consigne d'il y a trois semaines n'a
                      pas le même poids qu'une d'hier, et rien ne l'affichait. */}
                  dite le {new Date(consigne.diteA).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Oublier : ${consigne.phrase}`}
                onClick={() => oublier(consigne.id)}
                className="mt-0.5 shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </PopoverPopup>
      </Popover>
    </div>
  );
}
