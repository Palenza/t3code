import { describe, expect, it } from "vite-plus/test";

import { RAISON_ILLISIBLE, formatAgeReleve, presentTableauLocal } from "./tableauLocal";

const NOW = Date.parse("2026-07-28T15:00:00.000Z");

/** Real shapes, captured from the proxy on 28/07/2026. */
const PAYLOAD_REEL = {
  tableau: {
    quotas: [
      {
        label: "A",
        email: "enzo.barreau1@gmail.com",
        actif: false,
        etat: "endpoint quotas saturé (429) — relevé précédent affiché",
        limites: [
          { nom: "5 heures", pct: 0.0, reset: null },
          { nom: "7 jours", pct: 94.0, reset: "2026-08-01T07:59:00+00:00" },
          { nom: "7 jours · Fable", pct: 100.0, reset: "2026-08-01T07:59:00+00:00" },
        ],
        mesure_age_min: 12,
      },
      {
        label: "B",
        email: "enzo.barreau@gmail.com",
        actif: true,
        etat: "ok",
        limites: [{ nom: "5 heures", pct: 51.0, reset: null }],
        mesure_age_min: 0,
      },
    ],
    usine: { age_min: 23, lignes: [{ cle: "Usine", valeur: "4/4 joignables" }], erreur: null },
    git: { branche: "claude/rescapes-et-identite", devant: "62", sale: 117 },
    instant: "28/07 21:02:28",
  },
  affiliation: {
    genere_le: "2026-07-28T14:04:48.854Z",
    reseaux: [
      { reseau: "Awin", acceptes: ["alternate FR", "Rakuten FR"], attente: ["Dyson FR"] },
      {
        reseau: "Kwanko",
        acceptes: ["LDLC"],
        indetermines: ["Fnac"],
        note: "l'API ne sépare pas « en attente » de « refusé »",
      },
      { reseau: "Effinity", acceptes: [], attente: [], refuses: ["REKT", "Kiatoo.com"] },
      { reseau: "Amazon", note: "actif (tag `palenza-21`)" },
    ],
  },
};

