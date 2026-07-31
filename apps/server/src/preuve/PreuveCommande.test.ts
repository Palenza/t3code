import { assert, describe, it } from "@effect/vitest";

import {
  classerSegment,
  etatDesPreuves,
  preuvesDeCommande,
  verdictDeSortie,
  type Preuve,
} from "./PreuveCommande.ts";

const classerPreuve = classerSegment;

const vert = "Test Files  3 passed (3)\n     Tests  27 passed (27)";
const rouge = "Test Files  1 failed (1)\n     Tests  2 failed | 4 passed (6)";

describe("classerPreuve — ce que la commande prouve", () => {
  it("reconnaît une suite COMPLÈTE au vert", () => {
    const p = classerPreuve("pnpm exec vp test run", vert, false);
    assert.equal(p.nature, "tests");
    assert.equal(p.etendue, "complete");
    assert.equal(p.verdict, "reussi");
  });

  it("NE TRANSFORME JAMAIS un passage ciblé en « tout est vert »", () => {
    // La faute la plus fréquente et la plus coûteuse : on croit avoir un
    // filet, on n'a qu'un fil.
    const p = classerPreuve("pnpm exec vp test run src/rappel/RappelRequete.test.ts", vert, false);
    assert.equal(p.etendue, "ciblee");
    assert.equal(p.verdict, "reussi");
    assert.include(p.raison, "ne dit RIEN du reste");
  });

  it("voit le ciblage sous toutes ses formes", () => {
    for (const commande of [
      "vitest src/foo.test.ts",
      "pnpm exec vp test run -t 'le curateur'",
      "pnpm exec vp test --filter server",
      "pnpm exec tsgo --noEmit apps/server/src/rappel",
    ]) {
      assert.equal(classerPreuve(commande, vert, false).etendue, "ciblee", commande);
    }
  });

  it("reconnaît chaque nature de vérification", () => {
    assert.equal(classerPreuve("pnpm exec tsgo --noEmit", "", false).nature, "types");
    assert.equal(classerPreuve("pnpm exec vp lint apps", "", false).nature, "lint");
    assert.equal(classerPreuve("pnpm run build", "", false).nature, "build");
    assert.equal(classerPreuve("git status", "", false).nature, "aucune");
  });
});

describe("ce qui ANNULE la valeur d'une preuve", () => {
  it("« || true » écrase le code de sortie — le vert ne prouve plus rien", () => {
    // Le cas le plus vicieux : la sortie ressemble EXACTEMENT à un succès.
    const p = classerPreuve("pnpm exec vp test run || true", vert, false);
    assert.equal(p.verdict, "indetermine");
    assert.include(p.raison, "écrasé");
  });

  it("« ; true » aussi", () => {
    assert.equal(classerPreuve("vitest run ; true", vert, false).verdict, "indetermine");
  });

  it("le mode surveillance ne rend jamais de verdict", () => {
    assert.equal(classerPreuve("vitest --watch", "", false).verdict, "indetermine");
    assert.equal(classerPreuve("vitest --ui", "", false).verdict, "indetermine");
  });

  it("un vert obtenu sans avoir exercé un seul test n'est pas un vert", () => {
    const p = classerPreuve("vitest run --passWithNoTests", "no tests found", false);
    assert.equal(p.verdict, "indetermine");
  });

  it("annulé ne veut pas dire ÉCHOUÉ", () => {
    // On ne sait pas. Prétendre savoir dans un sens ou dans l'autre serait
    // le même mensonge.
    assert.notEqual(classerPreuve("vitest run || true", rouge, false).verdict, "echoue");
  });
});

describe("verdictDeSortie — lire la sortie, pas seulement le code de retour", () => {
  it("voit un échec écrit même quand le code de retour dit zéro", () => {
    // Un `| grep` ou un `| tail` en aval et le code de retour devient celui
    // du dernier maillon : le vert du tube masque le rouge de la commande.
    assert.equal(verdictDeSortie(rouge, false), "echoue");
    assert.equal(verdictDeSortie("error TS2345: quelque chose", false), "echoue");
  });

  it("croit le drapeau d'erreur quand il est levé", () => {
    assert.equal(verdictDeSortie(vert, true), "echoue");
  });

  it("ne CHOISIT pas quand la sortie ne dit rien", () => {
    // Un « indéterminé » honnête vaut mieux qu'un vert inventé.
    assert.equal(verdictDeSortie("", false), "indetermine");
    assert.equal(verdictDeSortie("blah blah", false), "indetermine");
  });
});

