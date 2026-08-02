import { describe, expect, it } from "vite-plus/test";

import type { CompteClaudeVue, TableauLocalEtat } from "../settings/tableauLocal";
import {
  RAISON_AUCUNE_LECTURE,
  resumerComptesPourLeRond,
  type ComptesDuRond,
} from "./comptesDuRond";

const jauge = (nom: string, pct: number) => ({
  nom,
  pctLabel: `${pct} %`,
  barPct: pct,
  tone: "normal" as const,
  resetLabel: null,
});

const compte = (rien: Partial<CompteClaudeVue> = {}): CompteClaudeVue => ({
  label: "A",
  email: "a@exemple.fr",
  actif: false,
  etat: null,
  ageLabel: null,
  limites: [jauge("5 h", 12)],
  ...rien,
});

const present = (comptes: ReadonlyArray<CompteClaudeVue> | null): TableauLocalEtat => ({
  kind: "present",
  vue: { comptes, affiliation: null, depot: null, instant: null },
});

const comptesDe = (resume: ComptesDuRond) => (resume.kind === "comptes" ? resume.comptes : []);

describe("resumerComptesPourLeRond", () => {
  it("se tait tant qu'aucune lecture n'est arrivée", () => {
    expect(resumerComptesPourLeRond(null)).toEqual({
      kind: "silence",
      raison: RAISON_AUCUNE_LECTURE,
    });
  });

  it("relaie la raison du tableau muet plutôt que d'en inventer une", () => {
    const resume = resumerComptesPourLeRond({
      kind: "muet",
      raison: "Le port 8318 ne répond pas.",
    });
    expect(resume).toEqual({ kind: "silence", raison: "Le port 8318 ne répond pas." });
  });

  it("se tait quand le tableau répond sans section comptes", () => {
    expect(resumerComptesPourLeRond(present(null)).kind).toBe("silence");
  });

  it("se tait plutôt que d'afficher des comptes qui n'ont rien rapporté", () => {
    // Trois lignes vides se liraient « 0 % utilisé » : un chiffre qu'aucune
    // source n'a donné.
    const resume = resumerComptesPourLeRond(
      present([compte({ limites: [] }), compte({ label: "B", limites: [] })]),
    );
    expect(resume).toEqual({ kind: "silence", raison: RAISON_AUCUNE_LECTURE });
  });

  it("garde un compte sans jauge quand il a un état à rapporter", () => {
    const resume = resumerComptesPourLeRond(
      present([compte({ limites: [], etat: "jeton périmé" })]),
    );
    expect(comptesDe(resume)).toHaveLength(1);
    expect(comptesDe(resume)[0]?.etat).toBe("jeton périmé");
  });

  it("écarte les comptes muets sans écarter leurs voisins", () => {
    const resume = resumerComptesPourLeRond(
      present([
        compte({ label: "A" }),
        compte({ label: "B", limites: [] }),
        compte({ label: "C", limites: [jauge("7 j", 88)] }),
      ]),
    );
    expect(comptesDe(resume).map((c) => c.label)).toEqual(["A", "C"]);
  });

  it("garde l'ordre de la source même quand l'actif n'est pas le premier", () => {
    // Remonter l'actif ferait sauter les lignes d'un compte à l'autre : la
    // jauge qu'on lisait change de place. On distingue par la mise en
    // évidence, pas par le déplacement.
    const resume = resumerComptesPourLeRond(
      present([
        compte({ label: "A" }),
        compte({ label: "B" }),
        compte({ label: "C", actif: true }),
      ]),
    );
    expect(comptesDe(resume).map((c) => c.label)).toEqual(["A", "B", "C"]);
    expect(comptesDe(resume).map((c) => c.actif)).toEqual([false, false, true]);
  });

  it("recopie les jauges sans retoucher les chiffres de la source", () => {
    const resume = resumerComptesPourLeRond(
      present([
        compte({
          limites: [
            { nom: "5 h", pctLabel: "3 %", barPct: 3, tone: "normal", resetLabel: "dans 2 h" },
            { nom: "7 j", pctLabel: "100 %", barPct: 100, tone: "critical", resetLabel: null },
          ],
        }),
      ]),
    );
    expect(comptesDe(resume)[0]?.jauges).toEqual([
      { nom: "5 h", pctLabel: "3 %", barPct: 3, tone: "normal", resetLabel: "dans 2 h" },
      { nom: "7 j", pctLabel: "100 %", barPct: 100, tone: "critical", resetLabel: null },
    ]);
  });
});
