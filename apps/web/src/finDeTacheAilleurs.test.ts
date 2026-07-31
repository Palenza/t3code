import { describe, expect, it } from "vite-plus/test";

import {
  finsDeTache,
  photographier,
  retourApresSaut,
  retourEncoreUtile,
  type EtatFil,
} from "./finDeTacheAilleurs";

const fil = (threadKey: string, travaille: boolean): EtatFil => ({ threadKey, travaille });
const dansEspace =
  (carte: Record<string, string>) =>
  (threadKey: string): string | null =>
    carte[threadKey] ?? null;

describe("repérer une tâche finie AILLEURS", () => {
  it("ne notifie rien au premier passage — sinon ouvrir l'app sonnerait dix fois", () => {
    const fins = finsDeTache({
      precedent: null,
      courant: [fil("a", false), fil("b", false)],
      threadKeyActif: null,
      espaceDuFil: dansEspace({}),
    });
    expect(fins).toEqual([]);
  });

  it("notifie sur la BASCULE travaille → fini, pas sur l'état", () => {
    const avant = photographier([fil("a", true), fil("b", false)]);
    const fins = finsDeTache({
      precedent: avant,
      courant: [fil("a", false), fil("b", false)],
      threadKeyActif: null,
      espaceDuFil: dansEspace({ a: "space-design" }),
    });
    expect(fins).toEqual([{ threadKey: "a", spaceId: "space-design" }]);
  });

  it("ne renotifie pas au tour suivant", () => {
    const apres = photographier([fil("a", false)]);
    const fins = finsDeTache({
      precedent: apres,
      courant: [fil("a", false)],
      threadKeyActif: null,
      espaceDuFil: dansEspace({}),
    });
    expect(fins).toEqual([]);
  });

  it("se tait pour le fil qu'on REGARDE — on voit déjà la réponse arriver", () => {
    const avant = photographier([fil("a", true)]);
    const fins = finsDeTache({
      precedent: avant,
      courant: [fil("a", false)],
      threadKeyActif: "a",
      espaceDuFil: dansEspace({}),
    });
    expect(fins).toEqual([]);
  });

  it("un fil qui APPARAÎT déjà fini n'est pas une fin de tâche", () => {
    const avant = photographier([fil("a", true)]);
    const fins = finsDeTache({
      precedent: avant,
      courant: [fil("a", true), fil("nouveau", false)],
      threadKeyActif: null,
      espaceDuFil: dansEspace({}),
    });
    expect(fins).toEqual([]);
  });

  it("porte l'espace du fil, et supporte un fil rangé nulle part", () => {
    const avant = photographier([fil("a", true), fil("b", true)]);
    const fins = finsDeTache({
      precedent: avant,
      courant: [fil("a", false), fil("b", false)],
      threadKeyActif: null,
      espaceDuFil: dansEspace({ a: "space-design" }),
    });
    expect(fins).toEqual([
      { threadKey: "a", spaceId: "space-design" },
      { threadKey: "b", spaceId: null },
    ]);
  });
});

describe("le chemin du retour", () => {
  it("mémorise D'OÙ l'on vient quand le saut déplace vraiment", () => {
    const retour = retourApresSaut({
      depart: { spaceId: "space-kb", threadKey: "ici" },
      arrivee: { spaceId: "space-design", threadKey: "la-bas" },
    });
    expect(retour).toEqual({ spaceId: "space-kb", threadKey: "ici" });
  });

  it("ne propose rien si le saut ne déplace pas", () => {
    const retour = retourApresSaut({
      depart: { spaceId: "space-kb", threadKey: "ici" },
      arrivee: { spaceId: "space-kb", threadKey: "ici" },
    });
    expect(retour).toBeNull();
  });

  it("propose un retour même à espace égal, si le FIL change", () => {
    const retour = retourApresSaut({
      depart: { spaceId: "space-kb", threadKey: "ici" },
      arrivee: { spaceId: "space-kb", threadKey: "ailleurs" },
    });
    expect(retour).toEqual({ spaceId: "space-kb", threadKey: "ici" });
  });

  it("s'efface dès qu'on est revenu par ses propres moyens", () => {
    const retour = { spaceId: "space-kb", threadKey: "ici" };
    expect(retourEncoreUtile(retour, { spaceId: "space-kb", threadKey: "ici" })).toBeNull();
    expect(retourEncoreUtile(retour, { spaceId: "space-design", threadKey: "la-bas" })).toEqual(
      retour,
    );
    expect(retourEncoreUtile(null, { spaceId: null, threadKey: "x" })).toBeNull();
  });
});
