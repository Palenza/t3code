import { assert, describe, it } from "@effect/vitest";

import {
  diagnostiquerComptes,
  diagnostiquerIndex,
  diagnostiquerPannes,
  lirePannes,
  verdictGeneral,
  DERIVE_INDEX_TOLEREE,
  SEUIL_QUOTA_ALERTE,
  SEUIL_RECIDIVE,
  type CompteObserve,
} from "./Diagnostic.ts";

const compte = (over: Partial<CompteObserve> = {}): CompteObserve => ({
  nom: "A",
  sante: "ok",
  septJours: 10,
  cinqHeures: 0,
  authExpiree: false,
  ...over,
});

describe("les comptes", () => {
  it("se tait quand tout va bien", () => {
    const c = diagnostiquerComptes([compte(), compte({ nom: "B" })]);
    assert.equal(c.length, 1);
    assert.equal(c[0]?.gravite, "ok");
    assert.equal(c[0]?.geste, "");
  });

  it("nomme le geste sur une session expirée — c'est le cas RÉEL du 31/07", () => {
    // On cherche le constat par SUJET, pas par position : avec un seul
    // compte expiré, « aucun compte utilisable » passe légitimement devant.
    const c = diagnostiquerComptes([compte({ nom: "C", authExpiree: true }), compte({ nom: "B" })]);
    const sien = c.find((constat) => constat.sujet === "compte C");
    assert.equal(sien?.gravite, "casse");
    assert.include(sien?.geste ?? "", "claude /login");
    assert.include(sien?.geste ?? "", "CLAUDE_CONFIG_DIR");
  });

  it("alerte AVANT la panne, pas après", () => {
    // À 100 % il est déjà trop tard : le compte a cessé de servir au milieu
    // d'un travail. Le fil-piège est posé à 90 %.
    const alerte = diagnostiquerComptes([compte({ septJours: SEUIL_QUOTA_ALERTE })]);
    assert.equal(alerte[0]?.gravite, "attention");
    assert.include(alerte[0]?.observe ?? "", "90");

    const sain = diagnostiquerComptes([compte({ septJours: SEUIL_QUOTA_ALERTE - 1 })]);
    assert.equal(sain[0]?.gravite, "ok");
  });

  it("prend la PIRE des deux fenêtres, pas la plus flatteuse", () => {
    const c = diagnostiquerComptes([compte({ septJours: 5, cinqHeures: 100 })]);
    assert.equal(c[0]?.gravite, "casse");
  });

  it("fait l'ADDITION que personne ne fait en lisant une liste", () => {
    // Le détail par compte dit déjà tout en pièces détachées. Mais « aucun
    // compte utilisable » est la seule ligne qui explique pourquoi plus rien
    // ne part — et elle doit arriver en TÊTE.
    const c = diagnostiquerComptes([
      compte({ nom: "A", septJours: 100 }),
      compte({ nom: "B", authExpiree: true }),
      compte({ nom: "C", sante: "mort" }),
    ]);
    assert.equal(c[0]?.sujet, "pool de comptes");
    assert.include(c[0]?.observe ?? "", "aucun compte utilisable sur 3");
  });

  it("ne crie pas « aucun utilisable » tant qu'il en reste un", () => {
    const c = diagnostiquerComptes([compte({ nom: "A", septJours: 100 }), compte({ nom: "B" })]);
    assert.isFalse(c.some((constat) => constat.sujet === "pool de comptes"));
  });

  it("dit quand il n'y a rien du tout", () => {
    const c = diagnostiquerComptes([]);
    assert.equal(c[0]?.gravite, "casse");
    assert.include(c[0]?.geste ?? "", "Réglages");
  });
});

describe("l'index de rappel", () => {
  it("dit le geste quand la table manque", () => {
    const c = diagnostiquerIndex({ existe: false, messagesIndexes: 0, messagesStabilises: 900 });
    assert.equal(c.gravite, "casse");
    assert.include(c.geste, "036");
  });

  it("tolère un petit décalage — deux compteurs lus à deux instants", () => {
    const c = diagnostiquerIndex({
      existe: true,
      messagesIndexes: 900,
      messagesStabilises: 900 + DERIVE_INDEX_TOLEREE,
    });
    assert.equal(c.gravite, "ok");
  });

  it("alerte sur une DÉRIVE, et dit que le passé ne se rattrape pas seul", () => {
    // Les déclencheurs ne rattrapent que les écritures futures : attendre ne
    // répare rien.
    const c = diagnostiquerIndex({ existe: true, messagesIndexes: 100, messagesStabilises: 900 });
    assert.equal(c.gravite, "attention");
    assert.include(c.observe, "800");
    assert.include(c.geste, "Reconstruis");
  });
});

