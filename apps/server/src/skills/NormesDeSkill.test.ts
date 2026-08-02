import { assert, describe, it } from "@effect/vitest";

import {
  controlerSkill,
  lireFrontmatter,
  MAX_DESCRIPTION,
  resumeDeControle,
} from "./NormesDeSkill.ts";

const skill = (frontmatter: string, corps = "# Titre\n\nCe que ça fait.") =>
  `---\n${frontmatter}\n---\n${corps}`;

const SAINE = skill(
  `name: livraison-propre
description: Committer et pousser sans aller-retour, palier de déploiement respecté.`,
);

describe("controlerSkill · le nom", () => {
  it("exige un nom en minuscules-avec-tirets", () => {
    for (const nom of ["Livraison Propre", "livraison_propre", "LivraisonPropre"]) {
      const m = controlerSkill({ texte: skill(`name: ${nom}\ndescription: Fait ceci.`) });
      assert.isTrue(
        m.some((x) => x.regle === "nom-mal-forme"),
        nom,
      );
    }
  });

  it("un nom absent est une ERREUR, pas un avertissement", () => {
    const m = controlerSkill({ texte: skill("description: Fait ceci.") });
    const vu = m.find((x) => x.regle === "nom-absent");
    assert.equal(vu?.gravite, "erreur");
    assert.include(vu?.quoiFaire ?? "", "nom de son dossier");
  });
});

describe("controlerSkill · la description", () => {
  it("borne à 240 caractères — le seuil est NOTRE mesure, pas la leur", () => {
    // Hermès borne à 60 parce que LEUR index tronque là. T3 ne tronque pas
    // (vérifié). Ce qui reste vrai chez nous, c'est le coût : 8 000 caractères
    // chargés à chaque session sur les 18 skills réelles, moyenne 444.
    const longue = "x".repeat(MAX_DESCRIPTION + 1);
    const m = controlerSkill({ texte: skill(`name: a-b\ndescription: ${longue}`) });
    const vu = m.find((x) => x.regle === "description-trop-longue");
    assert.equal(vu?.gravite, "avertissement");
    assert.include(vu?.quoiFaire ?? "", "CHAQUE session");
  });

  it("refuse les mots de vitrine, en français comme en anglais", () => {
    for (const mot of ["puissant", "comprehensive", "avancé"]) {
      const m = controlerSkill({ texte: skill(`name: a-b\ndescription: Un outil ${mot} pour X.`) });
      assert.isTrue(
        m.some((x) => x.regle === "mot-de-vitrine"),
        mot,
      );
    }
  });

  it("refuse une description qui répète le nom", () => {
    const m = controlerSkill({
      texte: skill("name: livraison-propre\ndescription: La livraison-propre du code."),
    });
    assert.isTrue(m.some((x) => x.regle === "description-repete-le-nom"));
  });
});

describe("controlerSkill · l'auteur, et la fuite qu'Hermès documente", () => {
  it("refuse un auteur pris à la MACHINE", () => {
    // Une skill se partage. Un nom pris au système, à la config git ou à la
    // session est une fuite de vie privée que personne n'a acceptée.
    const m = controlerSkill({
      texte: skill("name: a-b\ndescription: Fait ceci.\nauthor: enzo"),
      identiteDeLaMachine: ["enzo", "enzo.barreau@gmail.com"],
    });
    const vu = m.find((x) => x.regle === "auteur-pris-a-la-machine");
    assert.equal(vu?.gravite, "erreur");
    assert.include(vu?.quoiFaire ?? "", "se PARTAGE");
  });

  it("laisse passer un nom de projet", () => {
    const m = controlerSkill({
      texte: skill("name: a-b\ndescription: Fait ceci.\nauthor: T3 Code Raptor"),
      identiteDeLaMachine: ["enzo"],
    });
    assert.isFalse(m.some((x) => x.regle === "auteur-pris-a-la-machine"));
  });

  it("ne crie pas quand il n'y a pas d'auteur du tout", () => {
    assert.isFalse(
      controlerSkill({ texte: SAINE, identiteDeLaMachine: ["enzo"] }).some(
        (x) => x.regle === "auteur-pris-a-la-machine",
      ),
    );
  });
});