describe("presentTableauLocal", () => {
  it("presents affiliation and dépôt from a real payload", () => {
    const etat = presentTableauLocal(PAYLOAD_REEL, NOW);
    expect(etat.kind).toBe("present");
    if (etat.kind !== "present") return;
    expect(etat.vue.affiliation?.ageLabel).toBe("relevé il y a 55 min");
    expect(etat.vue.affiliation?.totalLabel).toBe("3 acceptés · 1 en attente · 2 refusés");
    expect(etat.vue.affiliation?.reseaux).toHaveLength(4);
    expect(etat.vue.depot?.branche).toBe("claude/rescapes-et-identite");
    expect(etat.vue.depot?.etatLabel).toBe(
      "62 commit(s) non déployé(s) · 117 fichier(s) modifié(s)",
    );
    expect(etat.vue.instant).toBe("28/07 21:02:28");
  });

  it("labels each network with only its non-zero counts", () => {
    const etat = presentTableauLocal(PAYLOAD_REEL, NOW);
    if (etat.kind !== "present") throw new Error("attendu present");
    const [awin, kwanko, effinity, amazon] = etat.vue.affiliation?.reseaux ?? [];
    expect(awin?.compteurs).toBe("2 acceptés · 1 en attente");
    expect(kwanko?.compteurs).toBe("1 accepté · 1 à trancher au dashboard");
    expect(effinity?.compteurs).toBe("2 refusés");
    // A network with only a note keeps the note, never invents a zero row.
    expect(amazon?.compteurs).toBeNull();
    expect(amazon?.note).toBe("actif (tag `palenza-21`)");
  });

  it("presents the Claude accounts with their gauges and honest states", () => {
    const etat = presentTableauLocal(PAYLOAD_REEL, NOW);
    if (etat.kind !== "present") throw new Error("attendu present");
    const [a, b] = etat.vue.comptes ?? [];
    expect(a?.label).toBe("A");
    expect(a?.etat).toContain("endpoint quotas saturé");
    expect(a?.ageLabel).toBe("mesuré il y a 12 min");
    expect(a?.limites.map((l) => [l.nom, l.pctLabel, l.tone])).toEqual([
      ["5 heures", "0 %", "normal"],
      ["7 jours", "94 %", "critical"],
      ["7 jours · Fable", "100 %", "critical"],
    ]);
    expect(a?.limites[1]?.resetLabel).toMatch(/^remise à zéro /);
    // "ok" is the normal state: no line of noise for it.
    expect(b?.etat).toBeNull();
    expect(b?.actif).toBe(true);
    expect(b?.limites[0]?.tone).toBe("warning");
  });

  it("stays muet on a non-object payload", () => {
    expect(presentTableauLocal("pas du json utile", NOW)).toEqual({
      kind: "muet",
      raison: RAISON_ILLISIBLE,
    });
    expect(presentTableauLocal(null, NOW)).toEqual({ kind: "muet", raison: RAISON_ILLISIBLE });
  });

  it("stays muet when neither pane is present", () => {
    expect(presentTableauLocal({ tableau: null, affiliation: null }, NOW)).toEqual({
      kind: "muet",
      raison: RAISON_ILLISIBLE,
    });
  });

  it("keeps affiliation when the dashboard is down, and vice versa", () => {
    const sansTableau = presentTableauLocal({ ...PAYLOAD_REEL, tableau: null }, NOW);
    expect(sansTableau.kind).toBe("present");
    if (sansTableau.kind === "present") {
      expect(sansTableau.vue.depot).toBeNull();
      expect(sansTableau.vue.affiliation).not.toBeNull();
    }
    const sansAffiliation = presentTableauLocal({ ...PAYLOAD_REEL, affiliation: null }, NOW);
    expect(sansAffiliation.kind).toBe("present");
    if (sansAffiliation.kind === "present") {
      expect(sansAffiliation.vue.affiliation).toBeNull();
      expect(sansAffiliation.vue.depot).not.toBeNull();
    }
  });

  it("names an unknown generation age instead of guessing", () => {
    const etat = presentTableauLocal(
      { affiliation: { reseaux: [{ reseau: "Awin", acceptes: ["x"] }] } },
      NOW,
    );
    if (etat.kind !== "present") throw new Error("attendu present");
    expect(etat.vue.affiliation?.ageLabel).toBe("âge du relevé inconnu");
  });

  it("drops malformed network rows rather than inventing content", () => {
    const etat = presentTableauLocal(
      {
        affiliation: {
          genere_le: "2026-07-28T14:04:48.854Z",
          reseaux: [{ reseau: "Awin", acceptes: ["ok", 42, ""] }, "brut", { pas: "de nom" }],
        },
      },
      NOW,
    );
    if (etat.kind !== "present") throw new Error("attendu present");
    expect(etat.vue.affiliation?.reseaux).toHaveLength(1);
    expect(etat.vue.affiliation?.reseaux[0]?.acceptes).toEqual(["ok"]);
  });
});

describe("formatAgeReleve", () => {
  it("names the unknown age instead of guessing", () => {
    expect(formatAgeReleve(null)).toBe("âge du relevé inconnu");
    expect(formatAgeReleve(-5)).toBe("âge du relevé inconnu");
    expect(formatAgeReleve(Number.NaN)).toBe("âge du relevé inconnu");
  });

  it("labels fresh readings, minutes, hours, then days", () => {
    expect(formatAgeReleve(0)).toBe("relevé à l'instant");
    expect(formatAgeReleve(23)).toBe("relevé il y a 23 min");
    expect(formatAgeReleve(60)).toBe("relevé il y a 1 h");
    expect(formatAgeReleve(47 * 60)).toBe("relevé il y a 47 h");
    expect(formatAgeReleve(16 * 24 * 60)).toBe("relevé il y a 16 j");
  });
});
