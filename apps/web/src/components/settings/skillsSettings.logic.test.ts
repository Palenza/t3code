import { describe, expect, it } from "vite-plus/test";

import { filtrerSkills, listerSkillsDesProviders } from "./skillsSettings.logic";

const skill = (nom: string, extra: Record<string, unknown> = {}) => ({
  name: nom,
  path: `/skills/${nom}`,
  enabled: true,
  ...extra,
});

const provider = (id: string, skills: ReadonlyArray<unknown>) =>
  ({ instanceId: id, displayName: id, skills }) as never;

describe("listerSkillsDesProviders", () => {
  // LE CAS QUI COMPTE : Enzo a trois comptes Claude qui lisent le MÊME dossier
  // de skills. Sans dédup il verrait chaque skill en triple et croirait à un
  // défaut de l'app.
  it("dédoublonne les skills partagées par plusieurs providers", () => {
    const liste = listerSkillsDesProviders([
      provider("claude-a", [skill("debug-navigateur")]),
      provider("claude-b", [skill("debug-navigateur")]),
      provider("enzo3", [skill("debug-navigateur")]),
    ]);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.name).toBe("debug-navigateur");
  });

  it("garde deux skills de même nom quand leurs CHEMINS diffèrent", () => {
    const liste = listerSkillsDesProviders([
      provider("a", [{ ...skill("usine"), path: "/projet/usine" }]),
      provider("b", [{ ...skill("usine"), path: "/perso/usine" }]),
    ]);
    expect(liste).toHaveLength(2);
  });

  it("trie par nom affiché", () => {
    const liste = listerSkillsDesProviders([
      provider("a", [skill("zulu"), skill("alpha"), skill("mike")]),
    ]);
    expect(liste.map((s) => s.name)).toEqual(["alpha", "mike", "zulu"]);
  });

  it("rend une liste vide sans provider — jamais une exception", () => {
    expect(listerSkillsDesProviders(undefined)).toEqual([]);
    expect(listerSkillsDesProviders([])).toEqual([]);
    expect(listerSkillsDesProviders([provider("a", [])])).toEqual([]);
  });
});

describe("filtrerSkills", () => {
  const skills = listerSkillsDesProviders([
    provider("a", [
      skill("debug-navigateur", { description: "Process OBLIGATOIRE pour tout bug runtime" }),
      skill("usine", { description: "Les 12 lois du mode bombardement" }),
    ]),
  ]);

  it("rend tout quand la recherche est vide", () => {
    expect(filtrerSkills(skills, "   ")).toHaveLength(2);
  });

  it("trouve par nom, sans sensibilité à la casse", () => {
    expect(filtrerSkills(skills, "DEBUG").map((s) => s.name)).toEqual(["debug-navigateur"]);
  });

  // « Une recherche qui cache une correspondance est cassée » — règle reprise
  // d'Hermès. Le mot qu'on a en tête est souvent dans la DESCRIPTION.
  it("trouve aussi par description", () => {
    expect(filtrerSkills(skills, "bombardement").map((s) => s.name)).toEqual(["usine"]);
  });

  it("rend vide quand rien ne correspond — pas la liste entière", () => {
    expect(filtrerSkills(skills, "zzz")).toEqual([]);
  });
});
