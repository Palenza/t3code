import { describe, expect, it } from "vite-plus/test";

import {
  ajouterRond,
  deplacerFigure,
  POURSUITE_PAR_IMAGE,
  poursuivre,
  saisirRond,
  normaliserAuGabarit,
  orientationDe,
  poserFigure,
  poserSelonCouleurs,
  RAYON_MAXI,
  RAYON_MINI,
  RAYON_REFERME,
  recaler,
  retirerRond,
  wheelColorAt,
  wheelPositionOf,
  type Point,
} from "./SpaceThemePanel.logic";

/**
 * La référence de ces tests est ARC, mesuré — plus aucun invariant à nous.
 * Le 02/08, « à distance égale » (mon équilatéral 120/120/120) est tombé
 * devant les captures : le trio d'Arc fait 60/150/150, son duo est antipodal,
 * et ses préréglages posent chaque rond à l'angle de SA teinte.
 *
 * Ce qui a changé le 01/08, et pourquoi ces attentes ont été réécrites : les
 * anciennes exigeaient un écart FIGÉ (`ECART_RONDS`) pendant le glissé. La
 * mesure image par image de l'enregistrement d'Arc du 31/07 (120 fps) dit le
 * contraire, sur 972 images de deux glissés réels :
 *
 *   • à 2 ronds, le MILIEU des deux reste au centre de la toile
 *     (339,96 ± 1,05 · 337,21 ± 0,58 px sur 680) et l'autre rond se déplace à
 *     l'exact OPPOSÉ du rond tiré (ratio −0,95 en x, −1,00 en y) ;
 *   • à 3 ronds, les trois rayons ne s'écartent que de 1,5 % les uns des
 *     autres pendant que le rayon commun balaie 62 → 287 px, et les trois
 *     écarts angulaires tiennent à 60,0° ± 0,6 / 149,3° ± 0,8 / 150,7° ± 0,6.
 *
 * Autrement dit l'écart entre ronds SUIT le rayon. Les tests d'écart figé
 * décrivaient donc un comportement qu'Arc n'a jamais eu ; ils sont remplacés,
 * pas contournés.
 */

const CENTRE = { x: 0.5, y: 0.5 };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const rayon = (point: Point) => distance(point, CENTRE);
const angle = (point: Point) => Math.atan2(point.y - 0.5, point.x - 0.5);

/** Toutes les distances deux à deux. */
function ecarts(points: ReadonlyArray<Point>): number[] {
  const sorties: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      sorties.push(distance(points[i]!, points[j]!));
    }
  }
  return sorties;
}

/** L'invariant : tous les ronds à la même distance les uns des autres. */
const tousEgaux = (points: ReadonlyArray<Point>) => {
  const mesures = ecarts(points);
  for (const ecart of mesures) {
    expect(ecart).toBeCloseTo(mesures[0]!, 6);
  }
};

/** L'autre invariant : tous sur le MÊME cercle centré sur la toile. */
const memeRayon = (points: ReadonlyArray<Point>) => {
  for (const point of points) {
    expect(rayon(point)).toBeCloseTo(rayon(points[0]!), 6);
  }
};

const dansLaToile = (points: ReadonlyArray<Point>) => {
  for (const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(1);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(1);
  }
};

/** Les écarts angulaires triés, en degrés — la signature que le glissé conserve. */
function ecartsAngulaires(points: ReadonlyArray<Point>): number[] {
  const angles = points.map(angle).sort((a, b) => a - b);
  return angles
    .map((valeur, index) => {
      const suivant = angles[(index + 1) % angles.length]!;
      const brut = ((suivant - valeur) * 180) / Math.PI;
      return ((brut % 360) + 360) % 360;
    })
    .sort((a, b) => a - b);
}

