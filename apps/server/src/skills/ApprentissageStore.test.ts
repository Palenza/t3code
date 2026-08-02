import { assert, describe, it } from "@effect/vitest";

import { lireLeJournal, skillTouchee } from "./ApprentissageStore.ts";

const SEP = "\u001f";
const entete = (hash: string, secondes: number, sujet: string): string =>
  `${hash}${SEP}${String(secondes)}${SEP}${sujet}`;

describe("quel fichier appartient à quelle skill", () => {
  it("un fichier dans un dossier de skill nomme sa skill", () => {
    assert.equal(skillTouchee(".claude/skills/aspirer/SKILL.md"), "aspirer");
    assert.equal(skillTouchee("a/b/.claude/skills/usine/refs/notes.md"), "usine");
  });

  it("le dossier `skills` lui-même ne nomme aucune skill", () => {
    // `.claude/skills/README.md` touche les skills sans en muter une seule :
    // le compter attribuerait une mutation à une skill nommée « README.md ».
    assert.isNull(skillTouchee(".claude/skills/README.md"));
    assert.isNull(skillTouchee(".claude/skills"));
  });

  it("un fichier hors des skills est ignoré, pas une erreur", () => {
    // C'est le cas COURANT : un commit touche du code et une skill ensemble.
    assert.isNull(skillTouchee("apps/server/src/index.ts"));
  });
});

describe("lire le journal de git", () => {
  it("un commit qui touche une skill devient une mutation", () => {
    const mutations = lireLeJournal(
      [entete("abc", 1_700_000_000, "durcit le garde"), ".claude/skills/usine/SKILL.md", ""].join(
        "\n",
      ),
    );
    assert.lengthOf(mutations, 1);
    assert.equal(mutations[0]?.skill, "usine");
    assert.equal(mutations[0]?.quand, 1_700_000_000_000);
    assert.equal(mutations[0]?.libelle, "durcit le garde");
  });

  it("trois fichiers d'une même skill font UNE mutation, pas trois", () => {
    // Sinon le seuil de jugement se déclencherait sur la TAILLE du commit
    // plutôt que sur son existence.
    const mutations = lireLeJournal(
      [
        entete("abc", 1_700_000_000, "gros commit"),
        ".claude/skills/usine/SKILL.md",
        ".claude/skills/usine/refs/a.md",
        ".claude/skills/usine/refs/b.md",
      ].join("\n"),
    );
    assert.lengthOf(mutations, 1);
  });

  it("deux skills dans un même commit font deux mutations", () => {
    const mutations = lireLeJournal(
      [
        entete("abc", 1_700_000_000, "les deux"),
        ".claude/skills/usine/SKILL.md",
        ".claude/skills/voix/SKILL.md",
      ].join("\n"),
    );
    assert.deepEqual(
      mutations.map((m) => m.skill),
      ["usine", "voix"],
    );
  });

  it("un sujet de commit contenant des tirets et des tubes ne casse rien", () => {
    // La raison d'être du séparateur de contrôle : ce sujet-là aurait décalé
    // toute la lecture avec n'importe quel séparateur typographique.
    const sujet = "fix(x): a | b — c - d, et 2>&1";
    const mutations = lireLeJournal(
      [entete("abc", 1_700_000_000, sujet), ".claude/skills/usine/SKILL.md"].join("\n"),
    );
    assert.equal(mutations[0]?.libelle, sujet);
  });

  it("un horodatage illisible écarte le commit au lieu de le dater à 1970", () => {
    // Daté à 0, il tomberait AVANT toutes les observations et fabriquerait une
    // fenêtre « avant » vide pour une mutation qui n'a pas eu lieu là.
    const mutations = lireLeJournal(
      [`abc${SEP}pas-un-nombre${SEP}sujet`, ".claude/skills/usine/SKILL.md"].join("\n"),
    );
    assert.lengthOf(mutations, 0);
  });

  it("des fichiers avant tout en-tête sont ignorés", () => {
    assert.lengthOf(lireLeJournal(".claude/skills/usine/SKILL.md\n"), 0);
  });

  it("une sortie vide donne zéro mutation, jamais une erreur", () => {
    assert.lengthOf(lireLeJournal(""), 0);
    assert.lengthOf(lireLeJournal("\n\n"), 0);
  });

  it("un commit sans fichier de skill n'invente pas de mutation", () => {
    const mutations = lireLeJournal(
      [entete("abc", 1_700_000_000, "du code"), "apps/server/src/index.ts"].join("\n"),
    );
    assert.lengthOf(mutations, 0);
  });
});
