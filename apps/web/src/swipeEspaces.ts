/**
 * LE SWIPE D'ESPACE DANS LA ZONE DE TRAVAIL — et ce qui doit l'arrêter.
 *
 * Décision fondateur 31/07 : le geste ne doit plus obliger à viser la barre
 * latérale, il marche aussi là où on écrit. Ce qui crée un danger que la
 * barre n'avait pas : le fil est plein de blocs de code et de tableaux LARGES.
 * Sans garde-fou, faire défiler un tableau vers la droite sauterait d'espace
 * en pleine lecture — un geste ordinaire produirait une navigation surprise.
 *
 * La règle : si quelque chose sous le doigt peut ENCORE défiler dans le sens
 * du geste, ce geste lui appartient. On ne prend la main qu'au moment où plus
 * rien n'a de course à offrir.
 */

export interface BoiteDefilante {
  readonly scrollLeft: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
}

/**
 * `true` quand cette boîte a encore de la course dans le sens du geste.
 *
 * Les marges d'un pixel ne sont pas de la coquetterie : `scrollWidth` et
 * `clientWidth` sont des entiers arrondis, et un zoom non entier laisse
 * couramment une course résiduelle d'un pixel sur des blocs qui, à l'œil,
 * ne défilent pas. Sans la marge, ces blocs mangeraient le geste pour
 * toujours et le swipe paraîtrait mort par endroits.
 */
export function peutEncoreDefiler(boite: BoiteDefilante, deltaX: number): boolean {
  const course = boite.scrollWidth - boite.clientWidth;
  if (course <= 2) return false;
  if (deltaX > 0) return boite.scrollLeft < course - 1;
  if (deltaX < 0) return boite.scrollLeft > 1;
  return false;
}

/**
 * Le seuil à franchir pour changer d'espace, selon l'endroit du geste.
 *
 * Deux valeurs, et l'écart est délibéré. Dans la barre latérale — une bande
 * étroite où RIEN ne défile horizontalement — 110 px suffisent, et c'est la
 * valeur en service. Dans la zone de travail, le même seuil se ferait
 * franchir par un défilement de tableau un peu vif : on le pose bien au-delà
 * de ce qu'un geste de lecture produit, pour que seul un geste VOULU le
 * touche. Un swipe volontaire dépasse largement les deux ; c'est le geste
 * accidentel qu'on tient à l'écart.
 */
export const SEUIL_BARRE = 110;
export const SEUIL_ZONE_DE_TRAVAIL = 200;

export function seuilDuSwipe(depuisLaBarre: boolean): number {
  return depuisLaBarre ? SEUIL_BARRE : SEUIL_ZONE_DE_TRAVAIL;
}

/**
 * L'AXE DU GESTE — décidé UNE FOIS, tenu jusqu'au bout.
 *
 * Le mal : « quand je swipe de haut en bas dans le chat pour monter ou
 * descendre du texte mais que mes mouvements sont un peu diagonaux, ça fait un
 * peu bouger la sidebar » (fondateur, 01/08).
 *
 * La cause : on comparait les deux axes cumulés à CHAQUE image. Au tout début
 * d'un geste, les deux cumuls valent quelques pixels — le bruit du trackpad
 * suffit à ce que l'horizontal l'emporte sur une image ou deux. La barre suit
 * alors le doigt, puis le vertical prend le dessus et elle retombe : elle
 * VIBRE. Le ratio n'est pas faux, il est juste sans objet tant qu'on n'a pas
 * assez de course pour que le rapport veuille dire quelque chose.
 *
 * D'où : tant que le geste n'a pas parcouru de quoi se prononcer, il est
 * INDÉCIS et on ne peint RIEN. Passé ce budget, l'axe est arrêté pour toute la
 * salve — un geste jugé vertical ne touchera plus jamais la barre, quelle que
 * soit sa dérive latérale ensuite. C'est ce que fait le système pour ses
 * propres vues, et pour la même raison.
 */
export type AxeDuGeste = "indecis" | "horizontal" | "vertical";

/**
 * FIL-PIÈGE, posé au-delà de tout ce qui est sain.
 *
 * 24 px de course TOTALE avant de trancher. Pour être jugé horizontal à ce
 * stade, il faut ~15 px de côté contre ~9 px de haut en bas : un défilement de
 * lecture qui dérive à ce point serait à 45°, ce n'est plus un défilement.
 *
 * Et c'est indolore pour un vrai swipe : 24 px, c'est 22 % de `SEUIL_BARRE`
 * (110) — le doigt a encore 86 px devant lui pendant lesquels la barre le
 * suit. Valeur RAISONNÉE à partir d'un seuil calibré, pas mesurée sur trackpad.
 * Si un swipe franc paraissait mort au démarrage, c'est CE budget qu'on
 * abaisse — et on le dit.
 */
export const BUDGET_DE_DECISION_PX = 24;

/** Au-delà de ce rapport, le geste est un défilement, pas un swipe. */
const DOMINANCE_VERTICALE = 1.6;

export function deciderLAxe(cumul: {
  readonly horizontal: number;
  readonly vertical: number;
}): AxeDuGeste {
  const horizontal = Math.abs(cumul.horizontal);
  const vertical = Math.abs(cumul.vertical);
  if (horizontal + vertical < BUDGET_DE_DECISION_PX) return "indecis";
  return vertical > horizontal * DOMINANCE_VERTICALE ? "vertical" : "horizontal";
}