describe("etatDesPreuves — ce qu'on a le droit de DIRE", () => {
  const p = (over: Partial<Preuve>): Preuve => ({
    nature: "tests",
    etendue: "complete",
    verdict: "reussi",
    raison: "",
    ...over,
  });

  it("dix passages ciblés verts ne font PAS un dépôt vert", () => {
    // C'est l'élargissement qu'Hermès s'interdit, et la façon la plus
    // courante de se mentir à soi-même.
    const etat = etatDesPreuves(Array.from({ length: 10 }, () => p({ etendue: "ciblee" })));
    const tests = etat.find((e) => e.nature === "tests");
    assert.isFalse(tests?.prouve);
    assert.include(tests?.detail ?? "", "CIBLÉ");
  });

  it("un seul passage complet au vert suffit", () => {
    const etat = etatDesPreuves([p({})]);
    assert.isTrue(etat.find((e) => e.nature === "tests")?.prouve);
  });

  it("un échec l'emporte sur tous les verts", () => {
    const etat = etatDesPreuves([p({}), p({ verdict: "echoue" })]);
    assert.isFalse(etat.find((e) => e.nature === "tests")?.prouve);
    assert.include(etat.find((e) => e.nature === "tests")?.detail ?? "", "échec");
  });

  it("dit « jamais lancé » plutôt que de laisser croire", () => {
    const etat = etatDesPreuves([]);
    assert.isTrue(etat.every((e) => !e.prouve));
    assert.isTrue(etat.every((e) => e.detail === "jamais lancé"));
    // Les quatre natures sont TOUJOURS rendues : une absence tue doit se voir.
    assert.deepEqual(
      etat.map((e) => e.nature),
      ["tests", "types", "lint", "build"],
    );
  });
});

describe("les composés — la leçon des 899 vraies commandes", () => {
  it("classe CHAQUE segment, pas la ligne entière", () => {
    // Cas réel : en classant la chaîne complète, un `tsgo --noEmit` était
    // rangé dans « tests » parce qu'un `vp test run` traînait dans le même
    // composé.
    const ps = preuvesDeCommande(
      "cd ~/x && pnpm exec tsgo --noEmit && pnpm exec vp test run",
      vert,
      false,
    );
    assert.deepEqual(
      ps.map((p) => p.nature),
      ["types", "tests"],
    );
  });

  it("ne prend pas les chemins d'un « fmt » pour un ciblage", () => {
    // Autre cas réel : `vp fmt --write src/... ; vp test run` passait pour
    // un passage CIBLÉ à cause des chemins du formatage.
    const ps = preuvesDeCommande(
      "pnpm exec vp fmt --write apps/server/src/preuve/ ; pnpm exec vp test run",
      vert,
      false,
    );
    assert.equal(ps.length, 1);
    assert.equal(ps[0]?.etendue, "complete");
  });

  it("ne voit PLUS un lint dans le nom d'un dossier", () => {
    // Le faux positif qui a tout déclenché : `for d in native experiments
    // oxlint-plugin-t3code release` était compté comme un lancement de lint.
    // Un classifieur qui se trompe de ce côté-là certifie des preuves qui
    // n'existent pas.
    assert.deepEqual(
      preuvesDeCommande("for d in native experiments oxlint-plugin-t3code release", "", false),
      [],
    );
    assert.deepEqual(preuvesDeCommande("echo pnpm exec vitest", "", false), []);
    assert.deepEqual(preuvesDeCommande("ls apps/server/src/vitest-utils", "", false), []);
  });

  it("supporte l'environnement posé en préfixe", () => {
    const ps = preuvesDeCommande("GARDE_OK=1 CI=1 pnpm exec vp test run", vert, false);
    assert.equal(ps.length, 1);
    assert.equal(ps[0]?.nature, "tests");
  });

  it("ignore le tube en aval pour juger l'étendue", () => {
    // `| grep -v suggestion` ne rend pas la vérification ciblée.
    const ps = preuvesDeCommande("pnpm exec tsgo --noEmit 2>&1 | grep -v suggestion", vert, false);
    assert.equal(ps[0]?.etendue, "complete");
  });

  it("rend une liste VIDE quand rien n'est vérifié", () => {
    assert.deepEqual(preuvesDeCommande("git status --short && ls -la", "", false), []);
  });
});
