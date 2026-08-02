import { describe, expect, it } from "vite-plus/test";

import {
  SALVE_AU_REPOS,
  surEvenement,
  surSilence,
  type EtatSalve,
  type SortieDeSalve,
} from "./salveDeSwipe";

/**
 * Chaque test est une TRACE : la suite d'évènements telle que le trackpad la
 * produit, rejouée contre la machine. Le premier reproduit le bug qui a
 * imposé la réécriture.
 */

const SEUIL = 110;

function rejouer(
  evenements: ReadonlyArray<readonly [number, number]>,
  depart: EtatSalve = SALVE_AU_REPOS,
): { etat: EtatSalve; sorties: SortieDeSalve[] } {
  let etat = depart;
  const sorties: SortieDeSalve[] = [];
  for (const [dx, dy] of evenements) {
    const [prochain, sortie] = surEvenement(etat, dx, dy, SEUIL);
    etat = prochain;
    sorties.push(sortie);
  }
  return { etat, sorties };
}

const silence = (etat: EtatSalve) => surSilence(etat);

describe("la salve de swipe", () => {
  it("LE BUG DU 02/08 : un défilement vertical ne condamne plus le swipe suivant", () => {
    // 1 · on fait défiler le fil (vertical, un peu diagonal)
    const defilement = rejouer(Array.from({ length: 12 }, () => [3, -38] as const));
    expect(defilement.etat.phase).toBe("verticale");
    expect(defilement.sorties.every((s) => s.type === "rien")).toBe(true);
    // 2 · le trackpad se tait — AVANT la réécriture, rien ne sortait de là :
    //     l'axe restait « vertical » pour toujours et le swipe était mort.
    const [repos] = silence(defilement.etat);
    expect(repos.phase).toBe("repos");
    // 3 · on swipe pour changer d'espace : ça doit TRAVERSER.
    const swipe = rejouer(
      [
        [-45, 2],
        [-45, 3],
        [-45, 2],
      ],
      repos,
    );
    expect(swipe.sorties.at(-1)).toEqual({ type: "traverser", versLaDroite: 1 });
  });

  it("pendant le défilement lui-même, la dérive horizontale reste avalée", () => {
    const { etat, sorties } = rejouer([
      [4, -40],
      [6, -35],
      [12, -50],
      [9, -44],
    ]);
    expect(etat.phase).toBe("verticale");
    expect(sorties.every((s) => s.type === "rien")).toBe(true);
  });

  it("un swipe franc traverse, et sa traîne n'en fait pas un second", () => {
    const geste = rejouer([
      [-60, 3],
      [-70, 2],
    ]);
    expect(geste.sorties.at(-1)).toEqual({ type: "traverser", versLaDroite: 1 });
    // la traîne d'inertie : décroissante mais BRUITÉE (mesure du 01/08)
    const traine = rejouer(
      [
        [-50, 1],
        [-55, 2],
        [-30, 1],
        [-34, 0],
        [-12, 0],
      ],
      geste.etat,
    );
    expect(traine.sorties.every((s) => s.type === "rien")).toBe(true);
    expect(traine.etat.phase).toBe("traine");
  });

  it("un NOUVEAU doigt pendant la traîne rouvre une salve et peut traverser", () => {
    const premier = rejouer([
      [-80, 2],
      [-40, 1],
    ]);
    expect(premier.sorties.at(-1)?.type).toBe("traverser");
    // amplitude comparable au pic (80) : c'est un doigt, pas de l'inertie
    const second = rejouer(
      [
        [-85, 2],
        [-40, 1],
      ],
      premier.etat,
    );
    expect(second.sorties.at(-1)).toEqual({ type: "traverser", versLaDroite: 1 });
  });

  it("un geste arrêté sous le seuil suit le doigt puis retombe au silence", () => {
    const geste = rejouer([
      [-30, 2],
      [-25, 1],
    ]);
    expect(geste.sorties.at(-1)).toEqual({ type: "suivre", accumule: -55 });
    const [repos, sortie] = silence(geste.etat);
    expect(sortie).toEqual({ type: "retomber" });
    expect(repos.phase).toBe("repos");
  });

  it("ne peint RIEN tant que l'axe n'est pas tranché, puis rattrape tout l'accumulé", () => {
    const debut = rejouer([
      [-5, 2],
      [-6, 1],
    ]);
    expect(debut.sorties.every((s) => s.type === "rien")).toBe(true);
    const bascule = rejouer([[-15, 2]], debut.etat);
    // le suivi inclut les pixels d'AVANT la décision : rien n'est perdu
    expect(bascule.sorties.at(-1)).toEqual({ type: "suivre", accumule: -26 });
  });

  it("les doigts vers la gauche traversent dans l'autre sens", () => {
    const geste = rejouer([
      [60, 2],
      [60, 1],
    ]);
    expect(geste.sorties.at(-1)).toEqual({ type: "traverser", versLaDroite: -1 });
  });

  it("le seuil est figé au départ de la salve", () => {
    // la salve démarre avec SEUIL=110 ; même si l'appelant passe ensuite un
    // seuil plus bas, c'est celui du départ qui juge
    let [etat] = surEvenement(SALVE_AU_REPOS, -50, 2, 200);
    let sortie: SortieDeSalve;
    [etat, sortie] = surEvenement(etat, -60, 1, 110);
    expect(sortie.type).toBe("suivre");
    [etat, sortie] = surEvenement(etat, -60, 1, 110);
    expect(sortie.type).toBe("suivre");
    [etat, sortie] = surEvenement(etat, -40, 1, 110);
    expect(sortie).toEqual({ type: "traverser", versLaDroite: 1 });
  });

  it("le silence remet AU REPOS depuis toutes les phases — plus d'état sans sortie", () => {
    for (const trace of [
      [[3, -40]] as const, // verticale
      [[-5, 1]] as const, // indécise
      [
        [-60, 2],
        [-60, 1],
      ] as const, // traîne (après traversée)
      [[-30, 1]] as const, // horizontale
    ]) {
      const { etat } = rejouer(trace as ReadonlyArray<readonly [number, number]>);
      const [repos] = silence(etat);
      expect(repos.phase).toBe("repos");
    }
  });
});
