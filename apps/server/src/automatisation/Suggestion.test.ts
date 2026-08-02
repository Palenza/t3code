import { assert, describe, it } from "@effect/vitest";

import {
  aProposer,
  intentionDe,
  cleDeDedoublonnage,
  detecterRecurrences,
  phraseDeProposition,
  JOURS_AVANT_PROPOSITION,
  type Observation,
} from "./Suggestion.ts";

const obs = (quoi: string, jour: string, heure = "08"): Observation => ({
  quoi,
  quand: `2026-07-${jour}T${heure}:30:00.000Z`,
});

describe("detecterRecurrences", () => {
  it("compte des JOURS distincts, pas des occurrences", () => {
    // Lancer quarante fois `git status` dans une session n'est pas un rituel
    // quotidien. C'est la seule mesure qui sépare l'habitude du martèlement.
    const memeJour = Array.from({ length: 40 }, () => obs("git status", "20"));
    assert.deepEqual(detecterRecurrences(memeJour), []);

    const troisJours = [obs("git status", "20"), obs("git status", "21"), obs("git status", "22")];
    assert.equal(detecterRecurrences(troisJours).length, 1);
  });

  it("ne propose pas avant le seuil", () => {
    // Deux pourrait être une coïncidence — le même geste refait parce que la
    // veille avait échoué. Proposer trop tôt use le crédit du suggéreur.
    const deux = [obs("relever l'usine", "20"), obs("relever l'usine", "21")];
    assert.deepEqual(detecterRecurrences(deux), []);
    assert.equal(JOURS_AVANT_PROPOSITION, 3);
  });

  it("trouve l'heure habituelle quand elle est nette", () => {
    const c = detecterRecurrences([
      obs("relever l'usine", "20", "08"),
      obs("relever l'usine", "21", "08"),
      obs("relever l'usine", "22", "09"),
    ]);
    assert.equal(c[0]?.heureHabituelle, "08");
  });

  it("n'INVENTE pas d'heure quand c'est éparpillé", () => {
    // La moyenne de 8 h et 20 h est 14 h — une heure à laquelle la chose n'a
    // JAMAIS été faite.
    const c = detecterRecurrences([
      obs("x", "20", "08"),
      obs("x", "21", "14"),
      obs("x", "22", "20"),
    ]);
    assert.isNull(c[0]?.heureHabituelle);
  });

  it("regroupe malgré la casse et les espaces", () => {
    const c = detecterRecurrences([
      obs("Relever  l'usine", "20"),
      obs("relever l'usine", "21"),
      obs("RELEVER L'USINE", "22"),
    ]);
    assert.equal(c.length, 1);
    assert.equal(c[0]?.jours, 3);
  });

  it("classe du plus installé au moins installé", () => {
    const c = detecterRecurrences([
      ...["20", "21", "22"].map((j) => obs("rare", j)),
      ...["20", "21", "22", "23", "24"].map((j) => obs("frequent", j)),
    ]);
    assert.deepEqual(
      c.map((x) => x.quoi),
      ["frequent", "rare"],
    );
  });

  it("ignore le vide sans casser", () => {
    assert.deepEqual(detecterRecurrences([]), []);
    assert.deepEqual(detecterRecurrences([obs("   ", "20"), obs("  ", "21"), obs(" ", "22")]), []);
  });
});

