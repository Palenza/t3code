import { assert, describe, it } from "@effect/vitest";

import {
  classerLesSkills,
  etatDUneSkill,
  FENETRE_MINIMALE_MS,
  fenetreDe,
  resumeDUsage,
  type SkillSurDisque,
} from "./UsageDesSkills.ts";

const JOUR = 24 * 60 * 60 * 1000;
const MAINTENANT = Date.parse("2026-07-31T12:00:00.000Z");
/** Une fenêtre assez longue pour que « inutilisée » veuille dire quelque chose. */
const LARGE = { depuis: MAINTENANT - 60 * JOUR, jusqu: MAINTENANT };
/** La fenêtre RÉELLE mesurée le 31/07 : 7,1 jours. */
const REELLE = { depuis: Date.parse("2026-07-24T10:04:10Z"), jusqu: MAINTENANT };

const skill = (over: Partial<SkillSurDisque> = {}): SkillSurDisque => ({
  nom: "une-skill",
  neLe: MAINTENANT - 10 * JOUR,
  epinglee: false,
  ...over,
});

describe("etatDUneSkill", () => {
  it("un appel vu suffit — et la raison le chiffre", () => {
    const u = etatDUneSkill({
      skill: skill(),
      appels: { nom: "une-skill", appels: 4, dernierAppel: MAINTENANT - JOUR },
      fenetre: LARGE,
    });
    assert.equal(u.etat, "utilisée");
    assert.isFalse(u.archivable);
    assert.include(u.pourquoi, "4 appel(s)");
    assert.include(u.pourquoi, "2026-07-30");
  });

  it("REFUSE de conclure sur la fenêtre réelle de 7,1 jours", () => {
    // Le cas qui a motivé tout le module. Sur les données du 31/07, 14 skills
    // sur 17 sont muettes — dont `debug-navigateur`, que la loi du projet rend
    // obligatoire. Un curateur naïf en archiverait 82 %.
    const u = etatDUneSkill({ skill: skill(), appels: undefined, fenetre: REELLE });
    assert.equal(u.etat, "indécidable");
    assert.isFalse(u.archivable);
    assert.include(u.pourquoi, "7.1 jours");
    assert.include(u.pourquoi, "30.0");
  });

  it("REFUSE de conclure sur une skill plus vieille que l'observation", () => {
    // `debug-navigateur` : née le 30/05, observée depuis le 24/07. Son silence
    // d'avant n'a jamais été regardé.
    const u = etatDUneSkill({
      skill: skill({ nom: "debug-navigateur", neLe: Date.parse("2026-05-30T00:00:00Z") }),
      appels: undefined,
      fenetre: LARGE,
    });
    assert.equal(u.etat, "indécidable");
    assert.isFalse(u.archivable);
    assert.include(u.pourquoi, "AVANT le début de l'observation");
  });

  it("REFUSE de conclure quand la date de naissance est inconnue", () => {
    const u = etatDUneSkill({ skill: skill({ neLe: null }), appels: undefined, fenetre: LARGE });
    assert.equal(u.etat, "indécidable");
    assert.include(u.pourquoi, "on ne sait pas quand");
  });

  it("REFUSE de conclure sans aucune donnée", () => {
    const u = etatDUneSkill({ skill: skill(), appels: undefined, fenetre: null });
    assert.equal(u.etat, "indécidable");
    assert.include(u.pourquoi, "on n'a rien observé");
  });

  it("conclut à l'inutilité SEULEMENT quand plus rien ne s'y oppose", () => {
    const u = etatDUneSkill({ skill: skill(), appels: undefined, fenetre: LARGE });
    assert.equal(u.etat, "inutilisée");
    assert.isTrue(u.archivable);
    assert.include(u.pourquoi, "toute sa vie");
  });

  it("une ÉPINGLÉE se mesure mais ne s'archive jamais", () => {
    // Orthogonal à l'état : on garde le constat honnête, on retire le geste.
    const u = etatDUneSkill({
      skill: skill({ epinglee: true }),
      appels: undefined,
      fenetre: LARGE,
    });
    assert.equal(u.etat, "inutilisée");
    assert.isFalse(u.archivable);
    assert.include(u.pourquoi, "ÉPINGLÉE");
  });

  it("le plancher est une BORNE, pas un arrondi", () => {
    const juste = { depuis: MAINTENANT - FENETRE_MINIMALE_MS, jusqu: MAINTENANT };
    const uneMsDeMoins = { depuis: juste.depuis + 1, jusqu: MAINTENANT };
    assert.equal(
      etatDUneSkill({
        skill: skill({ neLe: juste.depuis + JOUR }),
        appels: undefined,
        fenetre: juste,
      }).etat,
      "inutilisée",
    );
    assert.equal(
      etatDUneSkill({
        skill: skill({ neLe: juste.depuis + JOUR }),
        appels: undefined,
        fenetre: uneMsDeMoins,
      }).etat,
      "indécidable",
    );
  });

  it("zéro appel explicite se lit comme aucun appel", () => {
    // Le magasin peut rendre une ligne à 0 ; elle ne doit pas passer pour un usage.
    const u = etatDUneSkill({
      skill: skill(),
      appels: { nom: "une-skill", appels: 0, dernierAppel: null },
      fenetre: LARGE,
    });
    assert.equal(u.etat, "inutilisée");
  });
});

