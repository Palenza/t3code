/**
 * LA LECTURE DU CONTEXTE — combien il reste, et combien de tours ça fait.
 *
 * Absorption d'Hermès (`agent/context_breakdown.py`, `insights.py`),
 * chantier n°27. T3 enregistre déjà chaque `context-window.updated` avec les
 * jetons utilisés, entrants, sortants et le plafond — 8 366 relevés dans la
 * base. Personne ne les lisait.
 *
 * Module PUR : on lui donne des relevés, il rend un constat.
 *
 * ── Pourquoi un pourcentage ne suffit pas ──────────────────────────────────
 *
 * « 83 % » ne dit pas quoi faire. Un fil à 83 % qui grossit de 2 000 jetons
 * par tour a de la marge pour la journée ; le même à 83 % qui prend 60 000
 * jetons par tour sature au tour suivant. Ce qui décide, ce n'est pas la
 * position, c'est la VITESSE.
 *
 * On rend donc le nombre de tours restants au rythme observé. C'est le seul
 * chiffre sur lequel on peut agir : « il te reste trois tours » se traduit en
 * un geste, « 83 % » se traduit en inquiétude.
 */

/** Un relevé tel que T3 l'enregistre déjà. */
export interface ReleveContexte {
  readonly utilises: number;
  readonly max: number;
  readonly entree: number;
  readonly sortie: number;
  /** Cumul des jetons traités sur toute la vie du fil — un indicateur de coût. */
  readonly traitesEnTout: number;
}

export type GraviteContexte = "ok" | "attention" | "sature";

export interface EtatContexte {
  readonly pourcent: number;
  readonly restants: number;
  /** Tours restants au rythme observé, ou `null` si le rythme est inconnu. */
  readonly toursRestants: number | null;
  /** Croissance moyenne par tour, en jetons. */
  readonly parTour: number | null;
  readonly gravite: GraviteContexte;
  readonly geste: string;
}

/**
 * Le seuil de tours restants qui déclenche l'alerte.
 *
 * Trois, et pas un : à un tour de la saturation, il est trop tard pour
 * découper proprement le travail — on se fait compacter au milieu d'une
 * tâche. Trois tours laissent le temps de finir ce qui est ouvert, d'écrire
 * ce qui doit survivre, et de repartir sur un fil neuf.
 */
export const TOURS_AVANT_ALERTE = 3;

/**
 * Le plancher de croissance en-dessous duquel on ne projette rien.
 *
 * Deux relevés consécutifs peuvent être identiques (un tour sans appel de
 * modèle). Diviser par un rythme nul rendrait l'infini, et annoncer « il te
 * reste une infinité de tours » juste avant de saturer serait pire que de se
 * taire.
 */
const CROISSANCE_MINIMALE = 1;

/**
 * L'état du contexte, d'après les relevés du plus ANCIEN au plus récent.
 *
 * On mesure la croissance sur les derniers relevés seulement : un fil qui a
 * commencé par de petits tours et finit par des gros doit être jugé sur ce
 * qu'il fait MAINTENANT, pas sur sa moyenne de vie.
 */
export function etatDuContexte(
  releves: ReadonlyArray<ReleveContexte>,
  surLesDerniers = 5,
): EtatContexte | null {
  const dernier = releves[releves.length - 1];
  if (dernier === undefined || dernier.max <= 0) return null;

  const pourcent = Math.round((dernier.utilises / dernier.max) * 100);
  const restants = Math.max(0, dernier.max - dernier.utilises);

  const fenetre = releves.slice(Math.max(0, releves.length - Math.max(2, surLesDerniers)));
  const premier = fenetre[0];
  const pas = fenetre.length - 1;
  const parTour =
    premier === undefined || pas <= 0
      ? null
      : Math.max(0, Math.round((dernier.utilises - premier.utilises) / pas));

  const toursRestants =
    parTour === null || parTour < CROISSANCE_MINIMALE ? null : Math.floor(restants / parTour);

  if (restants === 0) {
    return {
      pourcent,
      restants,
      toursRestants: 0,
      parTour,
      gravite: "sature",
      geste: "La fenêtre est pleine. Écris ce qui doit survivre, puis repars sur un fil neuf.",
    };
  }

  if (toursRestants !== null && toursRestants <= TOURS_AVANT_ALERTE) {
    return {
      pourcent,
      restants,
      toursRestants,
      parTour,
      gravite: "attention",
      // Le geste porte sur le NOMBRE de tours, pas sur le pourcentage : c'est
      // lui qui dit combien de temps il reste pour agir.
      geste: `Environ ${toursRestants} tour(s) au rythme actuel (${parTour} jetons/tour). Finis ce qui est ouvert et écris ce qui doit survivre avant de repartir.`,
    };
  }

  return {
    pourcent,
    restants,
    toursRestants,
    parTour,
    gravite: "ok",
    geste: "",
  };
}

/**
 * Ce que le fil a coûté en tout, pour ce que ça vaut.
 *
 * `traitesEnTout` cumule les jetons traités sur toute la vie du fil, cache
 * compris — il grimpe donc bien plus vite que la fenêtre. Ce n'est PAS une
 * facture et on ne le présente jamais comme telle : c'est un ordre de
 * grandeur, utile pour comparer deux fils entre eux, faux si on le convertit
 * en euros sans connaître la part servie par le cache.
 */
export function coutObserve(releves: ReadonlyArray<ReleveContexte>): {
  readonly traitesEnTout: number;
  readonly entree: number;
  readonly sortie: number;
} {
  const dernier = releves[releves.length - 1];
  if (dernier === undefined) return { traitesEnTout: 0, entree: 0, sortie: 0 };
  return {
    traitesEnTout: dernier.traitesEnTout,
    entree: dernier.entree,
    sortie: dernier.sortie,
  };
}
