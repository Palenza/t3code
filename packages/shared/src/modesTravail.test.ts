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
  it("le mode Revue refuse l'écriture par NOM NU — le seul refus qui tient", () => {
    // Doc officielle : le nom nu retire l'outil du contexte. Un Edit(*)
    // n'aurait pas cette garantie (audit 29/07).
    const { deny } = reglesPour(modeParSlug("revue"));
    for (const interdit of ["Edit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"]) {
      assert.ok(deny.includes(interdit), `${interdit} devrait être refusé nommément`);
    }
  });

  it("le mode Revue garde la lecture, sinon il ne relit rien", () => {
    const { deny } = reglesPour(modeParSlug("revue"));
    for (const outil of ["Read", "Grep", "Glob"]) {
      assert.ok(!deny.includes(outil), `${outil} ne doit pas être refusé`);
    }
  });

  it("le périmètre n'émet JAMAIS un deny large qui l'annulerait", () => {
    // « A deny rule can't carry allowlist exceptions » : deny Edit(*) +
    // allow Edit(**/*.md) = plus RIEN ne s'écrit, pas même les .md — c'était
    // le bug qui rendait le mode Documentation entièrement mort.
    const { deny, allow } = reglesPour(modeParSlug("documentation"));
    assert.ok(allow.includes("Edit(**/*.md)"));
    assert.ok(allow.includes("Edit(docs/**)"));
    assert.ok(!deny.includes("Edit"), "deny Edit annulerait tout le périmètre");
    assert.ok(!deny.some((regle) => regle.startsWith("Edit(")), "aucun deny Edit(motif)");
  });

  it("seules des règles Edit(chemin) portent le périmètre — Write(chemin) est ignoré par la CLI", () => {
    // Doc : « The file permission checks match only Edit(path) rules ».
    const { allow } = reglesPour(modeParSlug("documentation"));
    assert.ok(!allow.some((regle) => regle.startsWith("Write(")), "Write(chemin) serait ignoré");
    assert.ok(!allow.some((regle) => regle.startsWith("NotebookEdit(")));
  });

  it("le mode Atelier ne refuse rien", () => {
    const { deny } = reglesPour(modeParSlug("atelier"));
    assert.deepStrictEqual(deny, []);
  });
});

describe("prompt d'un mode", () => {
  it("dit le périmètre AVANT que l'agent s'y heurte", () => {
    // Un blocage qui surprend fait perdre un tour à tout le monde. Le
    // libellé a changé avec la sémantique réelle des permissions : hors
    // périmètre, ce n'est pas un refus sec mais une approbation demandée
    // — le prompt doit dire cette vérité-là, pas l'ancienne.
    const prompt = promptDuMode(modeParSlug("documentation"));
    assert.match(prompt, /périmètre d'écriture/u);
    assert.match(prompt, /approuvée/u);
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