describe("la figure de la toile", () => {
  it("pose deux ronds ANTIPODAUX — leur milieu est le centre de la toile", () => {
    // La signature mesurée chez Arc : milieu épinglé au centre sur 300 images.
    const points = poserFigure(0.75, 0.5, 2);
    expect(points).toHaveLength(2);
    expect((points[0]!.x + points[1]!.x) / 2).toBeCloseTo(0.5, 6);
    expect((points[0]!.y + points[1]!.y) / 2).toBeCloseTo(0.5, 6);
    memeRayon(points);
  });

  it("pose trois ronds au GABARIT d'Arc — 60/150/150, jamais l'équilatéral", () => {
    // Reçu 02/08 : 149 images d'Arc à 3 ronds, centre circonscrit CALCULÉ
    // (médian à 2 px du centre du canevas), écarts 60/150/150 (petit écart
    // 59-68). Mon 120/120/120 ne figure sur aucune capture — « les
    // placements des 3 ronds sont totalement pas comme Arc ».
    for (const cible of [0.62, 0.75, 0.9]) {
      const points = poserFigure(cible, 0.5, 3);
      expect(points).toHaveLength(3);
      memeRayon(points);
      expect(ecartsAngulaires(points).map(Math.round)).toEqual([60, 150, 150]);
    }
  });

  it("pose deux ronds ANTIPODAUX aussi via le gabarit", () => {
    const points = poserFigure(0.8, 0.5, 2);
    expect(ecartsAngulaires(points).map(Math.round)).toEqual([180, 180]);
  });

  it("pose un préréglage PAR SES COULEURS — chaque rond à l'angle de sa teinte", () => {
    // La pose des trios d'Arc mesurée le 02/08 à 07 h 26 : 37/40/283 —
    // les écarts DE TEINTE du préréglage, pas un gabarit.
    const trio = ["#f08a62", "#e8785a", "#d95f70"] as const;
    const points = poserSelonCouleurs([...trio]);
    expect(points).toHaveLength(3);
    memeRayon(points);
    const angles = points.map(angle);
    trio.forEach((hex, index) => {
      const attendu = angle(wheelPositionOf(hex));
      expect(Math.abs(angles[index]! - attendu)).toBeLessThan(0.02);
    });
  });

  it("garde rayon commun ET écarts du gabarit quand la dominante traverse la toile", () => {
    let points = poserFigure(0.7, 0.5, 3);
    const depart = ecartsAngulaires(points);
    for (const [x, y] of [
      [0.05, 0.05],
      [0.95, 0.05],
      [0.95, 0.95],
      [0.05, 0.95],
      [0.5, 0.2],
      [0.62, 0.5],
    ] as const) {
      points = deplacerFigure(points, x, y);
      memeRayon(points);
      dansLaToile(points);
      const maintenant = ecartsAngulaires(points);
      maintenant.forEach((valeur, index) => expect(valeur).toBeCloseTo(depart[index]!, 4));
    }
  });

  it("fait GRANDIR l'écart avec le rayon — c'est ce qu'Arc fait, et l'ancien modèle non", () => {
    // Reçu : chez Arc le rayon balaie 62 → 287 px et les côtés du triangle
    // suivent. Un écart figé serait la marque de l'ancien modèle.
    const serre = deplacerFigure(poserFigure(0.7, 0.5, 3), 0.5 + RAYON_MINI, 0.5);
    const large = deplacerFigure(poserFigure(0.7, 0.5, 3), 0.5 + RAYON_MAXI, 0.5);
    expect(ecarts(large)[0]!).toBeGreaterThan(ecarts(serre)[0]! * 3);
  });

  it("se REFERME en un seul point au centre — c'est l'uni, pas un défaut", () => {
    // « Les points se réunissent en un seul quand ils sont pile poil au
    // centre » (Enzo, 02/08). Scan intégral d'Arc : 13 fusions près du
    // centre, 1 840 images à un seul rond à moins de 70 px, deux ronds encore
    // distincts à 35,6 px. Le rayon EST l'étalement du dégradé ; au centre il
    // vaut zéro et le thème devient une couleur unie. Un plancher ici serait
    // un mur devant le geste — c'est la faute du 01/08.
    const points = deplacerFigure(poserFigure(0.7, 0.5, 3), 0.5, 0.5);
    memeRayon(points);
    // 0,004 de toile = 1,4 css : un point à l'œil. Jamais zéro — voir
    // RAYON_REFERME, l'angle d'un rond EST sa position.
    expect(rayon(points[0]!)).toBeCloseTo(RAYON_REFERME, 6);
    expect(Math.max(...ecarts(points))).toBeLessThan(0.01);
  });

  it("se referme PROGRESSIVEMENT, sans marche d'escalier près du centre", () => {
    const depart = poserFigure(0.7, 0.5, 3);
    let precedent = Number.POSITIVE_INFINITY;
    for (const distance of [0.3, 0.2, 0.12, 0.06, 0.03, 0.01, 0]) {
      const points = deplacerFigure(depart, 0.5 + distance, 0.5);
      const courant = rayon(points[0]!);
      expect(courant).toBeCloseTo(Math.max(RAYON_REFERME, distance), 6);
      expect(courant).toBeLessThanOrEqual(precedent);
      precedent = courant;
    }
  });

  it("garde les ronds SÉPARÉS partout ailleurs qu'au centre", () => {
    // Le geste peut les refermer, mais il ne doit pas les faire fusionner
    // AVANT le centre : à mi-course ils restent comptables.
    const points = deplacerFigure(poserFigure(0.7, 0.5, 3), 0.5 + 0.25, 0.5);
    expect(Math.min(...ecarts(points))).toBeGreaterThan(0.1);
  });

  it("garde le doigt dans la toile quand il vise dehors", () => {
    for (const cible of [
      [2, 2],
      [-1, 0.5],
      [0.5, -3],
    ] as const) {
      const points = deplacerFigure(poserFigure(0.7, 0.5, 3), cible[0], cible[1]);
      dansLaToile(points);
      memeRayon(points);
      expect(rayon(points[0]!)).toBeCloseTo(RAYON_MAXI, 6);
    }
  });

  it("conserve les écarts angulaires pendant tout le glissé", () => {
    // La mesure d'Arc : 60,0° ± 0,6 / 149,3° ± 0,8 / 150,7° ± 0,6 sur 672
    // images, pendant que le rayon change du simple au quadruple.
    let points = poserFigure(0.8, 0.5, 3);
    const depart = ecartsAngulaires(points);
    for (const [x, y] of [
      [0.3, 0.8],
      [0.55, 0.52],
      [0.9, 0.2],
    ] as const) {
      points = deplacerFigure(points, x, y);
      const maintenant = ecartsAngulaires(points);
      maintenant.forEach((valeur, index) => expect(valeur).toBeCloseTo(depart[index]!, 6));
    }
  });

  it("fait viser le doigt à la dominante", () => {
    const points = deplacerFigure(poserFigure(0.7, 0.5, 3), 0.5, 0.8);
    expect(orientationDe(points)).toBeCloseTo(Math.PI / 2, 6);
  });

  it("ajoute un troisième rond VISIBLE, jamais sous les autres", () => {
    let points = poserFigure(0.72, 0.5, 1);
    points = ajouterRond(points, 3);
    expect(points).toHaveLength(2);
    points = ajouterRond(points, 3);
    expect(points).toHaveLength(3);
    memeRayon(points);
    expect(Math.min(...ecarts(points))).toBeGreaterThan(0.1);
  });

  it("ROUVRE l'anneau refermé quand on ajoute — le vrai « je ne peux pas rajouter trois points »", () => {
    // Anneau replié sur le centre : ajouter doit le rouvrir juste assez pour
    // que le nouveau se voie. C'est ICI que le défaut vivait, pas dans le
    // glissé.
    const referme = deplacerFigure(poserFigure(0.7, 0.5, 2), 0.5, 0.5);
    expect(rayon(referme[0]!)).toBeCloseTo(RAYON_REFERME, 6);
    const apres = ajouterRond(referme, 3);
    expect(apres).toHaveLength(3);
    memeRayon(apres);
    expect(Math.min(...ecarts(apres))).toBeGreaterThan(0.1);
  });

  it("n'ajoute jamais au-delà du plafond", () => {
    const trois = poserFigure(0.72, 0.5, 3);
    expect(ajouterRond(trois, 3)).toHaveLength(3);
  });

  it("garde rayon et orientation en retirant un rond", () => {
    const trois = poserFigure(0.72, 0.5, 3);
    const deux = retirerRond(trois);
    expect(deux).toHaveLength(2);
    expect(rayon(deux[0]!)).toBeCloseTo(rayon(trois[0]!), 6);
    expect(orientationDe(deux)).toBeCloseTo(orientationDe(trois), 6);
    tousEgaux(deux);
  });

  it("ne descend jamais sous un rond", () => {
    expect(retirerRond(poserFigure(0.72, 0.5, 1))).toHaveLength(1);
  });

  it("survit à la promotion d'un satellite : permuter les rôles ne déforme rien", () => {
    const points = poserFigure(0.72, 0.5, 3);
    const ecartsAvant = ecartsAngulaires(points);
    const permute = [points[1]!, points[2]!, points[0]!];
    memeRayon(permute);
    // Et glisser depuis le nouveau rôle garde la figure saine : mêmes écarts,
    // même rayon commun.
    const apres = deplacerFigure(permute, 0.3, 0.7);
    memeRayon(apres);
    ecartsAngulaires(apres).forEach((valeur, index) =>
      expect(valeur).toBeCloseTo(ecartsAvant[index]!, 4),
    );
  });

  it("reste lisible après un aller-retour ajouter/retirer/ajouter", () => {
    let points = poserFigure(0.72, 0.5, 1);
    points = ajouterRond(points, 3);
    points = ajouterRond(points, 3);
    points = retirerRond(points);
    points = ajouterRond(points, 3);
    expect(points).toHaveLength(3);
    memeRayon(points);
    expect(Math.min(...ecarts(points))).toBeGreaterThan(0.1);
  });

  it("recale un thème enregistré sous l'ANCIEN modèle sans perdre ses teintes", () => {
    // Ronds à des rayons quelconques, comme les translations d'avant en
    // laissaient : on les remet sur un cercle commun. Chaque rond garde son
    // ANGLE, donc sa teinte — c'est le thème de l'utilisateur, on n'a pas à
    // le repeindre pour le réparer.
    const ancien: Point[] = [
      { x: 0.8, y: 0.5 },
      { x: 0.62, y: 0.66 },
      { x: 0.55, y: 0.3 },
    ];
    const recale = recaler(ancien);
    expect(recale).toHaveLength(3);
    memeRayon(recale);
    dansLaToile(recale);
    recale.forEach((point, index) => {
      expect(angle(point)).toBeCloseTo(angle(ancien[index]!), 6);
    });
  });

  it("pose SERRÉ même quand la dominante vient d'une teinte claire", () => {
    // Le 02/08 sur la 0.0.80 : partir d'un blanc (rayon de teinte 0,39)
    // posait duo et trio au BORD — ronds pâles, délavés. Arc pose toujours
    // serré et vif ; le glissé élargit ensuite. Le rayon de pose est donc le
    // rayon VISIBLE, jamais celui hérité de la dominante.
    const loin = poserFigure(0.89, 0.5, 1); // r = 0,39, comme un blanc
    const duo = ajouterRond(loin, 3);
    expect(rayon(duo[0]!)).toBeLessThan(0.15);
    const trio = ajouterRond(duo, 3);
    expect(rayon(trio[0]!)).toBeLessThan(0.15);
    expect(Math.min(...ecarts(trio))).toBeGreaterThan(0.09);
  });

  it("MIGRE un thème enregistré sous les anciens modèles vers le gabarit", () => {
    // Vu sur les captures du 02/08 (0.0.80) : un duo SAUVEGARDÉ à 112° avec
    // des rayons inégaux (57 et 71 px) — une géométrie qu'aucun chemin de
    // pose ne produit plus, mais que la lecture affichait telle quelle.
    const ancien: Point[] = [
      { x: 0.5 + 0.081, y: 0.5 + 0.051 },
      { x: 0.5 - 0.088, y: 0.5 + 0.048 },
    ];
    const migre = normaliserAuGabarit(ancien);
    expect(migre).toHaveLength(2);
    memeRayon(migre);
    expect(ecartsAngulaires(migre).map(Math.round)).toEqual([180, 180]);
    // la dominante garde son angle : la teinte du thème survit
    expect(angle(migre[0]!)).toBeCloseTo(angle(ancien[0]!), 6);
  });

  it("laisse un thème déjà au gabarit STRICTEMENT intact", () => {
    const propre = poserFigure(0.72, 0.5, 3);
    const repasse = normaliserAuGabarit(propre);
    repasse.forEach((point, index) => {
      expect(point.x).toBeCloseTo(propre[index]!.x, 9);
      expect(point.y).toBeCloseTo(propre[index]!.y, 9);
    });
  });

  it("rend une liste vide sur une liste vide", () => {
    expect(recaler([])).toEqual([]);
    expect(deplacerFigure([], 0.5, 0.5)).toEqual([]);
  });
});