describe("fenetreDe", () => {
  it("rend null sur rien — on ne fabrique pas une fenêtre vide", () => {
    assert.isNull(fenetreDe([]));
  });

  it("trouve les bornes quel que soit l'ordre", () => {
    assert.deepEqual(fenetreDe([300, 100, 200]), { depuis: 100, jusqu: 300 });
  });

  it("un seul point donne une fenêtre de durée nulle", () => {
    assert.deepEqual(fenetreDe([42]), { depuis: 42, jusqu: 42 });
  });
});

describe("classerLesSkills", () => {
  it("garde l'ordre du disque — deux passages rendent la même liste", () => {
    const surDisque = [skill({ nom: "a" }), skill({ nom: "b" }), skill({ nom: "c" })];
    const appels = [{ nom: "b", appels: 2, dernierAppel: MAINTENANT }];
    const une = classerLesSkills({ surDisque, appels, fenetre: LARGE });
    const deux = classerLesSkills({ surDisque, appels, fenetre: LARGE });
    assert.deepEqual(
      une.map((u) => u.nom),
      ["a", "b", "c"],
    );
    assert.deepEqual(une, deux);
  });

  it("un appel pour une skill ABSENTE du disque est ignoré, pas fatal", () => {
    // Une skill supprimée garde ses traces dans la projection.
    const usages = classerLesSkills({
      surDisque: [skill({ nom: "a" })],
      appels: [{ nom: "disparue", appels: 9, dernierAppel: MAINTENANT }],
      fenetre: LARGE,
    });
    assert.equal(usages.length, 1);
    assert.equal(usages[0]?.nom, "a");
  });
});

describe("resumeDUsage", () => {
  it("nomme la FENÊTRE avant les chiffres", () => {
    // Sans elle, « 14 inutilisées » se lit comme un fait alors que c'est une
    // observation (H4).
    const usages = classerLesSkills({
      surDisque: [skill({ nom: "a" }), skill({ nom: "b" })],
      appels: [{ nom: "a", appels: 1, dernierAppel: MAINTENANT }],
      fenetre: REELLE,
    });
    const texte = resumeDUsage(usages, REELLE);
    assert.isTrue(texte.startsWith("observé sur 7.1 jours"), texte);
    assert.include(texte, "1 utilisée(s)");
    assert.include(texte, "1 indécidable(s)");
  });

  it("le dit quand il n'y a rien à dire", () => {
    assert.include(resumeDUsage([], null), "aucune observation disponible");
  });
});
