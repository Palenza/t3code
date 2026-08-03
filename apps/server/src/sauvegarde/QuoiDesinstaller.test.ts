import { assert, describe, it } from "@effect/vitest";

import {
  planDeDesinstallation,
  resumeAvantDeffacer,
  seulementCeQuiPart,
  sortDe,
  type Element,
  type Granularite,
} from "./QuoiDesinstaller.ts";

/** Ce que T3 pose et côtoie sur une vraie machine. */
const ELEMENTS: Element[] = [
  { chemin: "/Applications/Raptor.app", appartenance: "application", quoi: "l'application" },
  {
    chemin: "~/.claude-compte-a/skills/raptor-outillage",
    appartenance: "outillage-depose",
    quoi: "la skill d'outillage déposée dans un home Claude",
  },
  { chemin: "~/.t3/userdata", appartenance: "etat-de-t3", quoi: "les réglages et les fils" },
  {
    chemin: "~/.claude-compte-a",
    appartenance: "a-l-utilisateur",
    quoi: "le home Claude, avec ses identifiants et ses conversations",
  },
  {
    chemin: "~/Documents/Palenza",
    appartenance: "a-l-utilisateur",
    quoi: "un dépôt de l'utilisateur",
  },
];

const TOUTES: Granularite[] = ["app-seule", "app-et-outillage", "tout"];

describe("ce qui ne se touche JAMAIS", () => {
  it("le home Claude et les dépôts survivent aux TROIS granularités", () => {
    // Ils contiennent les identifiants, les conversations, le travail. Ils
    // existaient avant T3 et existeront après.
    for (const granularite of TOUTES) {
      for (const element of ELEMENTS.filter((e) => e.appartenance === "a-l-utilisateur")) {
        const v = sortDe(element, granularite);
        assert.equal(v.sort, "jamais", `${element.chemin} @ ${granularite}`);
        assert.include(v.pourquoi, "NE SE TOUCHE JAMAIS");
      }
    }
  });

  it("même la granularité « tout » ne les inclut pas", () => {
    const partants = seulementCeQuiPart(planDeDesinstallation(ELEMENTS, "tout"));
    assert.notInclude(partants, "~/.claude-compte-a");
    assert.notInclude(partants, "~/Documents/Palenza");
  });
});

describe("les trois granularités", () => {
  it("« app seule » ne retire QUE l'application", () => {
    const partants = seulementCeQuiPart(planDeDesinstallation(ELEMENTS, "app-seule"));
    assert.deepEqual(partants, ["/Applications/Raptor.app"]);
  });

  it("« app et outillage » emporte ce que T3 a déposé chez l'utilisateur", () => {
    // Laisser une skill orpheline qui parle d'un outil disparu est une
    // nuisance, pas une politesse.
    const partants = seulementCeQuiPart(planDeDesinstallation(ELEMENTS, "app-et-outillage"));
    assert.include(partants, "~/.claude-compte-a/skills/raptor-outillage");
    assert.notInclude(partants, "~/.t3/userdata");
  });

  it("« tout » emporte aussi l'état de T3", () => {
    const partants = seulementCeQuiPart(planDeDesinstallation(ELEMENTS, "tout"));
    assert.include(partants, "~/.t3/userdata");
    assert.equal(partants.length, 3);
  });

  it("un élément CONSERVÉ dit qu'une réinstallation le retrouvera", () => {
    const v = sortDe(ELEMENTS[2] as Element, "app-seule");
    assert.equal(v.sort, "garder");
    assert.include(v.pourquoi, "réinstallation");
  });
});

describe("le résumé montré AVANT d'effacer", () => {
  it("dit d'abord ce qui RESTE", () => {
    // Un humain qui désinstalle a peur de perdre quelque chose. Lui montrer
    // les suppressions en premier répond à une question qu'il ne se pose pas.
    const texte = resumeAvantDeffacer(planDeDesinstallation(ELEMENTS, "tout"), "tout");
    assert.isBelow(texte.indexOf("RESTE INTACT"), texte.indexOf("SERA RETIRÉ"));
    assert.include(texte, "tes comptes, tes conversations, tes dépôts");
  });

  it("nomme chaque chemin qui part", () => {
    const texte = resumeAvantDeffacer(planDeDesinstallation(ELEMENTS, "tout"), "tout");
    assert.include(texte, "/Applications/Raptor.app");
    assert.include(texte, "~/.t3/userdata");
  });
});

describe("le garde de dernière seconde", () => {
  it("ne laisse passer QUE les « retirer »", () => {
    // Il ne remplace pas la table, il la contrôle : si quelqu'un ajoute une
    // granularité et oublie une colonne, ce filtre rattrape.
    const verdicts = planDeDesinstallation(ELEMENTS, "tout");
    const partants = seulementCeQuiPart(verdicts);
    assert.equal(partants.length, verdicts.filter((v) => v.sort === "retirer").length);
    for (const chemin of partants) {
      const element = ELEMENTS.find((e) => e.chemin === chemin);
      assert.notEqual(element?.appartenance, "a-l-utilisateur");
    }
  });

  it("sur une liste vide, il ne rend rien plutôt que de deviner", () => {
    assert.deepEqual(seulementCeQuiPart(planDeDesinstallation([], "tout")), []);
  });
});
