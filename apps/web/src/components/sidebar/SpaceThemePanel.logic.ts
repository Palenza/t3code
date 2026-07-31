import type { SidebarThemeStop } from "../../sidebarThemeStore";

/**
 * La géométrie de la toile de l'éditeur de thème — sortie du composant pour
 * être TESTABLE, parce qu'elle porte un invariant qu'on ne veut plus jamais
 * casser :
 *
 *   LES RONDS SONT TOUJOURS À DISTANCE ÉGALE LES UNS DES AUTRES.
 *
 * L'implémentation précédente posait les ronds sur un RAYON COMMUN autour du
 * centre de la toile, chacun gardant son angle propre. Conséquence : dès que
 * la dominante s'approchait du centre, le rayon tombait et les trois ronds se
 * SUPERPOSAIENT — d'où « je ne peux pas rajouter trois points » (le troisième
 * naissait sous les autres) et « les points ne sont pas à distance égale ».
 *
 * Le modèle ici est le seul qui rende l'invariant vrai PARTOUT : les ronds
 * forment une FIGURE RIGIDE — un point, un segment, ou un triangle
 * ÉQUILATÉRAL de côté ÉCART_RONDS. Glisser la TRANSLATE (les distances sont
 * invariantes par translation, gratuitement) ; promouvoir un satellite ne
 * fait que permuter les rôles (un triangle équilatéral vu depuis n'importe
 * lequel de ses sommets reste équilatéral) ; retirer un rond en enlève un.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * L'écart CONSTANT entre deux ronds voisins, en fraction de toile.
 *
 * Reçu : la toile mesure 358 × 372 css ; la dominante fait 34 css et les
 * satellites 20 (STOP_SIZES_PX, mesurés). 0,2 → 71,6 css à l'horizontale,
 * 74,4 à la verticale, soit ~44 css de vide entre les BORDS de deux ronds :
 * assez pour qu'un rond ajouté se voie immédiatement, assez peu pour que le
 * triangle complet tienne dans la toile avec ses marges (0,2 × √3/2 = 0,173
 * de hauteur, contre 0,88 disponible).
 */
export const ECART_RONDS = 0.2;

/**
 * La marge que la figure ne franchit pas : un rond de 34 css sur 358 fait
 * 0,095 de large, soit 0,048 de demi-largeur. 0,06 laisse le rond entier
 * visible, bord compris.
 */
const MARGE = 0.06;

/** Orientation de départ quand rien ne la dicte : vers le bas-droite. */
const ORIENTATION_DEFAUT = Math.PI / 4;

const TIERS_DE_TOUR = Math.PI / 3;

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

/** De combien translater un axe pour que [min, max] rentre dans les marges. */
function recalageAxe(min: number, max: number): number {
  const bas = MARGE;
  const haut = 1 - MARGE;
  // Figure plus large que la toile (impossible aux tailles actuelles, mais
  // une limite silencieuse est pire que pas de limite) : on la CENTRE.
  if (max - min > haut - bas) return (bas + haut) / 2 - (min + max) / 2;
  if (min < bas) return bas - min;
  if (max > haut) return haut - max;
  return 0;
}

/**
 * Ramène la figure entière dans la toile SANS jamais la déformer : une seule
 * translation pour tout le monde, donc toutes les distances survivent.
 */
export function recaler(points: ReadonlyArray<Point>): Point[] {
  if (points.length === 0) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const dx = recalageAxe(Math.min(...xs), Math.max(...xs));
  const dy = recalageAxe(Math.min(...ys), Math.max(...ys));
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

/** L'orientation actuelle de la figure : l'angle dominante → premier satellite. */
export function orientationDe(points: ReadonlyArray<Point>): number {
  const dominante = points[0];
  const satellite = points[1];
  if (dominante === undefined || satellite === undefined) return ORIENTATION_DEFAUT;
  const angle = Math.atan2(satellite.y - dominante.y, satellite.x - dominante.x);
  return Number.isFinite(angle) ? angle : ORIENTATION_DEFAUT;
}

/** La distance d'un point au centre de la toile — plus c'est loin, plus c'est PÂLE. */
const distanceAuCentre = (point: Point) => Math.hypot(point.x - 0.5, point.y - 0.5);

const sommet = (depuis: Point, angle: number): Point => ({
  x: depuis.x + Math.cos(angle) * ECART_RONDS,
  y: depuis.y + Math.sin(angle) * ECART_RONDS,
});

/**
 * Translate toute la figure pour que la dominante vise (x, y). C'est le
 * glissé : ratio de déplacement satellite/dominante = 1 exactement (mesure
 * du 30/07 : médiane 0,98 sur 244 relevés), et les écarts entre ronds ne
 * bougent pas d'un pixel.
 */
export function deplacerFigure(points: ReadonlyArray<Point>, x: number, y: number): Point[] {
  const dominante = points[0];
  if (dominante === undefined) return recaler([{ x, y }]);
  const dx = x - dominante.x;
  const dy = y - dominante.y;
  return recaler(points.map((point) => ({ x: point.x + dx, y: point.y + dy })));
}

/**
 * Ajoute un rond à ÉCART_RONDS de tous les autres, du côté qui S'ÉLOIGNE du
 * centre — donc sur un ton plus PÂLE (la roue s'éclaircit vers le bord).
 * C'est la demande fondateur : « en rajoutant un point, ça garde le plus
 * blanc ». Le dégradé va du franc au clair, comme les préréglages.
 */
export function ajouterRond(points: ReadonlyArray<Point>, max: number): Point[] {
  const dominante = points[0];
  if (dominante === undefined) return recaler([{ x: 0.5, y: 0.5 }]);
  if (points.length >= max) return [...points];

  if (points.length === 1) {
    // Vers l'extérieur : l'angle centre → dominante. Au centre pile, la
    // direction n'existe pas ; on prend l'orientation par défaut.
    const angle =
      distanceAuCentre(dominante) < 1e-6
        ? ORIENTATION_DEFAUT
        : Math.atan2(dominante.y - 0.5, dominante.x - 0.5);
    return recaler([dominante, sommet(dominante, angle)]);
  }

  // Le troisième sommet du triangle équilatéral : ±60° du côté déjà occupé.
  // Des deux candidats possibles, on garde le PLUS ÉLOIGNÉ du centre — le
  // plus pâle, toujours la même règle.
  const base = orientationDe(points);
  const candidats = [
    sommet(dominante, base + TIERS_DE_TOUR),
    sommet(dominante, base - TIERS_DE_TOUR),
  ];
  const troisieme =
    distanceAuCentre(candidats[0]!) >= distanceAuCentre(candidats[1]!)
      ? candidats[0]!
      : candidats[1]!;
  return recaler([...points, troisieme]);
}

/** Retire le dernier satellite. Les rescapés n'ont pas bougé — donc l'écart tient. */
export function retirerRond(points: ReadonlyArray<Point>): Point[] {
  if (points.length <= 1) return [...points];
  return points.slice(0, -1);
}

/**
 * Pose une figure NEUVE de `count` ronds ancrée sur (x, y) — le clic sur une
 * pastille du nuancier. Orientée vers l'extérieur : les ronds ajoutés sont
 * les plus pâles.
 */
export function poserFigure(x: number, y: number, count: number): Point[] {
  const ancre = { x, y };
  let points: Point[] = [ancre];
  while (points.length < count) {
    points = ajouterRond(points, count);
  }
  return recaler(points);
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