describe("les pannes non reconnues", () => {
  it("se tait quand il n'y en a pas", () => {
    assert.equal(diagnostiquerPannes([]).gravite, "ok");
  });

  it("distingue l'accident de la CLASSE", () => {
    // La LOI : « 2 occurrences = bug prioritaire ». Une fois peut être un
    // accident ; deux fois, c'est une classe, et une classe se mécanise.
    const une = diagnostiquerPannes([{ signature: "x", occurrences: 1 }]);
    assert.include(une.geste, "seconde occurrence");

    const deux = diagnostiquerPannes([
      { signature: "ede_diagnostic", occurrences: SEUIL_RECIDIVE },
    ]);
    assert.include(deux.geste, "comptePool.ts");
    assert.include(deux.geste, "ede_diagnostic");
  });
});

describe("le verdict d'ensemble", () => {
  it("prend la pire gravité, il ne MOYENNE jamais", () => {
    // Un « cassé » noyé dans dix « ok » disparaîtrait — et c'est exactement
    // le constat qu'on avait besoin de voir.
    const beaucoupDOk = Array.from({ length: 10 }, () => ({
      sujet: "x",
      gravite: "ok" as const,
      observe: "",
      geste: "",
    }));
    assert.equal(
      verdictGeneral([...beaucoupDOk, { sujet: "y", gravite: "casse", observe: "", geste: "" }]),
      "casse",
    );
    assert.equal(
      verdictGeneral([
        ...beaucoupDOk,
        { sujet: "y", gravite: "attention", observe: "", geste: "" },
      ]),
      "attention",
    );
    assert.equal(verdictGeneral(beaucoupDOk), "ok");
  });

  it("dit ok sur le vide plutôt que d'inventer un problème", () => {
    assert.equal(verdictGeneral([]), "ok");
  });
});

describe("l'invariant du doctor", () => {
  it("tout constat qui n'est pas « ok » porte un GESTE", () => {
    // Un constat sans geste est un voyant : on apprend à l'ignorer.
    const tous = [
      ...diagnostiquerComptes([
        compte({ nom: "A", authExpiree: true }),
        compte({ nom: "B", sante: "mort" }),
        compte({ nom: "C", septJours: 95 }),
        compte({ nom: "D", sante: "refroidit" }),
      ]),
      diagnostiquerIndex({ existe: false, messagesIndexes: 0, messagesStabilises: 1 }),
      diagnostiquerIndex({ existe: true, messagesIndexes: 0, messagesStabilises: 900 }),
      diagnostiquerPannes([{ signature: "x", occurrences: 3 }]),
    ];
    for (const constat of tous) {
      if (constat.gravite === "ok") continue;
      assert.isAbove(constat.geste.length, 0, `${constat.sujet} : constat sans geste`);
    }
  });
});

describe("lirePannes — accepter les deux formes plutôt que parier", () => {
  it("lit la forme réelle du disque : une LISTE à la racine", () => {
    // Lire la mauvaise forme ne lève RIEN : on obtient zéro panne, et le
    // doctor annonce « aucune » alors qu'il y en a. Un diagnostic faussement
    // rassurant est pire que pas de diagnostic.
    const lu = lirePannes([{ signature: "ede_diagnostic", occurrences: 3 }]);
    assert.deepEqual(lu, [{ signature: "ede_diagnostic", occurrences: 3 }]);
  });

  it("lit aussi la forme enveloppée", () => {
    assert.equal(lirePannes({ entrees: [{ signature: "x" }] }).length, 1);
  });

  it("suppose une occurrence quand le compte manque", () => {
    assert.equal(lirePannes([{ signature: "x" }])[0]?.occurrences, 1);
  });

  it("écarte le bruit sans jamais jeter le fichier entier", () => {
    const lu = lirePannes([null, 42, { pas: "une panne" }, { signature: "" }, { signature: "ok" }]);
    assert.deepEqual(
      lu.map((p) => p.signature),
      ["ok"],
    );
  });

  it("rend vide sur n'importe quoi d'autre", () => {
    for (const brut of [null, undefined, 42, "texte", {}]) {
      assert.deepEqual(lirePannes(brut), []);
    }
  });
});
