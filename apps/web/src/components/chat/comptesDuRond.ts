import type { CompteClaudeVue, TableauLocalEtat } from "../settings/tableauLocal";

/**
 * Les jauges d'abonnement, telles que le rond du composeur doit les montrer.
 *
 * Le tableau local (`/settings/tableau-local`) affichait déjà ces comptes, en
 * pleine page, à deux clics. Enzo les veut sous le rond, au survol : « il faut
 * garder seulement les jauges, transférer au rond » (01/08). Ce module tient
 * les jugements de cette vue-là — ce qu'on montre, dans quel ordre, et ce
 * qu'on dit quand on ne sait pas. Le composant ne fait que peindre.
 */

export interface JaugeDuRond {
  readonly nom: string;
  readonly pctLabel: string;
  /** Déjà borné 0–100 en amont : une barre ne peut pas être longue de 103 %. */
  readonly barPct: number;
  readonly tone: "normal" | "warning" | "critical";
  readonly resetLabel: string | null;
}

export interface CompteDuRond {
  readonly label: string;
  readonly email: string;
  readonly actif: boolean;
  /** L'état que cc-tableau rapporte lui-même (« jeton périmé… ») — null si tout va bien. */
  readonly etat: string | null;
  readonly jauges: ReadonlyArray<JaugeDuRond>;
}

export type ComptesDuRond =
  | { readonly kind: "silence"; readonly raison: string }
  | { readonly kind: "comptes"; readonly comptes: ReadonlyArray<CompteDuRond> };

/**
 * Ce qu'on écrit quand le tableau n'a rien dit. C'est un fait sur NOUS, pas
 * sur les comptes : « aucune lecture » ≠ « aucun usage ». Une jauge vide se
 * lirait « 0 % utilisé », ce qui serait un chiffre inventé.
 */
export const RAISON_AUCUNE_LECTURE = "Aucune lecture des comptes pour le moment.";

/** Un compte n'a rien à dire que s'il n'a NI jauge NI état à rapporter. */
const compteMuet = (compte: CompteClaudeVue): boolean =>
  compte.limites.length === 0 && compte.etat === null;

export const resumerComptesPourLeRond = (etat: TableauLocalEtat | null): ComptesDuRond => {
  if (etat === null) {
    return { kind: "silence", raison: RAISON_AUCUNE_LECTURE };
  }
  if (etat.kind === "muet") {
    return { kind: "silence", raison: etat.raison };
  }
  const comptes = etat.vue.comptes;
  if (comptes === null) {
    return { kind: "silence", raison: RAISON_AUCUNE_LECTURE };
  }
  // ORDRE DE LA SOURCE, PAS « L'ACTIF EN TÊTE ».
  //
  // Remonter le compte actif ferait bouger les trois lignes chaque fois qu'on
  // bascule de compte : la jauge qu'on regardait change de place sous la
  // souris. Une position stable se lit d'un coup d'œil ; c'est la mise en
  // évidence qui distingue l'actif, pas le déplacement.
  const retenus = comptes.filter((compte) => !compteMuet(compte));
  if (retenus.length === 0) {
    return { kind: "silence", raison: RAISON_AUCUNE_LECTURE };
  }
  return {
    kind: "comptes",
    comptes: retenus.map((compte) => ({
      label: compte.label,
      email: compte.email,
      actif: compte.actif,
      etat: compte.etat,
      jauges: compte.limites.map((limite) => ({
        nom: limite.nom,
        pctLabel: limite.pctLabel,
        barPct: limite.barPct,
        tone: limite.tone,
        resetLabel: limite.resetLabel,
      })),
    })),
  };
};