describe("controlerSkill · le corps", () => {
  it("signale une commande shell là où l'agent a un OUTIL", () => {
    // Nommer l'outil est ce qui fait une skill plutôt qu'une page de doc.
    for (const commande of ["cat src/index.ts", "grep -rn motif", "sed -i 's/a/b/'"]) {
      const m = controlerSkill({ texte: skill("name: a-b\ndescription: X.", commande) });
      assert.isTrue(
        m.some((x) => x.regle === "outil-shell-au-lieu-de-l-outil"),
        commande,
      );
    }
  });

  it("ne mord PAS sur un drapeau que l'outil ne remplace pas", () => {
    // `grep -rL` (fichiers SANS correspondance) n'a pas d'équivalent dans
    // l'outil `Grep`. Une première version l'interdisait — donc interdisait
    // ma propre skill `chaines`. Un contrôle qui interdit ce qu'il ne
    // remplace pas est un contrôle faux.
    const m = controlerSkill({
      texte: skill("name: a-b\ndescription: X.", 'grep -rL "<le passage obligé>" <le dossier>'),
    });
    assert.deepEqual(m, []);
  });

  it("signale un corps devenu un projet", () => {
    const gros = Array.from({ length: 500 }, (_, i) => `ligne ${i}`).join("\n");
    const m = controlerSkill({ texte: skill("name: a-b\ndescription: X.", gros) });
    const vu = m.find((x) => x.regle === "corps-trop-long");
    assert.include(vu?.quoiFaire ?? "", "scripts/");
  });
});

describe("controlerSkill · ce qui ne doit PAS crier", () => {
  it("une skill saine ne produit RIEN", () => {
    assert.deepEqual(controlerSkill({ texte: SAINE }), []);
    assert.equal(resumeDeControle([]), "Conforme aux normes.");
  });

  it("un `bash` ordinaire dans une procédure ne déclenche rien", () => {
    // Un contrôle qui crie sur du travail ordinaire finit débranché.
    const m = controlerSkill({
      texte: skill(
        "name: a-b\ndescription: X.",
        "Lance `npm run verify`, puis `git status --short`.",
      ),
    });
    assert.deepEqual(m, []);
  });
});

describe("lireFrontmatter", () => {
  it("lit les trois champs, guillemets compris", () => {
    const f = lireFrontmatter(skill(`name: a-b\ndescription: "Fait : ceci."\nauthor: X`));
    assert.equal(f.nom, "a-b");
    assert.equal(f.description, "Fait : ceci.");
    assert.equal(f.auteur, "X");
  });

  it("lit un SCALAIRE REPLIÉ — trouvé sur une vraie skill", () => {
    // `description: >` puis des lignes indentées est du YAML légitime, et
    // trois de nos skills l'utilisent. Une première version lisait « > » et
    // annonçait une description d'UN caractère : le contrôle accusait la
    // skill alors que le bug était chez lui.
    const f = lireFrontmatter(
      "---\nname: a-b\ndescription: >\n  Première ligne du texte,\n  et la suite.\n---\n# T",
    );
    assert.equal(f.description, "Première ligne du texte, et la suite.");
  });

  it("gère aussi le bloc littéral et les formes coupées", () => {
    for (const marque of ["|", ">-", "|-"]) {
      const f = lireFrontmatter(`---\nname: a-b\ndescription: ${marque}\n  Du texte.\n---\n# T`);
      assert.equal(f.description, "Du texte.", marque);
    }
  });

  it("rend des nulls sans frontmatter, au lieu d'échouer", () => {
    assert.deepEqual(lireFrontmatter("# Juste un titre"), {
      nom: null,
      description: null,
      auteur: null,
    });
  });
});
