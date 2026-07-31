import { assert, describe, it } from "@effect/vitest";

import { avantDeCouper, FANTOME_APRES_MINUTES, type TourEnVol } from "./AvantDeCouper.ts";

const tour = (filId: string, depuisMinutes: number): TourEnVol => ({ filId, depuisMinutes });

const SANS_FORCER = { malgreLeTravailEnCours: false } as const;

describe("rien en vol", () => {
  it("on coupe, quelle que soit l'origine", () => {
    for (const origine of ["humain-present", "a-distance", "automatique"] as const) {
      assert.equal(avantDeCouper([], { origine, ...SANS_FORCER }).decision, "couper");
    }
  });
});

describe("du travail en vol", () => {
  const enVol = [tour("fil-a", 3), tour("fil-b", 41)];

  it("à distance ou en automatique, on REFUSE — personne pour arbitrer", () => {
    // C'est le cas d'un téléphone contre un serveur maison : la question
    // n'apparaîtrait sur aucun écran.
    for (const origine of ["a-distance", "automatique"] as const) {
      const v = avantDeCouper(enVol, { origine, ...SANS_FORCER });
      assert.equal(v.decision, "refuser");
      assert.include(v.phrase, "Personne n'est devant l'écran");
    }
  });

  it("le refus dit QUAND réessayer — sinon on réessaie au hasard", () => {
    const v = avantDeCouper(enVol, { origine: "automatique", ...SANS_FORCER });
    assert.include(v.phrase, "95 % des tours finissent");
    assert.include(v.phrase, "forçant explicitement");
  });

  it("devant un humain, on ne tranche pas : on montre le coût et on DEMANDE", () => {
    const v = avantDeCouper(enVol, { origine: "humain-present", ...SANS_FORCER });
    assert.equal(v.decision, "demander");
    assert.include(v.phrase, "Attendre qu'ils finissent, ou couper quand même ?");
  });

  it("toute phrase nomme le nombre ET l'âge du plus ancien (A7)", () => {
    for (const origine of ["humain-present", "a-distance", "automatique"] as const) {
      const v = avantDeCouper(enVol, { origine, ...SANS_FORCER });
      assert.include(v.phrase, "2 tours en vol");
      assert.include(v.phrase, "41 min");
    }
  });

  it("dit que « interrompu » est terminal — c'est ça, le vrai coût", () => {
    // Un tour coupé ne reprend pas. Sans cette phrase, l'humain croit mettre
    // en pause.
    const v = avantDeCouper(enVol, { origine: "humain-present", ...SANS_FORCER });
    assert.include(v.phrase, "état terminal");
  });

  it("les victimes sortent du plus vieux au plus jeune", () => {
    const v = avantDeCouper([tour("jeune", 2), tour("vieux", 60), tour("moyen", 30)], {
      origine: "automatique",
      ...SANS_FORCER,
    });
    assert.deepEqual(
      v.victimes.map((t) => t.filId),
      ["vieux", "moyen", "jeune"],
    );
  });
});

describe("forcer", () => {
  const enVol = [tour("fil-a", 3), tour("fil-b", 41)];

  it("coupe — mais écrit le reçu de ce qu'on tue", () => {
    // Un forçage silencieux et un forçage assumé ont la même conséquence et
    // pas du tout la même valeur le lendemain.
    const v = avantDeCouper(enVol, { origine: "a-distance", malgreLeTravailEnCours: true });
    assert.equal(v.decision, "couper");
    assert.include(v.phrase, "fil-a");
    assert.include(v.phrase, "fil-b");
    assert.equal(v.victimes.length, 2);
  });
});

describe("le fil-piège des lignes fantômes", () => {
  it("une ligne plus vieille que le seuil ne bloque RIEN", () => {
    // Sinon un tour dont le processus est mort empêche à vie le serveur de se
    // mettre à jour — un refus sans fin est une panne, lui aussi.
    const v = avantDeCouper([tour("mort", FANTOME_APRES_MINUTES + 1)], {
      origine: "automatique",
      ...SANS_FORCER,
    });
    assert.equal(v.decision, "couper");
    assert.equal(v.fantomes.length, 1);
    assert.equal(v.victimes.length, 0);
  });

  it("elle est ignorée SANS être cachée", () => {
    const v = avantDeCouper([tour("mort", 500)], { origine: "automatique", ...SANS_FORCER });
    assert.include(v.phrase, "est ignorée");
    assert.include(v.phrase, String(FANTOME_APRES_MINUTES));
  });

  it("le seuil est posé au-delà du sain : 85 min mesurés au max, 240 en limite", () => {
    // Le maximum jamais observé sur 583 tours est 85,2 min. Un tour sain ne
    // doit jamais sentir que cette limite existe.
    const v = avantDeCouper([tour("le-plus-long-jamais-vu", 86)], {
      origine: "automatique",
      ...SANS_FORCER,
    });
    assert.equal(v.decision, "refuser");
    assert.equal(v.fantomes.length, 0);
  });

  it("un fantôme ne masque pas un vrai tour en vol", () => {
    const v = avantDeCouper([tour("mort", 900), tour("vivant", 5)], {
      origine: "automatique",
      ...SANS_FORCER,
    });
    assert.equal(v.decision, "refuser");
    assert.deepEqual(
      v.victimes.map((t) => t.filId),
      ["vivant"],
    );
    assert.deepEqual(
      v.fantomes.map((t) => t.filId),
      ["mort"],
    );
  });
});
