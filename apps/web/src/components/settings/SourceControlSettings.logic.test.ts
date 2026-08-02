import { describe, expect, it } from "vite-plus/test";

import {
  etatDeLaSource,
  libelleEtatSource,
  pastilleEtatSource,
  type EtatSource,
} from "./SourceControlSettings.logic";

const TOUS: ReadonlyArray<EtatSource> = [
  "disponible",
  "non-authentifie",
  "indisponible",
  "pas-pris-en-charge",
];

describe("l'état d'une source de code", () => {
  it("dit « disponible » quand l'outil répond ET que l'identité est établie", () => {
    expect(etatDeLaSource({ prisEnCharge: true, disponible: true, authentifie: true })).toBe(
      "disponible",
    );
  });

  it("distingue « pas connecté » de « pas installé » — deux réparations différentes", () => {
    // C'est LA raison d'être de ce module. Les deux portaient la même couleur
    // « warning » et le même silence : impossible de savoir s'il fallait
    // installer un outil ou se connecter.
    expect(etatDeLaSource({ prisEnCharge: true, disponible: true, authentifie: false })).toBe(
      "non-authentifie",
    );
    expect(etatDeLaSource({ prisEnCharge: true, disponible: false, authentifie: false })).toBe(
      "indisponible",
    );
  });

  it("ne parle pas d'authentification pour une source qui n'en a pas", () => {
    // Git local n'a pas de compte. `authentifie: null` ne doit jamais produire
    // « non-authentifie » — sinon la ligne Git crierait en permanence.
    expect(etatDeLaSource({ prisEnCharge: true, disponible: true, authentifie: null })).toBe(
      "disponible",
    );
  });

  it("ne parle ni d'absence ni d'authentification pour une source non prise en charge", () => {
    // L'ordre des tests compte : inutile de dire « pas installé » d'un outil
    // que Raptor ne sait de toute façon pas piloter.
    for (const disponible of [true, false]) {
      for (const authentifie of [true, false, null]) {
        expect(etatDeLaSource({ prisEnCharge: false, disponible, authentifie })).toBe(
          "pas-pris-en-charge",
        );
      }
    }
  });

  it("couvre les DOUZE combinaisons d'entrée, sans trou", () => {
    // Un état qui n'existerait pour aucune combinaison serait du code mort ;
    // une combinaison sans état serait un `undefined` à l'écran.
    const vus = new Set<EtatSource>();
    for (const prisEnCharge of [true, false]) {
      for (const disponible of [true, false]) {
        for (const authentifie of [true, false, null]) {
          const etat = etatDeLaSource({ prisEnCharge, disponible, authentifie });
          expect(TOUS).toContain(etat);
          vus.add(etat);
        }
      }
    }
    expect([...vus].toSorted()).toEqual([...TOUS].toSorted());
  });
});

describe("ce que l'état MONTRE", () => {
  it("donne à chaque état un libellé propre — jamais deux fois le même", () => {
    // Deux états qui s'annoncent pareil, c'est une couleur déguisée en mot :
    // on n'aurait rien gagné.
    const libelles = TOUS.map(libelleEtatSource);
    expect(new Set(libelles).size).toBe(TOUS.length);
    for (const libelle of libelles) {
      expect(libelle.trim().length).toBeGreaterThan(0);
    }
  });

  it("garde la même teinte pour les deux ennuis de même gravité", () => {
    // « Pas connecté » et « pas installé » restent visuellement identiques —
    // c'est voulu. Ce qui les sépare désormais, c'est le NOM.
    expect(pastilleEtatSource("non-authentifie")).toBe(pastilleEtatSource("indisponible"));
    expect(libelleEtatSource("non-authentifie")).not.toBe(libelleEtatSource("indisponible"));
  });

  it("sépare visuellement le sain, l'ennuyeux et le non pris en charge", () => {
    const sain = pastilleEtatSource("disponible");
    const ennuyeux = pastilleEtatSource("indisponible");
    const absent = pastilleEtatSource("pas-pris-en-charge");
    expect(new Set([sain, ennuyeux, absent]).size).toBe(3);
  });

  it("rend une classe pour CHAQUE état — jamais une chaîne vide", () => {
    // Une classe vide, c'est une pastille invisible : l'information disparaît
    // sans qu'aucun test ne rougisse.
    for (const etat of TOUS) {
      expect(pastilleEtatSource(etat).trim().length, etat).toBeGreaterThan(0);
    }
  });
});
