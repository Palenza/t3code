import type { SidebarThemeStop } from "../../sidebarThemeStore";

/**
 * La géométrie de la toile de l'éditeur de thème — sortie du composant pour
 * être TESTABLE, parce qu'elle porte un invariant qu'on ne veut plus jamais
 * casser :
 *
 *   LES RONDS SONT TOUJOURS À DISTANCE ÉGALE LES UNS DES AUTRES.
 *
 * ── CE QUE LA MESURE A TRANCHÉ, le 01/08 ────────────────────────────────────
 *
 * Deux modèles se sont succédé ici, et les DEUX étaient faux :
 *
 *  1. Rayon commun, chacun gardant son angle propre. Au centre, le rayon
 *     tombait et les ronds se SUPERPOSAIENT — « je ne peux pas rajouter trois
 *     points », « les points ne sont pas à distance égale ». Il manquait un
 *     PLANCHER de rayon ; on a jeté le modèle au lieu de poser le plancher.
 *  2. Figure RIGIDE translatée. L'invariant devenait vrai partout, mais le
 *     glissé ne ressemblait plus à Arc du tout : chaque rond finissait à une
 *     distance différente du centre, donc à une vivacité différente, et le
 *     thème se délitait à mesure qu'on le déplaçait.
 *
 * Reçu (enregistrement Arc du 31/07, 120 fps, décortiqué le 01/08) :
 *
 *   • 300 images d'un glissé à 2 ronds : le milieu des deux reste à
 *     (339,96 ± 1,05 · 337,21 ± 0,58) px sur une toile de 680 — le CENTRE.
 *     Ratio de déplacement de l'autre rond : −0,95 en x, −1,00 en y. Ils vont
 *     à l'OPPOSÉ. La mesure du 30/07 avait lu 0,98 et conclu « ratio 1 » :
 *     elle avait la magnitude et lui manquait le SIGNE.
 *   • 672 images d'un glissé à 3 ronds : les trois rayons ne s'écartent que de
 *     1,5 % (médiane) les uns des autres pendant que le rayon lui-même balaie
 *     62 → 287 px ; les trois écarts angulaires tiennent à 60,0° ± 0,6 /
 *     149,3° ± 0,8 / 150,7° ± 0,6, somme 360,0°.
 *
 * LA LOI D'ARC, donc : les ronds vivent sur un CERCLE centré sur la toile.
 * Tirer un rond fixe le RAYON COMMUN de tous et fait TOURNER l'anneau entier.
 *
 * On la reprend telle quelle, avec les deux pièces qui manquaient au modèle 1 :
 * un PLANCHER de rayon (Arc ne descend pas sous 62/680 = 0,09), et des ronds
 * ÉGALEMENT RÉPARTIS en angle. Également répartis sur un cercle, ils forment
 * un polygone RÉGULIER : l'invariant « à distance égale » est vrai à tous les
 * rayons, gratuitement. Ce que le rayon change, c'est la TAILLE du polygone —
 * près du centre les couleurs sont vives et proches, au bord elles sont pâles
 * et écartées. C'est exactement ce que fait Arc, et c'est un seul geste pour
 * deux réglages.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Le centre de la toile — le point autour duquel TOUT tourne ici. */
const CENTRE = 0.5;

/**
 * La marge que la figure ne franchit pas : un rond de 34 css sur 358 fait
 * 0,095 de large, soit 0,048 de demi-largeur. 0,06 laisse le rond entier
 * visible, bord compris.
 */
const MARGE = 0.06;

/**
 * LE PLANCHER DE RAYON — la pièce qui manquait au premier modèle.
 *
 * Reçu : sur 672 images de glissé à trois ronds, le rayon d'Arc balaie 62 à
 * 287 px sur une toile de 680, soit 0,09 à 0,42. À 62 px les deux ronds les
 * plus proches sont à 61 px l'un de l'autre et leurs anneaux se FRÔLENT sans
 * jamais fusionner (image 11 317, regardée).
 *
 * Chez nous à 0,09, trois ronds également répartis sont à 2 × 0,09 × sin 60°
 * = 0,156 de toile, soit 56 css pour des satellites de 20 : 36 css de vide
 * entre les bords. C'est le fil-piège — posé là où seul l'effondrement le
 * touche, jamais un geste sain.
 */
