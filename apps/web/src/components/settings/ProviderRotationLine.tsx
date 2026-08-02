import type { ServerProvider } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { ligneDeRotation, type GraviteRotation } from "./rotationPresentation.logic";

const TON: Record<GraviteRotation, string> = {
  sain: "text-muted-foreground/70",
  attention: "text-warning",
  bloque: "text-destructive",
};

const PASTILLE: Record<GraviteRotation, string> = {
  sain: "bg-muted-foreground/40",
  attention: "bg-warning",
  bloque: "bg-destructive",
};

/**
 * L'état d'un compte DANS LA ROTATION, sous ses jauges de quota.
 *
 * Ne rend rien quand il n'y a rien à dire — un compte sain qui n'a jamais
 * bronché n'a pas besoin d'une ligne pour le proclamer. Toute la décision
 * (quoi dire, quand se taire) vit dans `rotationPresentation.logic.ts`, sous
 * test.
 */
export function LigneDeRotation(props: {
  readonly rotation: ServerProvider["rotation"];
  /** Injecté pour que le rendu soit une fonction pure de ses entrées en test. */
  readonly now?: number;
}) {
  const ligne = ligneDeRotation(props.rotation, props.now ?? Date.now());
  if (ligne === null) {
    return null;
  }

  return (
    <div className="mt-2 flex min-w-0 items-start gap-1.5 text-[11px] leading-4">
      <span
        aria-hidden
        className={cn("mt-1 size-1.5 shrink-0 rounded-full", PASTILLE[ligne.gravite])}
      />
      <div className="min-w-0">
        <span className={cn("font-medium", TON[ligne.gravite])}>{ligne.titre}</span>
        {ligne.reprise ? (
          <span className="text-muted-foreground/60"> · {ligne.reprise}</span>
        ) : null}
        {/* Le message du fournisseur, tel quel. C'est le seul texte qui dise
            POURQUOI, et le reformuler perdrait l'indice qui permet de réparer. */}
        {ligne.raison ? (
          <p className="mt-0.5 break-words text-muted-foreground/50">{ligne.raison}</p>
        ) : null}
      </div>
    </div>
  );
}
