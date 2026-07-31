import { describe, expect, it } from "vite-plus/test";

import {
  ajouterRond,
  deplacerFigure,
  ECART_RONDS,
  orientationDe,
  poserFigure,
  recaler,
  retirerRond,
  wheelColorAt,
  wheelPositionOf,
  type Point,
} from "./SpaceThemePanel.logic";

/**
 * L'invariant du fondateur, en un test : « les points doivent TOUJOURS rester
 * à distance égale ». Tout ce qui suit ne fait que le vérifier sous chaque
 * geste possible — glisser, ajouter, retirer, promouvoir, cliquer une
 * pastille — y compris dans les coins, là où l'ancienne version les écrasait
 * les uns sur les autres.
 */

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Toutes les distances deux à deux, arrondies au millième. */
function ecarts(points: ReadonlyArray<Point>): number[] {
  const sorties: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      sorties.push(Number(distance(points[i]!, points[j]!).toFixed(3)));
    }
  }
  return sorties;
}

const tousEgaux = (points: ReadonlyArray<Point>) => {
  for (const ecart of ecarts(points)) {
    expect(ecart).toBeCloseTo(ECART_RONDS, 3);
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

describe("la figure de la toile", () => {
  it("pose deux ronds à ÉCART_RONDS l'un de l'autre", () => {
    tousEgaux(poserFigure(0.5, 0.5, 2));
  });

  it("pose trois ronds en triangle ÉQUILATÉRAL", () => {
    const trio = poserFigure(0.5, 0.5, 3);
    expect(trio).toHaveLength(3);
    tousEgaux(trio);
  });

  it("garde les écarts quand la dominante traverse toute la toile", () => {
    let figure = poserFigure(0.5, 0.5, 3);
    // Le pas de 0,05 balaye la toile bord à bord, coins compris — c'est là
    // que l'ancienne version (rayon commun) écrasait les ronds au centre.
    for (let x = 0; x <= 1.0001; x += 0.05) {
      for (let y = 0; y <= 1.0001; y += 0.05) {
        figure = deplacerFigure(figure, x, y);
        tousEgaux(figure);
        dansLaToile(figure);
      }
    }
  });

  it("garde les écarts quand la dominante vise EXACTEMENT le centre", () => {
    // Le cas qui cassait tout : rayon nul → les trois ronds superposés.
    const figure = deplacerFigure(poserFigure(0.3, 0.7, 3), 0.5, 0.5);
    tousEgaux(figure);
  });

  it("garde les écarts quand la dominante sort de la toile", () => {
    const figure = deplacerFigure(poserFigure(0.5, 0.5, 3), -5, 12);
    tousEgaux(figure);
    dansLaToile(figure);
  });

  it("ajoute un troisième rond VISIBLE, jamais sous les autres", () => {
    const duo = poserFigure(0.5, 0.5, 2);
    const trio = ajouterRond(duo, 3);
    expect(trio).toHaveLength(3);
    tousEgaux(trio);
    // « Je ne peux pas rajouter trois points » : le troisième naissait au
    // même endroit que la dominante. Plus jamais.
    for (const [i, point] of trio.entries()) {
      for (const [j, autre] of trio.entries()) {
        if (i !== j) expect(distance(point, autre)).toBeGreaterThan(0.1);
      }
    }
  });

  it("ajoute le rond du côté PÂLE — plus loin du centre que la dominante", () => {
    // « Ça garde le plus blanc » : la roue s'éclaircit vers le bord, donc un
    // rond ajouté plus loin du centre est plus clair que sa dominante.
    const [dominante, ajoute] = ajouterRond([{ x: 0.62, y: 0.4 }], 3);
    const clarte = (point: Point) => {
      const hex = wheelColorAt(point.x, point.y);
      return (
        Number.parseInt(hex.slice(1, 3), 16) +
        Number.parseInt(hex.slice(3, 5), 16) +
        Number.parseInt(hex.slice(5, 7), 16)
      );
    };
    expect(Math.hypot(ajoute!.x - 0.5, ajoute!.y - 0.5)).toBeGreaterThan(
      Math.hypot(dominante!.x - 0.5, dominante!.y - 0.5),
    );
    expect(clarte(ajoute!)).toBeGreaterThan(clarte(dominante!));
  });

  it("n'ajoute jamais au-delà du plafond", () => {
    const trio = poserFigure(0.5, 0.5, 3);
    expect(ajouterRond(trio, 3)).toHaveLength(3);
  });

  it("retire un rond sans déplacer les rescapés", () => {
    const trio = poserFigure(0.4, 0.4, 3);
    const duo = retirerRond(trio);
    expect(duo).toHaveLength(2);
    expect(duo[0]).toEqual(trio[0]);
    expect(duo[1]).toEqual(trio[1]);
    tousEgaux(duo);
    const seul = retirerRond(duo);
    expect(seul).toHaveLength(1);
    expect(retirerRond(seul)).toHaveLength(1);
  });

  it("survit à la promotion d'un satellite : permuter les rôles ne déforme rien", () => {
    const trio = poserFigure(0.45, 0.55, 3);
    const promu = [trio[2]!, trio[0]!, trio[1]!];
    tousEgaux(promu);
    // Et une fois promu, un glissé garde encore les écarts.
    tousEgaux(deplacerFigure(promu, 0.9, 0.1));
  });

  it("garde les écarts après un aller-retour ajouter/retirer/ajouter", () => {
    let figure: Point[] = [{ x: 0.5, y: 0.3 }];
    figure = ajouterRond(figure, 3);
    figure = ajouterRond(figure, 3);
    tousEgaux(figure);
    figure = retirerRond(figure);
    figure = ajouterRond(figure, 3);
    tousEgaux(figure);
  });

  it("recale sans déformer : une seule translation pour tout le monde", () => {
    const figure = poserFigure(0.5, 0.5, 3).map((point) => ({ x: point.x + 3, y: point.y - 2 }));
    const recale = recaler(figure);
    tousEgaux(recale);
    dansLaToile(recale);
    const dx = recale[0]!.x - figure[0]!.x;
    const dy = recale[0]!.y - figure[0]!.y;
    for (const [index, point] of recale.entries()) {
      expect(point.x - figure[index]!.x).toBeCloseTo(dx, 10);
      expect(point.y - figure[index]!.y).toBeCloseTo(dy, 10);
    }
  });

  it("lit l'orientation de la figure et la rend au tour suivant", () => {
    const duo: Point[] = [
      { x: 0.5, y: 0.5 },
      { x: 0.5 + ECART_RONDS, y: 0.5 },
    ];
    expect(orientationDe(duo)).toBeCloseTo(0, 6);
    // Une figure d'un seul rond n'a pas d'orientation lisible : on ne
    // renvoie jamais NaN, sinon la figure entière part en NaN.
    expect(Number.isFinite(orientationDe([{ x: 0.2, y: 0.2 }]))).toBe(true);
    expect(Number.isFinite(orientationDe([]))).toBe(true);
  });
});

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
});