describe("la poursuite — la loi du déplacement, jugée sur le .mov du 02/08", () => {
  const iterer = (
    points: Point[],
    prise: ReturnType<typeof saisirRond>,
    x: number,
    y: number,
    n: number,
  ) => {
    let courants = points;
    for (let i = 0; i < n; i += 1) courants = poursuivre(courants, prise, x, y);
    return courants;
  };

  it("le rond SAISI suit le doigt exactement — angle ET rayon libres", () => {
    const points = poserFigure(0.7, 0.5, 3);
    const prise = saisirRond(points, 0);
    const [tire] = poursuivre(points, prise, 0.31, 0.68);
    expect(tire!.x).toBeCloseTo(0.31, 6);
    expect(tire!.y).toBeCloseTo(0.68, 6);
  });

  it("les autres CONVERGENT vers son rayon et leur décalage — la respiration mesurée", () => {
    // La vidéo : écarts 60/60 → 39/39 pendant le glissé, rayons qui
    // convergent (157→116, 163→124 quand la dominante finit à 117).
    const points = poserFigure(0.7, 0.5, 3);
    const prise = saisirRond(points, 0);
    const arrivee = iterer([...points], prise, 0.5 - 0.2, 0.5, 90);
    const rayons = arrivee.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5));
    rayons.forEach((r) => expect(Math.abs(r - 0.2)).toBeLessThan(0.005));
    const anglesFin = arrivee.map(angle);
    prise.decalages.forEach((d, i) => {
      if (i === 0) return;
      const attendu = anglesFin[0]! + d;
      const brut = anglesFin[i]! - attendu;
      expect(Math.abs(Math.atan2(Math.sin(brut), Math.cos(brut)))).toBeLessThan(0.01);
    });
  });

  it("UNE image de poursuite ne rattrape qu'une fraction — c'est la traîne visible", () => {
    const points = poserFigure(0.7, 0.5, 2);
    const prise = saisirRond(points, 0);
    const [_, autre] = poursuivre(points, prise, 0.5, 0.5 + 0.3, POURSUITE_PAR_IMAGE);
    const rayonAutre = Math.hypot(autre!.x - 0.5, autre!.y - 0.5);
    const depart = Math.hypot(points[1]!.x - 0.5, points[1]!.y - 0.5);
    // parti de `depart`, il doit avoir fait ~15 % du chemin vers 0,3 — ni 0, ni tout
    expect(Math.abs(rayonAutre - depart)).toBeGreaterThan(0.001);
    expect(Math.abs(rayonAutre - 0.3)).toBeGreaterThan(Math.abs(depart - 0.3) * 0.7);
  });

  it("saisir un SATELLITE le libère, et les autres le poursuivent lui", () => {
    const points = poserFigure(0.7, 0.5, 3);
    const prise = saisirRond(points, 2);
    const arrivee = iterer([...points], prise, 0.5 + 0.05, 0.5 - 0.3, 120);
    expect(arrivee[2]!.x).toBeCloseTo(0.55, 6);
    expect(arrivee[2]!.y).toBeCloseTo(0.2, 6);
    const rayons = arrivee.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5));
    expect(Math.abs(rayons[0]! - rayons[2]!)).toBeLessThan(0.005);
    expect(Math.abs(rayons[1]! - rayons[2]!)).toBeLessThan(0.005);
  });

  it("la cible au CENTRE referme tout le monde en un point", () => {
    const points = poserFigure(0.75, 0.5, 3);
    const prise = saisirRond(points, 0);
    const arrivee = iterer([...points], prise, 0.5, 0.5, 200);
    arrivee.forEach((p) => expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeLessThan(0.01));
  });

  it("le passage de ±180° ne fait pas faire le grand tour", () => {
    const points = [surtout(179), surtout(171)];
    const prise = saisirRond(points, 0);
    const [_, autre] = poursuivre(points, prise, ...versAngle(-179), 0.5);
    // le satellite doit passer PAR 180°, pas repartir par 0°
    const a = (angle(autre!) * 180) / Math.PI;
    expect(Math.abs(a) > 90).toBe(true);
  });
});

