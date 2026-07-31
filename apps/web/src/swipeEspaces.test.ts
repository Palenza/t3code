import { describe, expect, it } from "vite-plus/test";

import {
  peutEncoreDefiler,
  SEUIL_BARRE,
  SEUIL_ZONE_DE_TRAVAIL,
  seuilDuSwipe,
} from "./swipeEspaces";

const boite = (scrollLeft: number, clientWidth: number, scrollWidth: number) => ({
  scrollLeft,
  clientWidth,
  scrollWidth,
});

describe("peutEncoreDefiler", () => {
  it("laisse un bloc de code garder le geste tant qu'il a de la course", () => {
    // Le cas qui justifie tout : un bloc large, au tout début. Le geste lui
    // appartient — sans ça, lire du code ferait changer d'espace.
    expect(peutEncoreDefiler(boite(0, 600, 1400), 40)).toBe(true);
    // Arrivé au bout à droite, il n'a plus rien à offrir : le geste passe au
    // swipe d'espace.
    expect(peutEncoreDefiler(boite(800, 600, 1400), 40)).toBe(false);
  });

  it("répond par sens de geste, pas dans l'absolu", () => {
    // Au milieu de sa course, le bloc peut aller des DEUX côtés.
    expect(peutEncoreDefiler(boite(400, 600, 1400), 40)).toBe(true);
    expect(peutEncoreDefiler(boite(400, 600, 1400), -40)).toBe(true);
    // Collé à gauche : plus rien vers la gauche, mais tout vers la droite.
    expect(peutEncoreDefiler(boite(0, 600, 1400), -40)).toBe(false);
    expect(peutEncoreDefiler(boite(0, 600, 1400), 40)).toBe(true);
  });

  it("ignore une course résiduelle d'un ou deux pixels", () => {
    // Arrondis d'entiers et zoom non entier laissent couramment 1 ou 2 px sur
    // des blocs qui, à l'œil, ne défilent pas. Sans cette marge ils
    // mangeraient le geste pour toujours et le swipe paraîtrait mort.
    expect(peutEncoreDefiler(boite(0, 600, 601), 40)).toBe(false);
    expect(peutEncoreDefiler(boite(0, 600, 602), 40)).toBe(false);
    expect(peutEncoreDefiler(boite(0, 600, 640), 40)).toBe(true);
  });

  it("ne prend jamais un geste sans direction", () => {
    expect(peutEncoreDefiler(boite(400, 600, 1400), 0)).toBe(false);
  });

  it("dit non quand rien ne dépasse", () => {
    expect(peutEncoreDefiler(boite(0, 600, 600), 40)).toBe(false);
  });
});

describe("seuilDuSwipe", () => {
  it("exige plus d'engagement dans la zone de travail que dans la barre", () => {
    expect(seuilDuSwipe(true)).toBe(SEUIL_BARRE);
    expect(seuilDuSwipe(false)).toBe(SEUIL_ZONE_DE_TRAVAIL);
    expect(SEUIL_ZONE_DE_TRAVAIL).toBeGreaterThan(SEUIL_BARRE);
  });
});
