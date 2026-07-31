/**
 * LA TRANSFORMATION DE SORTIE — une seule porte pour tout ce que nos outils
 * rendent au modèle.
 *
 * Absorption d'Hermès (`transform_tool_result`, `transform_terminal_output`),
 * chantier n°15. Chez eux c'est un point d'extension pour les plugins ; ici
 * c'est une PORTE OBLIGATOIRE, et c'est mieux : une transformation qu'on peut
 * oublier de brancher finit par être oubliée.
 *
 * ── Le trou qu'elle referme ───────────────────────────────────────────────
 *
 * Vérifié le 31/07 : aucun des quatre outils MCP de T3 ne caviardait sa
 * sortie. L'export, lui, le fait. Or `rappel` rend des messages d'un AUTRE
 * fil — donc une clé collée dans le fil A pouvait atterrir dans le contexte
 * du fil B, à un moment où plus personne ne la surveillait. L'export protège
 * ce qui sort vers un fichier ; il n'y avait rien pour ce qui sort vers un
 * modèle.
 *
 * ── Pourquoi une porte plutôt qu'une règle ────────────────────────────────
 *
 * Chaque poignée bornait déjà sa charge dans son coin — `rappel` à sa façon,
 * `repo_map` à la sienne. Recopier une règle dans chaque outil, c'est garantir
 * qu'un futur outil l'oubliera. La LOI le dit : mécanisable → mécanisé.
 *
 * Module PUR.
 */
import { caviarder } from "../secrets/Caviarder.ts";

/**
 * Le plafond d'une sortie d'outil, en caractères.
 *
 * Aligné sur le fil-piège du rappel (120 000 ≈ 30 000 jetons), pour la même
 * raison mesurée : au-delà, un seul appel d'outil mange une part sérieuse de
 * la fenêtre. C'est un fil-piège, pas un budget — les outils dimensionnent
 * déjà leur charge en amont, celui-ci n'attrape que ce qui a dérapé.
 */
export const PLAFOND_SORTIE = 120_000;

export interface Transformee<T> {
  readonly valeur: T;
  /** Ce que la porte a changé — vide quand elle n'a rien eu à faire. */
  readonly notes: ReadonlyArray<string>;
}

/**
 * Fait passer toute chaîne d'une structure par le caviardage, et borne le
 * poids total.
 *
 * On garde la FORME : le modèle reçoit le même objet, avec les mêmes clés. Ne
 * remplacer que le contenu évite de casser les schémas déclarés par les
 * outils — une porte qui change la forme est une porte qu'on débranche.
 */
export function transformerSortie<T>(valeur: T): Transformee<T> {
  const notes: string[] = [];
  let caviarde = 0;

  const parcourir = (noeud: unknown): unknown => {
    if (typeof noeud === "string") {
      const propre = caviarder(noeud);
      if (propre !== noeud) caviarde += 1;
      return propre;
    }
    if (Array.isArray(noeud)) return noeud.map(parcourir);
    if (typeof noeud === "object" && noeud !== null) {
      const sortie: Record<string, unknown> = {};
      for (const [cle, sousNoeud] of Object.entries(noeud)) {
        sortie[cle] = parcourir(sousNoeud);
      }
      return sortie;
    }
    return noeud;
  };

  const transforme = parcourir(valeur) as T;
  if (caviarde > 0) {
    notes.push(`${caviarde} champ(s) caviardé(s) avant de sortir vers le modèle.`);
  }

  // Le poids se mesure sur la sérialisation, parce que c'est ELLE qui part
  // dans le contexte — pas la structure en mémoire.
  const poids = JSON.stringify(transforme)?.length ?? 0;
  if (poids > PLAFOND_SORTIE) {
    // On ne tronque PAS ici : couper au milieu d'un JSON rendrait une
    // structure invalide, et l'outil sait mieux que nous quoi sacrifier. On
    // le DIT, bruyamment, pour que le dépassement se répare à la source.
    notes.push(
      `⚠️ Sortie de ${poids} caractères, au-dessus du plafond ${PLAFOND_SORTIE}. L'outil doit borner sa charge en amont.`,
    );
  }

  return { valeur: transforme, notes };
}

/**
 * Colle les notes de la porte dans un champ `note` existant.
 *
 * Les nôtres portent déjà un champ `note` où l'outil s'explique. Y ajouter ce
 * que la porte a fait garde tout au même endroit — un lecteur qui voit
 * « sk-ant***f3a9 » sans explication cherche pourquoi la clé ne marche pas.
 */
export function avecNotes<T extends { readonly note?: string }>(transformee: Transformee<T>): T {
  if (transformee.notes.length === 0) return transformee.valeur;
  const existante = transformee.valeur.note ?? "";
  const jointes = transformee.notes.join(" ");
  return {
    ...transformee.valeur,
    note: existante.length > 0 ? `${existante} ${jointes}` : jointes,
  };
}
