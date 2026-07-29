import { assert, describe, it } from "vite-plus/test";

import {
  defautsDuMode,
  MODES_LIVRES,
  promptDuMode,
  reglesPour,
  type ModeTravail,
} from "./modesTravail.ts";

const modeParSlug = (slug: string): ModeTravail => {
  const mode = MODES_LIVRES.find((candidat) => candidat.slug === slug);
  assert.ok(mode, `mode ${slug} absent`);
  return mode;
};

describe("traduction d'un mode en permissions", () => {
  it("le mode Revue ne peut RIEN écrire ni lancer", () => {
    // La consigne « tu ne corriges rien » devient un refus, pas un espoir.
    const { deny } = reglesPour(modeParSlug("revue"));
    for (const interdit of ["Edit(*)", "Write(*)", "Bash(*)", "WebFetch(*)"]) {
      assert.ok(deny.includes(interdit), `${interdit} devrait être refusé`);
    }
  });

  it("le mode Revue garde la lecture, sinon il ne relit rien", () => {
    const { deny } = reglesPour(modeParSlug("revue"));
    for (const outil of ["Read(*)", "Grep(*)", "Glob(*)"]) {
      assert.ok(!deny.includes(outil), `${outil} ne doit pas être refusé`);
    }
  });

  it("le mode Documentation n'écrit que dans son périmètre", () => {
    const { deny, allow } = reglesPour(modeParSlug("documentation"));
    assert.ok(allow.includes("Edit(**/*.md)"));
    assert.ok(allow.includes("Write(docs/**)"));
    // Et tout le reste est refusé : sans ce refus large, un chemin oublié
    // resterait ouvert.
    assert.ok(deny.includes("Edit(*)"));
    assert.ok(deny.includes("Write(*)"));
  });

  it("un outil INCONNU d'aujourd'hui reste refusé par défaut", () => {
    // On refuse ce qui n'est pas accordé plutôt que d'autoriser une liste :
    // une CLI qui gagne un outil au prochain nightly serait sinon ouverte
    // toute seule, et un périmètre qui s'ouvre n'est pas un périmètre.
    const { allow } = reglesPour(modeParSlug("revue"));
    assert.deepStrictEqual(allow, [], "rien ne doit être autorisé nommément");
  });

  it("le mode Atelier ne refuse rien", () => {
    const { deny } = reglesPour(modeParSlug("atelier"));
    assert.deepStrictEqual(deny, []);
  });
});

describe("prompt d'un mode", () => {
  it("dit le périmètre AVANT que l'agent se heurte au refus", () => {
    // Un refus qui surprend fait perdre un tour à tout le monde.
    const prompt = promptDuMode(modeParSlug("documentation"));
    assert.match(prompt, /ne peux écrire que dans/u);
    assert.match(prompt, /\*\*\/\*\.md/u);
  });

  it("un mode sans périmètre ne parle pas de restriction", () => {
    const prompt = promptDuMode(modeParSlug("atelier"));
    assert.ok(!prompt.includes("ne peux écrire que dans"));
  });
});

describe("validation d'un mode", () => {
  const base: ModeTravail = {
    slug: "essai",
    nom: "Essai",
    role: "Tu essaies.",
    outils: ["lecture"],
  };

  it("les modes livrés sont valides", () => {
    for (const mode of MODES_LIVRES) {
      assert.deepStrictEqual(defautsDuMode(mode), [], mode.slug);
    }
  });

  it("un identifiant à espaces ou majuscules est refusé", () => {
    assert.ok(defautsDuMode({ ...base, slug: "Mon Mode" }).length > 0);
  });

  it("un mode sans aucun outil est refusé", () => {
    // Mieux vaut le refuser à la création que laisser quelqu'un découvrir
    // un agent muet.
    assert.ok(defautsDuMode({ ...base, outils: [] }).length > 0);
  });

  it("un périmètre d'écriture sans l'écriture est une incohérence", () => {
    const defauts = defautsDuMode({
      ...base,
      outils: ["lecture"],
      perimetreEcriture: ["docs/**"],
    });
    assert.ok(defauts.some((defaut) => defaut.includes("périmètre")));
  });
});