export const RAYON_MINI = 0.09;

/** Le plafond : au-delà, un rond sortirait de la toile. Arc mesure 0,42. */
export const RAYON_MAXI = CENTRE - MARGE;

/** Le rayon d'une figure NEUVE, entre les deux — thème franc, ronds lisibles. */
export const RAYON_DEFAUT = 0.24;

/** Orientation de départ quand rien ne la dicte : vers le bas-droite. */
const ORIENTATION_DEFAUT = Math.PI / 4;

const TOUR = Math.PI * 2;

/** Le rayon d'un point, borné aux limites de la toile. */
const rayonBorne = (rayon: number): number => Math.min(RAYON_MAXI, Math.max(RAYON_MINI, rayon));

/** L'angle d'un point autour du centre. Au centre pile, la direction n'existe
 * pas : on rend l'orientation par défaut plutôt qu'un zéro qui se ferait
 * passer pour une mesure. */
const angleDe = (point: Point): number => {
  const dx = point.x - CENTRE;
  const dy = point.y - CENTRE;
  if (Math.hypot(dx, dy) < 1e-9) return ORIENTATION_DEFAUT;
  return Math.atan2(dy, dx);
};

/** Le rayon commun de la figure : celui de la dominante, borné. */
const rayonDe = (points: ReadonlyArray<Point>): number => {
  const dominante = points[0];
  if (dominante === undefined) return RAYON_DEFAUT;
  return rayonBorne(Math.hypot(dominante.x - CENTRE, dominante.y - CENTRE));
};

/** Le point du cercle à cet angle et ce rayon. */
const surLeCercle = (angle: number, rayon: number): Point => ({
  x: CENTRE + Math.cos(angle) * rayon,
  y: CENTRE + Math.sin(angle) * rayon,
});

/**
 * `count` ronds ÉGALEMENT répartis sur le cercle, le premier à `angle`.
 * Également répartis sur un cercle = polygone régulier = tous à distance
 * égale, à n'importe quel rayon. L'invariant n'est plus quelque chose qu'on
 * maintient, c'est une conséquence de la forme.
 */
const anneauRegulier = (angle: number, rayon: number, count: number): Point[] =>
  Array.from({ length: Math.max(1, count) }, (_, index) =>
    surLeCercle(angle + (TOUR * index) / Math.max(1, count), rayon),
  );

// ------------------------------------------------------------------ couleur
// LA ROUE INVISIBLE (10 761 frames, mesure du 29/07) : teinte = angle autour
// du centre (hue ≈ angle − 5°), pleine au centre, PÂLE AU BORD.

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

/** La couleur de la roue à une position de toile. */
export function wheelColorAt(x: number, y: number): string {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const hue = (Math.atan2(dy, dx) * 180) / Math.PI - 5;
  const dist = Math.hypot(dx, dy);
  const light = Math.min(86, 42 + dist * 75);
  const sat = Math.max(55, 95 - dist * 55);
  return hslToHex(hue, sat, light);
}

/** L'inverse : où poser un rond pour obtenir (au plus près) cette couleur. */
export function wheelPositionOf(hex: string): Point {
  const { h, l } = hexToHsl(hex);
  const angle = ((h + 5) * Math.PI) / 180;
  const distFromLight = (Math.min(86, Math.max(42, l)) - 42) / 75;
  const dist = Math.min(0.44, Math.max(0.06, distFromLight));
  return {
    x: 0.5 + Math.cos(angle) * dist,
    y: 0.5 + Math.sin(angle) * dist,
  };
}

// ------------------------------------------------------------------ figure

/**
 * Ramène les ronds sur l'anneau régulier le plus proche de ce qu'ils sont.
 *
 * C'est aussi la MIGRATION des thèmes enregistrés sous l'ancien modèle : leurs
 * ronds sont à des rayons quelconques, on les remet sur un cercle commun sans
 * changer l'orientation de la dominante — la teinte principale du thème
 * survit, seule la cohérence revient.
 */
export function recaler(points: ReadonlyArray<Point>): Point[] {
  if (points.length === 0) return [];
  return anneauRegulier(angleDe(points[0]!), rayonDe(points), points.length);
}

