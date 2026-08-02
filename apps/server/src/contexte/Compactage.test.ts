import { assert, describe, it } from "@effect/vitest";

import { ESPACE_FINE, lireMetadonnees, resumeDeCompactage } from "./Compactage.ts";

/** La charge RÉELLE du compactage du 31/07 à 11:56, copiée de la base. */
const REELLE = {
  state: "compacted",
  detail: {
    type: "system",
    subtype: "compact_boundary",
    session_id: "d9b0e2ac-c145-4228-9c7a-47cd5a8fdf9b",
    compact_metadata: {
      trigger: "auto",
      pre_tokens: 998_926,
      post_tokens: 17_453,
      cumulative_dropped_tokens: 1_965_823,
      duration_ms: 143_707,
      preserved_messages: {
        anchor_uuid: "15ea8ea1",
        uuids: ["ad28582c", "d86a4c0e", "ff8251c9"],
        all_uuids: ["ad28582c", "d86a4c0e", "ff8251c9"],
      },
    },
  },
};

describe("lireMetadonnees", () => {
  it("lit la charge réelle du 31/07", () => {
    const m = lireMetadonnees(REELLE);
    assert.deepEqual(m, {
      declencheur: "auto",
      avant: 998_926,
      apres: 17_453,
      cumulJete: 1_965_823,
      dureeMs: 143_707,
      messagesPreserves: 3,
    });
  });

  it("rend null quand il manque de quoi dire quelque chose de VRAI", () => {
    // Une phrase à moitié fausse serait pire que la chaîne plate qu'on remplace.
    assert.isNull(lireMetadonnees(null));
    assert.isNull(lireMetadonnees({}));
    assert.isNull(lireMetadonnees({ detail: {} }));
    assert.isNull(lireMetadonnees({ detail: { compact_metadata: {} } }));
    assert.isNull(lireMetadonnees({ detail: { compact_metadata: { pre_tokens: 10 } } }));
  });

  it("refuse une division par zéro déguisée", () => {
    assert.isNull(
      lireMetadonnees({ detail: { compact_metadata: { pre_tokens: 0, post_tokens: 0 } } }),
    );
  });

  it("refuse NaN et les négatifs plutôt que de bâtir dessus", () => {
    assert.isNull(
      lireMetadonnees({ detail: { compact_metadata: { pre_tokens: Number.NaN, post_tokens: 5 } } }),
    );
    assert.isNull(
      lireMetadonnees({ detail: { compact_metadata: { pre_tokens: -1, post_tokens: 5 } } }),
    );
  });

  it("survit à des champs optionnels absents", () => {
    const m = lireMetadonnees({
      detail: { compact_metadata: { pre_tokens: 100, post_tokens: 10 } },
    });
    assert.equal(m?.avant, 100);
    assert.isNull(m?.cumulJete ?? null);
    assert.isNull(m?.dureeMs ?? null);
    assert.isNull(m?.messagesPreserves ?? null);
    assert.equal(m?.declencheur, "inconnu");
  });
});

describe("resumeDeCompactage", () => {
  it("dit ce qui est PARTI, pas ce qui reste", () => {
    const texte = resumeDeCompactage(REELLE);
    assert.include(texte, "98,3 % jeté");
    assert.include(texte, `998${ESPACE_FINE}926 → 17${ESPACE_FINE}453`);
    assert.include(texte, "3 message(s) gardé(s) mot pour mot");
    assert.include(texte, "2 min 24");
    assert.include(texte, `1${ESPACE_FINE}965${ESPACE_FINE}823 tokens jetés en tout`);
  });

  it("retombe sur une phrase honnête quand la charge ne dit rien", () => {
    assert.equal(resumeDeCompactage({}), "Contexte compacté (détail indisponible)");
    assert.equal(resumeDeCompactage(undefined), "Contexte compacté (détail indisponible)");
  });

  it("groupe les milliers, et reste lisible sur des petits nombres", () => {
    const texte = resumeDeCompactage({
      detail: { compact_metadata: { pre_tokens: 1000, post_tokens: 100, duration_ms: 4200 } },
    });
    assert.include(texte, `1${ESPACE_FINE}000 → 100`);
    assert.include(texte, "4 s d'attente");
  });

  it("ne prétend jamais à plus de précision qu'il n'en a", () => {
    // Sans durée ni cumul, la phrase se raccourcit — elle n'invente pas de zéro.
    const texte = resumeDeCompactage({
      detail: { compact_metadata: { pre_tokens: 200, post_tokens: 50 } },
    });
    assert.notInclude(texte, "attente");
    assert.notInclude(texte, "en tout");
    assert.include(texte, "75,0 % jeté");
  });

  it("compte les 9 compactages réels sans jamais rendre la chaîne de repli", () => {
    // Les vraies charges du 24 au 31/07 : aucune ne doit tomber en dégradé.
    const reels = [
      [1_002_235, 24_712],
      [1_002_457, 17_730],
      [1_001_299, 18_717],
      [1_001_562, 16_641],
      [1_001_597, 23_254],
      [1_000_154, 15_020],
      [998_341, 14_223],
      [1_000_018, 15_668],
      [998_926, 17_453],
    ] as const;
    for (const [avant, apres] of reels) {
      const texte = resumeDeCompactage({
        detail: { compact_metadata: { pre_tokens: avant, post_tokens: apres } },
      });
      assert.notInclude(texte, "indisponible", `${avant} → ${apres}`);
      // Tous entre 97 et 99 % : si un jour ça sort de là, c'est le
      // comportement qui a changé, et on veut le savoir.
      const part = Number.parseFloat(
        texte.split(" % jeté")[0]?.split(": ")[1]?.replace(",", ".") ?? "0",
      );
      assert.isAbove(part, 97, `${avant} → ${apres}`);
      assert.isBelow(part, 99, `${avant} → ${apres}`);
    }
  });
});
