import { assert, describe, it } from "@effect/vitest";

import { clotureSuffisante, enMarkdown, nomDeFichier, type FilAExporter } from "./EnMarkdown.ts";

const fil = (messages: FilAExporter["messages"]): FilAExporter => ({
  titre: "Un fil de travail",
  filId: "902afe28-662f-4456-bd26-07c8e0f49ba5",
  creeA: "2026-07-31T10:00:00.000Z",
  messages,
});

describe("clotureSuffisante", () => {
  it("ouvre plus long que la plus longue suite présente", () => {
    // Un message qui contient déjà ``` casse un bloc ouvert avec ```. Le
    // défaut ne se voit qu'en ouvrant le rendu, jamais dans le source.
    assert.equal(clotureSuffisante("du texte"), "```");
    assert.equal(clotureSuffisante("voici ```js\ncode\n```"), "````");
    assert.equal(clotureSuffisante("````````"), "`````````");
  });

  it("ne descend jamais sous trois", () => {
    assert.equal(clotureSuffisante("`inline`"), "```");
  });
});

describe("enMarkdown", () => {
  it("écrit un en-tête qui permet de RETROUVER l'original", () => {
    // Un export sans provenance devient anonyme au bout d'une semaine.
    const sortie = enMarkdown(
      fil([{ role: "user", texte: "salut", creeA: "2026-07-31T10:01:00Z" }]),
    );
    assert.include(sortie, "# Un fil de travail");
    assert.include(sortie, "902afe28-662f-4456-bd26-07c8e0f49ba5");
    assert.include(sortie, "1 message(s)");
  });

  it("CAVIARDE les secrets — un export voyage", () => {
    // Une conversation contient couramment une clé collée. Exporter sans
    // caviarder fabrique un fichier qui se promène avec les secrets dedans.
    const sortie = enMarkdown(
      fil([
        {
          role: "user",
          texte: `ma clé est sk-ant-api03-${"A".repeat(40)} tu peux tester ?`,
          creeA: "2026-07-31T10:01:00Z",
        },
      ]),
    );
    assert.notInclude(sortie, "A".repeat(40));
    assert.include(sortie, "sk-ant");
    assert.include(sortie, "***");
  });

  it("DIT que le texte a été caviardé", () => {
    // Sans cette ligne, un lecteur prend « sk-ant***f3a9 » pour la vraie clé
    // et cherche pourquoi elle ne marche pas.
    const sortie = enMarkdown(fil([]));
    assert.include(sortie, "masqués à l'export");
  });

  it("survit à un message qui contient lui-même des blocs de code", () => {
    const dedans = "voici du code :\n```ts\nconst x = 1;\n```\nvoilà";
    const sortie = enMarkdown(
      fil([{ role: "assistant", texte: dedans, creeA: "2026-07-31T10:02:00Z" }]),
    );
    // Le bloc englobant doit être plus long que celui qu'il contient, sinon
    // le rendu casse à partir de là.
    assert.include(sortie, "````");
    assert.include(sortie, "const x = 1;");
  });

  it("nomme les rôles en clair", () => {
    const sortie = enMarkdown(
      fil([
        { role: "user", texte: "a", creeA: "t1" },
        { role: "assistant", texte: "b", creeA: "t2" },
      ]),
    );
    assert.include(sortie, "## Humain — t1");
    assert.include(sortie, "## Agent — t2");
  });

  it("marque un message vide plutôt que de laisser un trou", () => {
    const sortie = enMarkdown(fil([{ role: "user", texte: "   ", creeA: "t1" }]));
    assert.include(sortie, "_(vide)_");
  });

  it("finit par exactement un retour à la ligne", () => {
    const sortie = enMarkdown(fil([{ role: "user", texte: "a", creeA: "t1" }]));
    assert.isTrue(sortie.endsWith("\n"));
    assert.isFalse(sortie.endsWith("\n\n"));
  });

  it("supporte un fil sans message", () => {
    const sortie = enMarkdown(fil([]));
    assert.include(sortie, "0 message(s)");
  });
});

describe("nomDeFichier", () => {
  it("ne fait JAMAIS confiance au titre", () => {
    // Le titre vient d'un modèle. Un nom qui contient `../` écrit ailleurs
    // que là où on croit.
    const nom = nomDeFichier("../../etc/passwd", "902afe28");
    assert.notInclude(nom, "/");
    assert.notInclude(nom, "..");
  });

  it("garde les accents lisibles en les aplatissant", () => {
    assert.include(nomDeFichier("Refonte du système", "abc12345"), "refonte-du-systeme");
  });

  it("borne la longueur et colle l'identifiant", () => {
    const nom = nomDeFichier("x".repeat(300), "902afe28-662f");
    assert.isBelow(nom.length, 80);
    assert.include(nom, "902afe28");
    assert.isTrue(nom.endsWith(".md"));
  });

  it("retombe sur un nom utilisable quand le titre ne donne rien", () => {
    assert.equal(nomDeFichier("!!! ??? ***", "902afe28"), "fil-902afe28.md");
    assert.equal(nomDeFichier("", "902afe28"), "fil-902afe28.md");
  });
});
