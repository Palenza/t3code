import { assert, describe, it } from "@effect/vitest";

import { ancetresDuPlusProfond, estConfine, verdictDeChemin } from "./CheminSur.ts";

describe("estConfine", () => {
  it("accepte ce qui reste dedans", () => {
    assert.isTrue(estConfine("src/index.ts"));
    assert.isTrue(estConfine("a/b/c.txt"));
    // La racine elle-même : `path.relative(x, x)` rend "".
    assert.isTrue(estConfine(""));
  });

  it("refuse ce qui remonte", () => {
    assert.isFalse(estConfine(".."));
    assert.isFalse(estConfine("../dehors/vole.txt"));
  });

  it("refuse un ABSOLU — deux volumes, aucun ancêtre commun", () => {
    // Le cas le plus franc de sortie, et le plus facile à oublier :
    // `path.relative` rend un chemin absolu quand il ne trouve rien de commun.
    assert.isFalse(estConfine("/etc/passwd"));
    assert.isFalse(estConfine("C:\\Windows\\system32"));
  });

  it("ne confond pas un nom qui COMMENCE par deux points", () => {
    // `..caché` est un nom de fichier légitime, pas une remontée.
    assert.isTrue(estConfine("..cache/fichier"));
    assert.isTrue(estConfine("..gitignore"));
  });

  it("respecte le séparateur qu'on lui donne", () => {
    assert.isFalse(estConfine("..\\dehors", "\\"));
  });
});

describe("verdictDeChemin", () => {
  it("se tait quand c'est sûr", () => {
    const v = verdictDeChemin({
      demande: "src/a.ts",
      racineReelle: "/depot",
      cibleReelle: "/depot/src/a.ts",
      relatif: "src/a.ts",
    });
    assert.isTrue(v.sur);
    assert.equal(v.pourquoi, "");
  });

  it("nomme les TROIS chemins — un agent répare « ça mène à /tmp/dehors »", () => {
    // Le cas réel démontré le 31/07 : `sous/lien/vole.txt` où `sous/lien`
    // pointe hors du dépôt.
    const v = verdictDeChemin({
      demande: "sous/lien/vole.txt",
      racineReelle: "/private/tmp/essai/depot",
      cibleReelle: "/private/tmp/essai/dehors/vole.txt",
      relatif: "../dehors/vole.txt",
    });
    assert.isFalse(v.sur);
    assert.include(v.pourquoi, "sous/lien/vole.txt");
    assert.include(v.pourquoi, "/private/tmp/essai/dehors/vole.txt");
    assert.include(v.pourquoi, "/private/tmp/essai/depot");
  });
});

describe("ancetresDuPlusProfond", () => {
  it("remonte du plus profond vers la racine", () => {
    // Le dernier segment est le fichier à créer : il n'existe pas encore par
    // définition, donc on part de son dossier.
    assert.deepEqual(ancetresDuPlusProfond("a/b/c/fichier.txt"), ["a/b/c", "a/b", "a", ""]);
  });

  it("finit TOUJOURS par la racine — la recherche se termine", () => {
    // Sans ce dernier élément, un chemin dont aucun ancêtre n'existe ferait
    // boucler ou échouer la recherche.
    for (const chemin of ["a.txt", "a/b.txt", "a/b/c/d/e.txt"]) {
      assert.equal(ancetresDuPlusProfond(chemin).at(-1), "", chemin);
    }
  });

  it("ignore les segments vides et les points seuls", () => {
    assert.deepEqual(ancetresDuPlusProfond("a//./b/c.txt"), ["a/b", "a", ""]);
  });

  it("supporte les deux séparateurs en entrée", () => {
    assert.deepEqual(ancetresDuPlusProfond("a\\b\\c.txt"), ["a/b", "a", ""]);
  });

  it("sur un fichier à la racine, rend juste la racine", () => {
    assert.deepEqual(ancetresDuPlusProfond("fichier.txt"), [""]);
  });
});
