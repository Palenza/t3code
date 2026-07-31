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
