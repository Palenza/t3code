import { assert, describe, it } from "@effect/vitest";

import { verdictDeCible } from "./CibleSensible.ts";

describe("verdictDeCible · ce qui est REFUSÉ", () => {
  it("`.git/` en entier — un hook s'exécute au prochain commit", () => {
    // Le trou vérifié le 31/07 : le contrôle de chemin acceptait
    // `.git/hooks/pre-commit`, qui donne l'exécution de code arbitraire sur la
    // machine de l'humain, avec ses droits, sans franchir aucune frontière.
    for (const chemin of [
      ".git/hooks/pre-commit",
      ".git/config",
      ".git/hooks/post-checkout",
      "sous/projet/.git/config",
    ]) {
      assert.equal(verdictDeCible(chemin).nature, "interdite", chemin);
    }
  });

  it("le refus explique quoi faire à la place (A7)", () => {
    const v = verdictDeCible(".git/hooks/pre-commit");
    assert.include(v.pourquoi, ".git/hooks/pre-commit");
    assert.include(v.pourquoi, "core.pager");
    assert.include(v.pourquoi, "commande git");
  });
});

describe("verdictDeCible · ce qui passe mais se DIT", () => {
  it("les fichiers d'environnement", () => {
    for (const chemin of [".env", ".env.local", ".env.production", "apps/web/.env"]) {
      assert.equal(verdictDeCible(chemin).nature, "sensible", chemin);
    }
  });

  it("les réglages et les hooks de l'agent", () => {
    assert.equal(verdictDeCible(".claude/settings.json").nature, "sensible");
    assert.equal(verdictDeCible(".claude/settings.local.json").nature, "sensible");
    assert.equal(verdictDeCible(".claude/hooks/garde.sh").nature, "sensible");
  });

  it("les identifiants de gestionnaires de paquets", () => {
    for (const chemin of [".npmrc", ".pypirc", ".netrc", "sous/.npmrc"]) {
      assert.equal(verdictDeCible(chemin).nature, "sensible", chemin);
    }
  });

  it("les fichiers de démarrage de shell", () => {
    assert.equal(verdictDeCible(".zshrc").nature, "sensible");
    assert.equal(verdictDeCible(".bash_profile").nature, "sensible");
  });

  it("le miroir macOS /private/ — le piège qu'Hermès documente", () => {
    // `/etc` est un lien vers `/private/etc` : un motif sur `/etc/` seul se
    // contourne en écrivant l'autre forme.
    assert.equal(verdictDeCible("/etc/sudoers").nature, "sensible");
    assert.equal(verdictDeCible("/private/etc/sudoers").nature, "sensible");
    assert.equal(verdictDeCible("/private/var/db/x").nature, "sensible");
  });

  it("une SKILL n'est PAS sensible — c'est du travail ordinaire", () => {
    // Bloquer là ferait éditer autrement, sans trace. Les hooks et les
    // réglages sont du code ; une skill est un document.
    assert.equal(verdictDeCible(".claude/skills/usine/SKILL.md").nature, "ordinaire");
  });
});

describe("verdictDeCible · ce qui ne doit PAS crier", () => {
  it("un nom qui RESSEMBLE sans en être", () => {
    // Un garde qui crie sur du travail ordinaire finit débranché : c'est le
    // mode de panne le plus sûr.
    for (const chemin of [
      "mon.git/fichier.ts",
      "notes.env",
      "src/environnement.ts",
      "docs/gitignore.md",
      "packages/git-utils/index.ts",
      "src/claude/settings.ts",
    ]) {
      assert.equal(verdictDeCible(chemin).nature, "ordinaire", chemin);
    }
  });

  it("le travail de tous les jours", () => {
    for (const chemin of [
      "src/index.ts",
      "apps/server/src/securite/CibleSensible.ts",
      "README.md",
      "package.json",
    ]) {
      assert.equal(verdictDeCible(chemin).nature, "ordinaire", chemin);
    }
  });

  it("supporte les séparateurs Windows", () => {
    assert.equal(verdictDeCible(".git\\hooks\\pre-commit").nature, "interdite");
    assert.equal(verdictDeCible("src\\index.ts").nature, "ordinaire");
  });
});
