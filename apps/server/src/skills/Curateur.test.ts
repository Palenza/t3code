import { assert, describe, it } from "@effect/vitest";

import {
  deciderPour,
  JOURS_AVANT_ARCHIVE,
  JOURS_AVANT_DORMANCE,
  passageDuCurateur,
  resumeDuPassage,
  type SkillCuree,
} from "./Curateur.ts";

const JOUR = 24 * 60 * 60 * 1000;
const MAINTENANT = Date.parse("2026-07-31T12:00:00.000Z");
const ilYA = (jours: number) => MAINTENANT - jours * JOUR;

/** Une skill de l'agent, jamais utilisée, vue depuis longtemps. */
const skill = (over: Partial<SkillCuree> = {}): SkillCuree => ({
  nom: "une-skill",
  etatDeVie: "active",
  epinglee: false,
  creeeParLAgent: true,
  usage: "inutilisée",
  dernierAppel: null,
  neeLe: ilYA(200),
  dejaVue: true,
  ...over,
});

describe("les invariants stricts — ce qui interdit TOUT geste", () => {
  it("une ÉPINGLÉE échappe à tout", () => {
    const d = deciderPour(skill({ epinglee: true }), MAINTENANT);
    assert.equal(d.geste, "rien");
    assert.include(d.pourquoi, "épinglée");
  });

  it("ce que l'AGENT n'a pas créé ne lui appartient pas", () => {
    const d = deciderPour(skill({ creeeParLAgent: false }), MAINTENANT);
    assert.equal(d.geste, "rien");
    assert.include(d.pourquoi, "écrite par l'humain");
  });

  it("un usage INDÉCIDABLE interdit tout — le lien avec le n°2", () => {
    // Sans cette règle, le curateur archiverait 82 % des skills sur les
    // données du 31/07, dont celles que la LOI rend obligatoires.
    const d = deciderPour(skill({ usage: "indécidable", neeLe: ilYA(500) }), MAINTENANT);
    assert.equal(d.geste, "rien");
    assert.include(d.pourquoi, "INDÉCIDABLE");
  });

  it("les invariants passent AVANT le calcul d'âge", () => {
    // Une skill épinglée ET vieille de 500 jours ne doit pas être archivée :
    // l'ordre des refus est la doctrine.
    for (const over of [
      { epinglee: true },
      { creeeParLAgent: false },
      { usage: "indécidable" as const },
    ]) {
      assert.equal(deciderPour(skill({ ...over, neeLe: ilYA(500) }), MAINTENANT).geste, "rien");
    }
  });
});

describe("la première vue — le piège qu'Hermès a payé", () => {
  it("on AMORCE l'horloge, on n'archive pas", () => {
    // Sans ça, allumer le curateur archiverait d'un coup tout ce qui dort
    // depuis toujours — au moment précis où personne ne s'y attend.
    const d = deciderPour(skill({ dejaVue: false, neeLe: ilYA(400) }), MAINTENANT);
    assert.equal(d.geste, "amorcer");
    assert.include(d.pourquoi, "MAINTENANT");
  });
});

describe("le silence prouvé", () => {
  it("30 jours → dormante ; 90 → archivée", () => {
    assert.equal(deciderPour(skill({ neeLe: ilYA(29) }), MAINTENANT).geste, "rien");
    assert.equal(
      deciderPour(skill({ neeLe: ilYA(JOURS_AVANT_DORMANCE) }), MAINTENANT).geste,
      "endormir",
    );
    assert.equal(
      deciderPour(skill({ neeLe: ilYA(JOURS_AVANT_ARCHIVE) }), MAINTENANT).geste,
      "archiver",
    );
  });

  it("le mot ARCHIVE est dit, et jamais « supprimé »", () => {
    // Invariant n°2 : il n'efface jamais. Une archive se récupère.
    const d = deciderPour(skill({ neeLe: ilYA(120) }), MAINTENANT);
    assert.include(d.pourquoi, "ARCHIVÉE");
    assert.include(d.pourquoi, "se récupère");
    assert.notInclude(d.pourquoi.toLowerCase(), "supprim");
  });

  it("l'ancrage est le DERNIER APPEL, pas la naissance", () => {
    // Une skill née il y a un an mais utilisée hier est active.
    const d = deciderPour(
      skill({ neeLe: ilYA(400), dernierAppel: ilYA(1), usage: "utilisée" }),
      MAINTENANT,
    );
    assert.equal(d.geste, "rien");
  });

  it("une skill NEUVE ne s'archive pas elle-même", () => {
    assert.equal(deciderPour(skill({ neeLe: ilYA(2) }), MAINTENANT).geste, "rien");
  });

  it("sans ancrage du tout, on ne fait rien", () => {
    const d = deciderPour(skill({ neeLe: null, dernierAppel: null }), MAINTENANT);
    assert.equal(d.geste, "rien");
    assert.include(d.pourquoi, "rien à quoi ancrer");
  });

  it("une skill archivée ne se réarchive pas", () => {
    assert.equal(
      deciderPour(skill({ etatDeVie: "archivee", neeLe: ilYA(300) }), MAINTENANT).geste,
      "rien",
    );
  });
});

describe("le réveil", () => {
  it("une dormante qui ressert redevient active", () => {
    const d = deciderPour(
      skill({ etatDeVie: "dormante", usage: "utilisée", dernierAppel: ilYA(1) }),
      MAINTENANT,
    );
    assert.equal(d.geste, "reveiller");
  });

  it("une archivée qui ressert aussi — l'archive n'est pas une tombe", () => {
    const d = deciderPour(
      skill({ etatDeVie: "archivee", usage: "utilisée", dernierAppel: ilYA(1) }),
      MAINTENANT,
    );
    assert.equal(d.geste, "reveiller");
  });

  it("une active qui sert ne bouge pas", () => {
    assert.equal(deciderPour(skill({ usage: "utilisée" }), MAINTENANT).geste, "rien");
  });
});

describe("le passage complet", () => {
  it("garde l'ordre reçu et ne varie pas d'un lancement à l'autre", () => {
    const lot = [skill({ nom: "a" }), skill({ nom: "b", epinglee: true }), skill({ nom: "c" })];
    const un = passageDuCurateur(lot, MAINTENANT);
    assert.deepEqual(
      un.map((d) => d.nom),
      ["a", "b", "c"],
    );
    assert.deepEqual(un, passageDuCurateur(lot, MAINTENANT));
  });

  it("sur les données du 31/07, le curateur ne fait RIEN", () => {
    // 17 skills, toutes `indécidable` parce que la fenêtre d'observation ne
    // fait que 7,1 jours. C'est la réponse vraie, et elle rend le curateur sûr
    // par construction tant qu'on n'a pas d'historique.
    const lot = Array.from({ length: 17 }, (_, i) =>
      skill({ nom: `skill-${i}`, usage: "indécidable", neeLe: ilYA(60) }),
    );
    const decisions = passageDuCurateur(lot, MAINTENANT);
    assert.deepEqual(
      decisions.filter((d) => d.geste !== "rien"),
      [],
    );
    assert.include(resumeDuPassage(decisions), "aucun geste");
    assert.include(resumeDuPassage(decisions), "réponse normale");
  });

  it("le résumé dit que rien n'a été effacé", () => {
    const decisions = passageDuCurateur([skill({ neeLe: ilYA(200) })], MAINTENANT);
    assert.include(resumeDuPassage(decisions), "Rien n'a été effacé");
  });
});
