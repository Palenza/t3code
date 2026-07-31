import { assert, describe, it } from "@effect/vitest";

import {
  BLUEPRINTS,
  enAmorce,
  enCommande,
  enFormulaire,
  remplir,
  type Blueprint,
} from "./Blueprint.ts";

const essai: Blueprint = {
  id: "essai",
  titre: "Un essai",
  aQuoiCaSert: "essayer",
  recurrence: "chaque jour à {heure}, {jours}",
  consigne: "Fais le point à {heure} pendant {combien} minutes.",
  emplacements: [
    { nom: "heure", type: "heure", libelle: "Heure", requis: true },
    { nom: "jours", type: "jours", libelle: "Jours", defaut: "lun,mar", requis: true },
    { nom: "combien", type: "nombre", libelle: "Durée", defaut: "15", requis: true },
  ],
};

describe("remplir", () => {
  it("substitue partout, récurrence ET consigne", () => {
    const r = remplir(essai, { heure: "08:30" });
    assert.isTrue(r.ok);
    if (!r.ok) return;
    assert.equal(r.recurrence, "chaque jour à 08:30, lun,mar");
    assert.equal(r.consigne, "Fais le point à 08:30 pendant 15 minutes.");
  });

  it("rend TOUS les refus d'un coup, jamais le premier seul", () => {
    // Corriger un champ pour découvrir le suivant, puis le suivant, est la
    // façon la plus sûre de faire abandonner quelqu'un devant un formulaire.
    const r = remplir(essai, { heure: "8h30", jours: "lundi", combien: "beaucoup" });
    assert.isFalse(r.ok);
    if (r.ok) return;
    assert.equal(r.refus.length, 3);
  });

  it("dit ce qui était attendu ET ce qui a été reçu", () => {
    const r = remplir(essai, { heure: "25:00" });
    assert.isFalse(r.ok);
    if (r.ok) return;
    assert.include(r.refus[0]?.pourquoi ?? "", "HH:MM");
    assert.include(r.refus[0]?.pourquoi ?? "", "25:00");
  });

  it("refuse les jours inconnus en NOMMANT lesquels", () => {
    const r = remplir(essai, { heure: "08:00", jours: "lun, lundi, xyz" });
    assert.isFalse(r.ok);
    if (r.ok) return;
    assert.include(r.refus[0]?.pourquoi ?? "", "lundi");
    assert.include(r.refus[0]?.pourquoi ?? "", "xyz");
    // Le jour VALIDE ne doit pas être accusé.
    assert.notInclude(r.refus[0]?.pourquoi.split("reçu")[1] ?? "", "lun,");
  });

  it("normalise les jours quelle que soit la séparation", () => {
    const r = remplir(essai, { heure: "08:00", jours: "LUN mar,  MER" });
    assert.isTrue(r.ok);
    if (!r.ok) return;
    assert.include(r.recurrence, "lun,mar,mer");
  });

  it("réclame un emplacement obligatoire sans défaut", () => {
    const r = remplir(essai, {});
    assert.isFalse(r.ok);
    if (r.ok) return;
    assert.equal(r.refus[0]?.emplacement, "heure");
    assert.include(r.refus[0]?.pourquoi ?? "", "obligatoire");
  });

  it("accepte minuit et refuse 24:00", () => {
    assert.isTrue(remplir(essai, { heure: "00:00" }).ok);
    assert.isFalse(remplir(essai, { heure: "24:00" }).ok);
    assert.isFalse(remplir(essai, { heure: "12:60" }).ok);
  });
});

describe("les trois rendus viennent de la MÊME définition", () => {
  it("le formulaire expose un champ par emplacement, avec son aide", () => {
    const champs = enFormulaire(essai);
    assert.deepEqual(
      champs.map((c) => c.nom),
      ["heure", "jours", "combien"],
    );
    assert.include(champs[0]?.aide ?? "", "08:30");
    assert.include(champs[1]?.aide ?? "", "lun");
  });

  it("la commande est pré-remplie et prête à corriger", () => {
    const ligne = enCommande(essai, { heure: "08:30" });
    assert.include(ligne, "/blueprint essai");
    assert.include(ligne, "--heure=08:30");
    // Les défauts sont posés, pas laissés vides : on corrige plus vite qu'on
    // ne devine.
    assert.include(ligne, "--jours=lun,mar");
  });

  it("l'amorce dit à l'agent de DEMANDER, jamais d'inventer", () => {
    // Un agent qui choisit une heure à la place de l'humain fabrique une
    // automatisation qui se déclenche au mauvais moment.
    const amorce = enAmorce(essai);
    assert.include(amorce, "Demande d'abord");
    assert.include(amorce, "Heure");
    assert.include(amorce, "N'invente aucune valeur");
  });

  it("l'amorce ne réclame rien quand tout a un défaut", () => {
    const complet: Blueprint = {
      ...essai,
      emplacements: essai.emplacements.map((e) => ({ ...e, defaut: e.defaut ?? "08:00" })),
    };
    assert.notInclude(enAmorce(complet), "Demande d'abord");
  });
});

describe("les blueprints livrés", () => {
  it("se remplissent tous avec leurs seuls défauts", () => {
    // Un blueprint livré qui ne marche pas sans réglage est un blueprint que
    // personne n'essaie.
    for (const blueprint of BLUEPRINTS) {
      const r = remplir(blueprint, {});
      assert.isTrue(r.ok, `${blueprint.id} ne se remplit pas seul`);
    }
  });

  it("ne laissent aucun emplacement non substitué", () => {
    // Un `{seuil}` resté dans le texte partirait tel quel à l'agent.
    for (const blueprint of BLUEPRINTS) {
      const r = remplir(blueprint, {});
      if (!r.ok) continue;
      assert.notInclude(r.recurrence, "{", blueprint.id);
      assert.notInclude(r.consigne, "{", blueprint.id);
    }
  });

  it("portent tous un identifiant unique", () => {
    const ids = BLUEPRINTS.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
