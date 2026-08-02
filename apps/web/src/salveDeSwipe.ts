import { deciderLAxe } from "./swipeEspaces";

/**
 * LA SALVE DE SWIPE, réécrite de zéro — ordre fondateur du 02/08 : « la barre
 * latérale bugue toujours quand je swipe, corrige, on repart de 0. »
 *
 * L'ancien geste vivait dans le composant, éclaté en SEPT refs (accumulateur,
 * verrou, pic, silence, settle, temps-mort, axe) posées par quatre correctifs
 * successifs. Chaque correctif réparait son symptôme et ajoutait un état ; le
 * dernier a tué le geste : une salve jugée « verticale » n'était REMISE À
 * ZÉRO par aucun chemin — ni minuteur (armé seulement en branche
 * horizontale), ni silence (armé seulement après un basculement). Un seul
 * défilement vertical, et le swipe était mort jusqu'au redémarrage. C'est le
 * bug qu'Enzo voyait, et aucun des sept états ne le montrait.
 *
 * Ici : UNE machine à états pure, cinq phases, deux entrées (un évènement,
 * le silence), zéro minuterie interne. Le composant possède le SEUL minuteur
 * (rearmé à chaque évènement) et appelle `surSilence` quand le trackpad se
 * tait — le silence ramène TOUTES les phases au repos, il ne peut plus
 * exister d'état sans porte de sortie. Chaque règle conservée ici vient d'une
 * mesure :
 *
 *   · l'axe se décide UNE fois par salve, sur les cumuls (budget 24 px) —
 *     sinon la barre vibre au défilement diagonal (mesuré le 01/08) ;
 *   · après un basculement, la TRAÎNE d'inertie est avalée jusqu'au silence,
 *     et seul un évènement dépassant PIC × 0,9 + 2 rouvre une salve — une
 *     traîne ne dépasse jamais le pic du geste qui l'a produite (mesuré le
 *     01/08 : les pentes, elles, ondulent) ;
 *   · le seuil est FIGÉ au premier évènement de la salve : un geste commencé
 *     sur la barre reste jugé aux conditions de la barre.
 */

export type SortieDeSalve =
  | { readonly type: "rien" }
  | { readonly type: "suivre"; readonly accumule: number }
  | { readonly type: "retomber" }
  | { readonly type: "traverser"; readonly versLaDroite: 1 | -1 };

export type EtatSalve =
  | { readonly phase: "repos" }
  | {
      readonly phase: "indecis";
      readonly cumulH: number;
      readonly cumulV: number;
      readonly accumule: number;
      readonly pic: number;
      readonly seuil: number;
    }
  | {
      readonly phase: "horizontale";
      readonly accumule: number;
      readonly pic: number;
      readonly seuil: number;
    }
  | { readonly phase: "verticale" }
  | { readonly phase: "traine"; readonly pic: number };

export const SALVE_AU_REPOS: EtatSalve = { phase: "repos" };

/** Durée sans le moindre évènement au-delà de laquelle la salve est finie. */
export const SILENCE_FIN_DE_SALVE_MS = 120;

const RIEN: SortieDeSalve = { type: "rien" };

/** Un évènement d'amplitude comparable au pic est un DOIGT, pas une traîne. */
const doigtRepart = (amplitude: number, pic: number): boolean => amplitude > pic * 0.9 + 2;

function jugerLIndecision(
  etat: Extract<EtatSalve, { phase: "indecis" }>,
): [EtatSalve, SortieDeSalve] {
  const axe = deciderLAxe({ horizontal: etat.cumulH, vertical: etat.cumulV });
  if (axe === "vertical") {
    return [{ phase: "verticale" }, RIEN];
  }
  if (axe === "horizontal") {
    return avancer({
      phase: "horizontale",
      accumule: etat.accumule,
      pic: etat.pic,
      seuil: etat.seuil,
    });
  }
  return [etat, RIEN];
}

function avancer(etat: Extract<EtatSalve, { phase: "horizontale" }>): [EtatSalve, SortieDeSalve] {
  if (Math.abs(etat.accumule) < etat.seuil) {
    return [etat, { type: "suivre", accumule: etat.accumule }];
  }
  // Défilement naturel macOS : les doigts vers la DROITE font un deltaX
  // NÉGATIF. La sortie porte le sens PHYSIQUE du geste, pas le signe brut.
  return [
    { phase: "traine", pic: etat.pic },
    { type: "traverser", versLaDroite: etat.accumule < 0 ? 1 : -1 },
  ];
}

export function surEvenement(
  etat: EtatSalve,
  deltaX: number,
  deltaY: number,
  seuil: number,
): [EtatSalve, SortieDeSalve] {
  const amplitude = Math.abs(deltaX);
  switch (etat.phase) {
    case "repos":
      return jugerLIndecision({
        phase: "indecis",
        cumulH: amplitude,
        cumulV: Math.abs(deltaY),
        accumule: deltaX,
        pic: amplitude,
        seuil,
      });
    case "indecis":
      return jugerLIndecision({
        ...etat,
        cumulH: etat.cumulH + amplitude,
        cumulV: etat.cumulV + Math.abs(deltaY),
        accumule: etat.accumule + deltaX,
        pic: Math.max(etat.pic, amplitude),
      });
    case "horizontale":
      return avancer({
        ...etat,
        accumule: etat.accumule + deltaX,
        pic: Math.max(etat.pic, amplitude),
      });
    case "verticale":
      // La salve appartient au défilement : on avale jusqu'au SILENCE — qui,
      // lui, ramène toujours au repos. C'est la porte de sortie qui manquait.
      return [etat, RIEN];
    case "traine":
      if (doigtRepart(amplitude, etat.pic)) {
        // Un nouveau doigt pendant la traîne : salve neuve, à partir de CET
        // évènement — c'est ce qui permet d'enchaîner deux swipes francs.
        return surEvenement(SALVE_AU_REPOS, deltaX, deltaY, seuil);
      }
      return [{ phase: "traine", pic: Math.max(etat.pic, amplitude) }, RIEN];
  }
}

/** Le silence clôt la salve, QUELLE QU'ELLE SOIT, et rend au repos. */
export function surSilence(etat: EtatSalve): [EtatSalve, SortieDeSalve] {
  const doitRetomber =
    (etat.phase === "horizontale" || etat.phase === "indecis") && etat.accumule !== 0;
  return [SALVE_AU_REPOS, doitRetomber ? { type: "retomber" } : RIEN];
}
