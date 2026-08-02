import type { ServerProvider } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { ancreDuCompte, comptesAttention } from "./rotationPresentation.logic";

/**
 * CE QUI A BESOIN D'ATTENTION, avant la liste des comptes.
 *
 * Volé à Cursor, dont l'écran « Tools & MCPs » remonte ce qui est cassé EN
 * HAUT de page. Chez nous ça résout le cas le plus dur d'un coup : avec trois
 * comptes, un compte au mur n'était qu'une carte parmi trois, à trouver en
 * déroulant.
 *
 * Ne rend RIEN quand tout va bien — pas un « tout va bien » vert. Une bande
 * toujours présente devient un décor : on cesse de la lire, et elle ne
 * protège plus le jour où elle a quelque chose à dire.
 */
export function BandeAttention(props: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly nomDuCompte: (instanceId: string) => string;
  /** Injecté pour que le rendu soit une fonction pure de ses entrées en test. */
  readonly now?: number;
}) {
  const entrees = comptesAttention(props.providers, props.now ?? Date.now());
  if (entrees.length === 0) {
    return null;
  }

  return (
    <div
      className="mb-2 grid gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 sm:px-4"
      role="status"
    >
      <p className="text-xs font-medium text-foreground">
        {entrees.length === 1
          ? "1 account needs attention"
          : `${entrees.length} accounts need attention`}
      </p>
      <ul className="grid gap-1.5">
        {entrees.map(({ provider, ligne }) => (
          <li key={String(provider.instanceId)} className="min-w-0">
            {/* Un bouton, pas une ligne de texte : la bande dit ce qui ne va
                pas ET emmène à l'endroit où on le répare. Sans ça, elle
                déplace le problème d'un cran — « lequel des trois, déjà ? ». */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto w-full justify-start gap-2 px-1.5 py-1 text-left"
              onClick={() => {
                document
                  .getElementById(ancreDuCompte(String(provider.instanceId)))
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  ligne.gravite === "bloque" ? "bg-destructive" : "bg-warning",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-normal text-foreground">
                {props.nomDuCompte(String(provider.instanceId))}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11px]",
                  ligne.gravite === "bloque" ? "text-destructive" : "text-warning",
                )}
              >
                {ligne.reprise ? `${ligne.titre} · ${ligne.reprise}` : ligne.titre}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
