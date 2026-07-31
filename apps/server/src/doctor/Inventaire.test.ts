import { assert, describe, it } from "@effect/vitest";

import {
  enTaille,
  rendreInventaire,
  saillantDeLInventaire,
  sansLeHome,
  type FaitsDInventaire,
} from "./Inventaire.ts";

const FAITS: FaitsDInventaire = {
  versionApp: "0.0.51",
  plateforme: "darwin arm64",
  versionNode: "22.23.1",
  home: "/Users/prenom.nom",
  comptes: [
    { nom: "A", driver: "claudeAgent", actif: true, chemin: "/Users/prenom.nom/.claude-compte-a" },
    { nom: "B", driver: "claudeAgent", actif: false, chemin: "/Users/prenom.nom/.claude-compte-b" },
  ],
  serveursMcp: [
    { nom: "t3-code", joignable: true },
    { nom: "firecrawl", joignable: false },
  ],
  skills: 18,
  etatOctets: 1_887_436_800,
  variables: ["CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY"],
};

describe("rendreInventaire · ce qui n'y entre JAMAIS", () => {
  it("aucune VALEUR de variable — seulement les noms", () => {
    // Un inventaire se colle dans une issue, un message, un rapport : un
    // endroit d'où on ne peut plus le retirer.
    const texte = rendreInventaire(FAITS);
    assert.include(texte, "ANTHROPIC_API_KEY");
    assert.include(texte, "aucune valeur");
    assert.notInclude(texte, "sk-");
  });

  it("le NOM DE SESSION disparaît des chemins", () => {
    // Il apparaît dans chaque chemin, et c'est une donnée personnelle — même
    // leçon que l'auteur d'une skill qu'on ne prend jamais à la machine.
    const texte = rendreInventaire(FAITS);
    assert.notInclude(texte, "prenom.nom");
    assert.include(texte, "~/.claude-compte-a");
  });
});

describe("rendreInventaire · ce qu'il dit", () => {
  it("les comptes, avec lequel est actif", () => {
    const texte = rendreInventaire(FAITS);
    assert.include(texte, "comptes (2)");
    assert.include(texte, "● A (claudeAgent)");
    assert.include(texte, "○ B (claudeAgent)");
  });

  it("les serveurs MCP, avec ceux qui sont morts", () => {
    const texte = rendreInventaire(FAITS);
    assert.include(texte, "✅ t3-code");
    assert.include(texte, "⛔ firecrawl");
  });

  it("la taille de l'état en unités lisibles", () => {
    assert.include(rendreInventaire(FAITS), "1,8 Go sur disque");
  });

  it("dit franchement quand il n'y a AUCUN compte", () => {
    const texte = rendreInventaire({ ...FAITS, comptes: [], serveursMcp: [] });
    assert.include(texte, "c'est probablement la cause");
  });
});

describe("saillantDeLInventaire", () => {
  it("se tait quand tout va bien", () => {
    assert.isNull(
      saillantDeLInventaire({
        ...FAITS,
        serveursMcp: [{ nom: "t3-code", joignable: true }],
      }),
    );
  });

  it("nomme les serveurs morts — 40 lignes ne sont lues par personne", () => {
    const s = saillantDeLInventaire(FAITS);
    assert.include(s ?? "", "firecrawl");
  });

  it("distingue « aucun compte » de « aucun compte ACTIF »", () => {
    assert.include(
      saillantDeLInventaire({ ...FAITS, comptes: [] }) ?? "",
      "aucun compte configuré",
    );
    assert.include(
      saillantDeLInventaire({
        ...FAITS,
        comptes: [{ nom: "A", driver: "claudeAgent", actif: false }],
      }) ?? "",
      "aucun compte actif",
    );
  });
});

describe("les deux petits outils", () => {
  it("sansLeHome ne coupe que le bon préfixe", () => {
    assert.equal(sansLeHome("/Users/x/.t3/a", "/Users/x"), "~/.t3/a");
    assert.equal(sansLeHome("/opt/ailleurs", "/Users/x"), "/opt/ailleurs");
    assert.equal(sansLeHome("/Users/x", ""), "/Users/x");
  });

  it("enTaille monte d'unité au bon moment", () => {
    assert.equal(enTaille(512), "512 o");
    assert.equal(enTaille(1536), "1,5 Ko");
    assert.equal(enTaille(5 * 1024 * 1024), "5,0 Mo");
    assert.equal(enTaille(1_887_436_800), "1,8 Go");
  });
});