describe("aProposer — le verrou du refus", () => {
  const candidats = detecterRecurrences([
    ...["20", "21", "22"].map((j) => obs("relever l'usine", j)),
    ...["20", "21", "22"].map((j) => obs("sauvegarder", j)),
  ]);

  it("ne repropose JAMAIS ce qui a été refusé", () => {
    // Pas « moins souvent ». Jamais. C'est ce qui distingue un suggéreur d'un
    // harceleur — et un bruit s'apprend à ignorer, y compris quand il a
    // enfin raison.
    const reste = aProposer(candidats, ["relever l'usine"]);
    assert.deepEqual(
      reste.map((c) => c.quoi),
      ["sauvegarder"],
    );
  });

  it("le refus résiste aux variations d'écriture", () => {
    // Sinon le même refus se contourne tout seul à la variation près, et la
    // suggestion revient sous un déguisement.
    const reste = aProposer(candidats, ["  RELEVER   L'USINE  "]);
    assert.isFalse(reste.some((c) => c.quoi.toLowerCase().includes("relever")));
  });

  it("écarte aussi ce qui est déjà automatisé", () => {
    const reste = aProposer(candidats, [], ["sauvegarder"]);
    assert.deepEqual(
      reste.map((c) => c.quoi),
      ["relever l'usine"],
    );
  });

  it("laisse tout passer quand rien n'est bloqué", () => {
    assert.equal(aProposer(candidats, []).length, 2);
  });
});

describe("phraseDeProposition", () => {
  it("donne l'OBSERVATION avant la proposition", () => {
    // « Tu as fait ça trois jours de suite » se vérifie ; « tu devrais
    // automatiser ça » se discute. La raison d'abord, pour que le refus soit
    // informé et pas réflexe.
    const c = detecterRecurrences(["20", "21", "22"].map((j) => obs("relever l'usine", j, "08")));
    const phrase = phraseDeProposition(c[0]!);
    assert.include(phrase, "3 jours différents");
    assert.include(phrase, "vers 08 h");
    assert.include(phrase, "relever l'usine");
  });

  it("ne mentionne pas d'heure quand il n'y en a pas", () => {
    const c = detecterRecurrences([
      obs("x", "20", "08"),
      obs("x", "21", "14"),
      obs("x", "22", "20"),
    ]);
    assert.notInclude(phraseDeProposition(c[0]!), " h.");
  });
});

describe("cleDeDedoublonnage", () => {
  it("est stable sur ce qui ne change pas la nature de la proposition", () => {
    assert.equal(cleDeDedoublonnage("  Git   STATUS "), cleDeDedoublonnage("git status"));
  });
});

describe("intentionDe — la leçon des 4 703 commandes réelles", () => {
  it("saute la navigation pour trouver ce qui AGIT", () => {
    // Prendre le premier segment revenait à proposer d'automatiser un
    // déplacement de dossier.
    assert.equal(intentionDe("cd ~/projet && pnpm exec vp test run"), "pnpm exec vp test run");
    assert.equal(intentionDe("cd /tmp"), null);
    assert.equal(intentionDe("sleep 45"), null);
  });

  it("ne découpe PAS à l'intérieur d'un heredoc", () => {
    // Découper sur les retours à la ligne faisait du corps du script des
    // « segments » : le détecteur proposait d'automatiser « import json ».
    assert.equal(intentionDe("python3 - <<'PY'\nimport json\nprint(1)\nPY"), null);
  });

  it("écarte les charges en ligne — le sens vit dans le script, pas dans l'enveloppe", () => {
    assert.equal(intentionDe("node -e '"), null);
    assert.equal(intentionDe("npx tsx --env-file=.env.local -e '"), null);
  });

  it("garde les VRAIES habitudes", () => {
    // Le rituel réel qui était noyé sous le bruit : contrôler les lanes.
    assert.include(
      intentionDe("for ip in 178.105.192.84 169.58.65.44; do ping $ip; done") ?? "",
      "for ip",
    );
    assert.equal(intentionDe("git fetch origin -q"), "git fetch origin -q");
  });

  it("écarte une affectation nue", () => {
    // `t=0` posait une variable pour la ligne suivante. Le retrait du préfixe
    // d'environnement ne couvre que les MAJUSCULES ; celui-ci passait.
    assert.equal(intentionDe("t=0"), null);
    assert.equal(intentionDe("compteur=42"), null);
  });

  it("supporte l'environnement en préfixe", () => {
    assert.equal(intentionDe("GARDE_OK=1 git checkout -- x"), "git checkout -- x");
  });
});