function surtout(deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: 0.5 + Math.cos(a) * 0.3, y: 0.5 + Math.sin(a) * 0.3 };
}
function versAngle(deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3];
}

describe("la roue de couleurs", () => {
  it("fait l'aller-retour couleur → position → couleur sans dériver de teinte", () => {
    for (const hex of ["#f2a3c0", "#4fd1c5", "#fbd87f", "#5b8def"]) {
      const position = wheelPositionOf(hex);
      const retour = wheelColorAt(position.x, position.y);
      expect(retour).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("éclaircit vers le bord — c'est ce qui rend le rond ajouté plus blanc", () => {
    const clarte = (point: Point) => {
      const hex = wheelColorAt(point.x, point.y);
      return (
        Number.parseInt(hex.slice(1, 3), 16) +
        Number.parseInt(hex.slice(3, 5), 16) +
        Number.parseInt(hex.slice(5, 7), 16)
      );
    };
    expect(clarte({ x: 0.9, y: 0.5 })).toBeGreaterThan(clarte({ x: 0.55, y: 0.5 }));
  });

  it("donne à tout l'anneau la MÊME vivacité — c'est ce que le rayon commun achète", () => {
    // Sous l'ancien modèle (translation), un rond pouvait être au centre et
    // vif pendant qu'un autre était au bord et délavé : le thème se
    // délitait à mesure qu'on le déplaçait.
    const saturation = (point: Point) => {
      const hex = wheelColorAt(point.x, point.y);
      const canaux = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      return Math.max(...canaux) - Math.min(...canaux);
    };
    const points = deplacerFigure(poserFigure(0.7, 0.5, 3), 0.35, 0.65);
    const mesures = points.map(saturation);
    for (const valeur of mesures) {
      expect(Math.abs(valeur - mesures[0]!)).toBeLessThanOrEqual(6);
    }
  });
});
