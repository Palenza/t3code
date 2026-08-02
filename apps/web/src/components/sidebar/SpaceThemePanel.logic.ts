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
 * Tirer un rond fixe le RAYON COMMUN de tous et fait TOURNER l'anneau entier,
 * en CONSERVANT les écarts angulaires.
 *
 * ── ET LE 01/08 J'AI ÉCRIT L'INVERSE ────────────────────────────────────────
 *
 * J'avais cette mesure sous les yeux, et j'ai quand même ajouté deux choses
 * qu'elle ne disait pas, pour satisfaire au passage un vieux « à distance
 * égale ». Les deux étaient fausses, et Enzo les a vues du premier coup d'œil :
 *
 *  • un RÉ-ÉTALEMENT à angles égaux pendant le glissé. Le nuancier pose ses
 *    ronds par la COULEUR : un dégradé, c'est trois tons voisins, donc trois
 *    angles voisins (mesuré chez lui : 37° / 38° / 285°). Au premier glissé,
 *    mon code les projetait à 120° — le dégradé qu'il venait de choisir
 *    explosait. Sur 7 018 images de sa capture, ZÉRO ne respectait le
 *    120/120/120 que je croyais imposer.
 *  • un PLANCHER de rayon à 0,09. « Les points se réunissent en un seul quand
 *    ils sont pile poil au centre » — c'est la mécanique même : le rayon EST
 *    l'étalement du dégradé, et au centre il se referme en une couleur UNIE.
 *    Arc le fait (scan intégral : 13 fusions près du centre, 1 840 images à un
 *    seul rond, deux ronds encore distincts à 35,6 px quand j'en imposais 61).
 *    Mon plancher était un mur devant le geste.
 *
 * Ma mesure n'avait pas pu voir la fusion : j'avais filtré l'analyse sur « les
 * images à TROIS ronds détectés », et les images de la fusion en ont moins. Je
 * les avais exclues avant de regarder. Un filtre d'analyse est une hypothèse
 * déguisée — celui-ci excluait justement le phénomène cherché.
 *
 * Ce qui reste, donc, et rien de plus : rayon commun, écarts angulaires
 * conservés, rayon libre de zéro au bord. L'étalement des ronds ne se force
 * qu'à la POSE (`poserFigure`, `ajouterRond`) — là où le vrai défaut vivait
 * (« je ne peux pas rajouter trois points, le troisième naît sous les
 * autres »). On répare où ça casse, pas ailleurs.
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
 * Le rayon minimal d'un rond SEUL — repris de `wheelPositionOf`, qui borne
 * déjà la distance couleur↔position à [0,06 · 0,44]. Sans voisin, rien
 * d'autre ne contraint.
 */
export const RAYON_MINI = 0.06;

/**
 * LE RAYON DE L'ANNEAU REFERMÉ — assez petit pour se lire comme UN point,
 * jamais zéro.
 *
 * L'angle d'un rond est porté par sa POSITION : à rayon exactement nul, il
 * n'existe plus, et ressortir du centre ferait repartir tous les ronds du même
 * angle — le dégradé serait mort au premier aller-retour. On garde donc une
 * trace. 0,004 de toile = 1,4 css : deux ronds y sont à 2,8 css l'un de
 * l'autre sous des disques de 20 à 34 css. C'est un point, à l'œil comme au
 * pixel, et la mémoire des teintes survit.
 */
export const RAYON_REFERME = 0.004;

/**
 * Tailles MESURÉES des ronds, en css — `STOP_SIZES_PX` du panneau, et la
 * largeur de la toile qui les met à l'échelle de nos coordonnées 0..1.
 */
const DIAMETRES_CSS = [34, 20, 20] as const;
const TOILE_LARGEUR_CSS = 358;
/** Le vide qu'on exige entre deux BORDS de ronds pour qu'on les COMPTE encore. */
const VIDE_MINIMAL_CSS = 10;

/** L'écart centre-à-centre qu'il faut entre ces deux ronds, en fraction de toile. */
const ecartRequis = (i: number, j: number): number =>
  ((DIAMETRES_CSS[i] ?? 20) / 2 + (DIAMETRES_CSS[j] ?? 20) / 2 + VIDE_MINIMAL_CSS) /
  TOILE_LARGEUR_CSS;

/**
 * LE RAYON QUI REND UN ROND AJOUTÉ VISIBLE — et RIEN d'autre.
 *
 * Pour chaque paire, la corde 2·r·sin(Δ/2) doit dépasser la somme des deux
 * demi-diamètres plus un vide. On rend le plus exigeant de ces besoins.
 *
 * ⚠️ Ceci ne s'applique QU'À LA POSE d'un rond (ajout, préréglage), JAMAIS au
 * glissé. C'est la faute que j'ai commise le 01/08 : j'en avais fait un
 * plancher permanent, et il murait le geste (voir `deplacerFigure`).
 *
 * C'est aussi la vraie réponse au vieux reproche « je ne peux pas rajouter
 * trois points, le troisième naît sous les autres » : le défaut était à
 * l'AJOUT, pas au déplacement. On répare là où ça casse.
 */
export function rayonPourRendreVisible(angles: ReadonlyArray<number>): number {
  let besoin = RAYON_MINI;
  for (let i = 0; i < angles.length; i += 1) {
    for (let j = i + 1; j < angles.length; j += 1) {
      const brut = (((angles[j]! - angles[i]!) % TOUR) + TOUR) % TOUR;
      const corde = 2 * Math.sin(Math.min(brut, TOUR - brut) / 2);
      // Deux ronds au MÊME angle ne se sépareront jamais en poussant le
      // rayon : on demande le maximum, et c'est à la pose des angles de ne
      // pas les superposer.
      besoin = Math.max(besoin, corde < 1e-6 ? RAYON_MAXI : ecartRequis(i, j) / corde);
    }
  }
  return Math.min(RAYON_MAXI, besoin);
}

/** L'angle du plus grand vide angulaire — la place la plus loin de tous. */
function angleDuPlusGrandVide(angles: ReadonlyArray<number>): number {
  if (angles.length === 0) return ORIENTATION_DEFAUT;
  const tries = [...angles].map((a) => ((a % TOUR) + TOUR) % TOUR).sort((a, b) => a - b);
  let meilleur = tries[0]! + Math.PI;
  let plusGrand = -1;
  for (let i = 0; i < tries.length; i += 1) {
    const debut = tries[i]!;
    const fin = i + 1 < tries.length ? tries[i + 1]! : tries[0]! + TOUR;
    const vide = fin - debut;
    if (vide > plusGrand) {
      plusGrand = vide;
      meilleur = debut + vide / 2;
    }
  }
  return meilleur;
}

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

/**
 * LE DÉGRADÉ D'UNE PASTILLE DE NUANCIER — ce qui les fait ressembler à des
 * pierres plutôt qu'à des gommettes.
 *
 * Comparaison à 2× des deux nuanciers, sur les captures du 02/08 : chez Arc
 * chaque pastille est un DISQUE EN DÉGRADÉ (crème→blanc, orange→magenta,
 * or→jaune→orange) avec un liseré plus sombre ; chez nous c'étaient des
 * aplats à bord net. Une couleur unie dit « voici un code hexadécimal » ; un
 * disque qui module dit « voici une matière ».
 *
 * On dérive les deux bouts de la couleur elle-même — teinte tournée de ±12°,
 * clarté de ±7 — plutôt que d'inventer une seconde couleur par pastille : les
 * 45 tons du nuancier sont RELEVÉS sur Arc, et une valeur inventée à côté
 * d'une valeur mesurée finirait par passer pour mesurée.
 */
export function degradeDePastille(hex: string): readonly [string, string] {
  const { h, s, l } = hexToHsl(hex);
  return [
    hslToHex(h - 12, s, Math.min(100, l + 7)),
    hslToHex(h + 12, s, Math.max(0, l - 7)),
  ] as const;
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
  const rayon = rayonDe(points);
  return points.map((point) => surLeCercle(angleDe(point), rayon));
}

/** L'orientation de la figure : l'angle de la dominante autour du centre. */
export function orientationDe(points: ReadonlyArray<Point>): number {
  const dominante = points[0];
  return dominante === undefined ? ORIENTATION_DEFAUT : angleDe(dominante);
}

/**
 * LE GLISSÉ, tel qu'Arc le fait — et cette fois tel que je l'avais MESURÉ.
 *
 * Tirer un rond vers (x, y) fixe le RAYON COMMUN de tous et fait TOURNER
 * l'anneau entier. Les écarts angulaires sont CONSERVÉS : c'est littéralement
 * ce que disaient mes 672 images d'Arc (60,0° ± 0,6 / 149,3° ± 0,8 /
 * 150,7° ± 0,6, immobiles pendant que le rayon quadruplait).
 *
 * Le 01/08 j'ai écrit l'inverse — un ré-étalement à angles égaux — parce que
 * je voulais aussi satisfaire un vieux « à distance égale ». Résultat : au
 * premier glissé, le dégradé qu'on venait de choisir dans le nuancier EXPLOSE,
 * ses trois tons voisins étant projetés à 120° l'un de l'autre. Mesuré chez
 * Enzo le 02/08 : zéro image sur 7 018 ne respectait mon propre 120/120/120,
 * parce que le nuancier pose ses ronds par la COULEUR. J'avais la mesure et je
 * l'ai recouverte par mon idée.
 *
 * ET LE RAYON DESCEND JUSQU'À ZÉRO. « Les points se réunissent en un seul
 * quand ils sont pile poil au centre » (Enzo, 02/08) — c'est la MÉCANIQUE, pas
 * un défaut : le rayon est l'étalement du dégradé, et au centre il se referme
 * en une couleur UNIE. Arc fait exactement ça (scan intégral : 13 fusions près
 * du centre, 1 840 images à un seul rond à moins de 70 px, et deux ronds
 * encore distincts à 35,6 px quand mon plancher en imposait 61). Un plancher
 * ici, c'est un mur devant le geste.
 */
export function deplacerFigure(points: ReadonlyArray<Point>, x: number, y: number): Point[] {
  if (points.length === 0) return [];
  const dx = x - CENTRE;
  const dy = y - CENTRE;
  const vise = Math.hypot(dx, dy);
  // Au centre PILE, le doigt ne désigne aucune direction : on garde celle
  // qu'on avait plutôt que de faire sauter la figure sur un angle nul.
  const rotation = vise < 1e-9 ? 0 : Math.atan2(dy, dx) - angleDe(points[0]!);
  const rayon = Math.min(RAYON_MAXI, Math.max(RAYON_REFERME, vise));
  return points.map((point) => surLeCercle(angleDe(point) + rotation, rayon));
}

/**
 * Ajoute un rond dans le plus grand VIDE angulaire — la place la plus éloignée
 * de tous les autres. Les ronds déjà là ne bougent pas d'un angle.
 *
 * C'est ICI, et seulement ici, que le rayon est poussé pour que le nouveau se
 * VOIE : c'était le vrai « je ne peux pas rajouter trois points, le troisième
 * naît sous les autres ». Si l'anneau était refermé au centre, l'ajout le
 * rouvre juste assez.
 */
export function ajouterRond(points: ReadonlyArray<Point>, max: number): Point[] {
  if (points.length === 0) return [surLeCercle(ORIENTATION_DEFAUT, RAYON_DEFAUT)];
  if (points.length >= max) return [...points];
  const angles = [...points.map(angleDe), angleDuPlusGrandVide(points.map(angleDe))];
  const rayon = Math.max(rayonDe(points), rayonPourRendreVisible(angles));
  return angles.map((angle) => surLeCercle(angle, rayon));
}

/** Retire le dernier rond. Les rescapés gardent leur angle ET leur rayon. */
export function retirerRond(points: ReadonlyArray<Point>): Point[] {
  if (points.length <= 1) return [...points];
  return points.slice(0, -1).map((point) => ({ ...point }));
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
  const angles = Array.from(
    { length: Math.max(1, count) },
    (_, index) => angle + (TOUR * index) / Math.max(1, count),
  );
  // Une figure NEUVE s'étale : c'est la pose, donc les ronds doivent tous se
  // voir. Le glissé, lui, pourra la refermer jusqu'à l'uni.
  const rayon = Math.max(Math.min(RAYON_MAXI, vise), rayonPourRendreVisible(angles));
  return angles.map((valeur) => surLeCercle(valeur, rayon));
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
