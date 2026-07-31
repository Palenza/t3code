import { assert, describe, it } from "@effect/vitest";

import {
  quiPeutParler,
  REPONSE_AU_REFUS,
  type Autorisations,
  type Provenance,
} from "./QuiPeutParler.ts";

const RIEN: Autorisations = { canaux: new Set(), personnes: new Set() };

const venant = (partiel: Partial<Provenance> = {}): Provenance => ({
  plateforme: "telegram",
  canal: "-100999",
  expediteur: "42",
  ...partiel,
});

describe("le défaut est le REFUS", () => {
  it("sans aucune autorisation, personne ne passe", () => {
    // Une passerelle qui laisse passer faute de configuration est une
    // passerelle ouverte. C'est la règle qui protège tout le reste.
    assert.isFalse(quiPeutParler(venant(), RIEN).passe);
  });

  it("une autorisation sur une AUTRE plateforme ne vaut rien ici", () => {
    const verdict = quiPeutParler(venant({ plateforme: "discord" }), {
      canaux: new Set(["telegram:-100999"]),
      personnes: new Set(["telegram:42"]),
    });
    assert.isFalse(verdict.passe);
  });

  it("le refus dit QUOI FAIRE, pas seulement non", () => {
    const verdict = quiPeutParler(venant(), RIEN);
    assert.isFalse(verdict.passe);
    if (!verdict.passe) {
      assert.include(verdict.quoiFaire, "appaire-le explicitement");
      assert.include(verdict.quoiFaire, "telegram:-100999");
      assert.include(verdict.quoiFaire, "refuse par défaut");
    }
  });
});

describe("les OUI explicites", () => {
  it("un canal appairé laisse passer", () => {
    const verdict = quiPeutParler(venant(), {
      canaux: new Set(["telegram:-100999"]),
      personnes: new Set(),
    });
    assert.isTrue(verdict.passe);
  });

  it("une personne autorisée passe, quel que soit le canal", () => {
    const verdict = quiPeutParler(venant({ canal: "-100000" }), {
      canaux: new Set(),
      personnes: new Set(["telegram:42"]),
    });
    assert.isTrue(verdict.passe);
  });
});

describe("un message SANS expéditeur", () => {
  it("passe quand même si le canal est appairé", () => {
    // Telegram émet des messages d'administrateur anonyme et des diffusions
    // de canal sans expéditeur. L'humain qui a autorisé le canal ne doit pas
    // voir ses propres messages refusés sans comprendre.
    const verdict = quiPeutParler(venant({ expediteur: null }), {
      canaux: new Set(["telegram:-100999"]),
      personnes: new Set(),
    });
    assert.isTrue(verdict.passe);
  });

  it("est refusé si RIEN n'est appairé — et le refus le nomme", () => {
    const verdict = quiPeutParler(venant({ expediteur: null }), RIEN);
    assert.isFalse(verdict.passe);
    assert.include(verdict.pourquoi, "anonyme");
  });
});

describe("la délégation à l'amont — et le piège qu'ils documentent", () => {
  it("un message marqué par le transport passe", () => {
    const verdict = quiPeutParler(venant({ authentifieEnAmont: true }), RIEN);
    assert.isTrue(verdict.passe);
    assert.include(verdict.pourquoi, "relais");
  });

  it("SEUL le booléen `true` compte — pas ce qui lui ressemble", () => {
    // C'est leur détail, copié mot pour mot : `is True` et non « est vrai ».
    // Une chaîne venue de JSON, un 1, un objet de test auto-vivifié passeraient
    // une vérification large. Chacun est une façon RÉALISTE de se tromper, et
    // chacune ouvrirait la passerelle en grand.
    for (const faux of ["true", 1, {}, [], "yes", Number.NaN, "1"]) {
      const verdict = quiPeutParler(venant({ authentifieEnAmont: faux }), RIEN);
      assert.isFalse(verdict.passe, `« ${String(faux)} » ne doit PAS autoriser`);
    }
  });

  it("l'absence de marqueur ne vaut pas autorisation", () => {
    assert.isFalse(quiPeutParler(venant({ authentifieEnAmont: undefined }), RIEN).passe);
    assert.isFalse(quiPeutParler(venant({ authentifieEnAmont: null }), RIEN).passe);
  });
});

describe("ce qu'on répond à un inconnu", () => {
  it("ne dit ni que l'agent existe, ni qui le possède, ni comment entrer", () => {
    // Un refus bavard sur un salon public est une invitation : il apprend à
    // un inconnu qu'il y a quelque chose à forcer.
    for (const mot of ["Enzo", "T3", "agent", "autoris", "appair", "admin"]) {
      assert.notInclude(REPONSE_AU_REFUS.toLowerCase(), mot.toLowerCase());
    }
  });
});