/** L'orientation de la figure : l'angle de la dominante autour du centre. */
export function orientationDe(points: ReadonlyArray<Point>): number {
  const dominante = points[0];
  return dominante === undefined ? ORIENTATION_DEFAUT : angleDe(dominante);
}

/**
 * LE GLISSÉ, tel qu'Arc le fait (mesuré : voir l'en-tête du fichier).
 *
 * Tirer un rond vers (x, y) fixe le RAYON COMMUN de tous les ronds et fait
 * TOURNER l'anneau entier pour que la dominante vise le doigt. Les écarts
 * angulaires ne changent jamais ; le rayon, lui, change tout le temps — et
 * c'est le sujet : près du centre le thème est vif et resserré, au bord il est
 * pâle et écarté.
 *
 * Le rayon est BORNÉ des deux côtés. Le plancher est ce qui manquait à la
 * première version : sans lui, viser le centre écrase l'anneau et les ronds se
 * superposent.
 */
export function deplacerFigure(points: ReadonlyArray<Point>, x: number, y: number): Point[] {
  if (points.length === 0) return [];
  const dx = x - CENTRE;
  const dy = y - CENTRE;
  const vise = Math.hypot(dx, dy);
  // Au centre PILE, le doigt ne désigne aucune direction : on garde celle
  // qu'on avait plutôt que de faire sauter la figure sur un angle nul.
  const angle = vise < 1e-9 ? angleDe(points[0]!) : Math.atan2(dy, dx);
  return anneauRegulier(angle, rayonBorne(vise), points.length);
}

/**
 * Ajoute un rond : l'anneau se REDISTRIBUE à N+1, même rayon, même orientation
 * de dominante.
 *
 * Sous l'ancien modèle il fallait choisir où poser le nouveau et vérifier
 * qu'il ne naissait pas sous les autres (« je ne peux pas rajouter trois
 * points »). Ici la question ne se pose plus : N+1 points également répartis
 * sur un cercle sont à distance égale par construction, et le plancher de
 * rayon garantit que cette distance reste visible.
 */
export function ajouterRond(points: ReadonlyArray<Point>, max: number): Point[] {
  if (points.length === 0) return anneauRegulier(ORIENTATION_DEFAUT, RAYON_DEFAUT, 1);
  if (points.length >= max) return [...points];
  return anneauRegulier(angleDe(points[0]!), rayonDe(points), points.length + 1);
}

/** Retire un rond : l'anneau se redistribue à N−1, rayon et orientation gardés. */
export function retirerRond(points: ReadonlyArray<Point>): Point[] {
  if (points.length <= 1) return [...points];
  return anneauRegulier(angleDe(points[0]!), rayonDe(points), points.length - 1);
}

/**
 * Pose une figure NEUVE de `count` ronds dont la dominante vise (x, y) — le
 * clic sur une pastille du nuancier. Le rayon vient de (x, y) : choisir une
 * couleur pâle du nuancier pose un anneau large, une couleur franche un
 * anneau serré. La pastille cliquée reste la dominante.
 */
export function poserFigure(x: number, y: number, count: number): Point[] {
  const dx = x - CENTRE;
  const dy = y - CENTRE;
  const vise = Math.hypot(dx, dy);
  const angle = vise < 1e-9 ? ORIENTATION_DEFAUT : Math.atan2(dy, dx);
  return anneauRegulier(angle, rayonBorne(vise), count);
}

// ------------------------------------------------------- points ↔ pastilles

/** Les pastilles à ces positions, la COULEUR relue sur la roue. */
export function stopsDepuisPoints(points: ReadonlyArray<Point>): SidebarThemeStop[] {
  return points.map((point) => ({ color: wheelColorAt(point.x, point.y), x: point.x, y: point.y }));
}

/**
 * Les pastilles à ces positions en GARDANT leurs couleurs — le nuancier pose
 * la couleur EXACTE de la pastille cliquée (choisir le jaune donne le jaune,
 * pas son approximation par la roue). Les couleurs manquantes sont relues
 * sur la roue.
 */
export function stopsAvecCouleurs(
  points: ReadonlyArray<Point>,
  couleurs: ReadonlyArray<string>,
): SidebarThemeStop[] {
  return points.map((point, index) => ({
    color: couleurs[index] ?? wheelColorAt(point.x, point.y),
    x: point.x,
    y: point.y,
  }));
}
