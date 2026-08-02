import { describe, expect, it } from "vite-plus/test";

import { agentTourneSurCetteMachine } from "./composerFileIntake";

/**
 * Le 01/08, un checkout LOCAL était déclaré « environnement distant » parce que
 * le test comparait à l'environnement PRIMAIRE au lieu de regarder la liste des
 * locaux. Enzo n'a pas pu déposer l'enregistrement du bug qu'il voulait montrer.
 */
describe("agentTourneSurCetteMachine", () => {
  const locaux = [{ id: "primary" }, { id: "checkout-local" }];

  it("reconnaît l'environnement primaire", () => {
    expect(agentTourneSurCetteMachine("primary", locaux)).toBe(true);
  });

  // LE CAS QUI A MORDU : local sans être le primaire.
  it("reconnaît un environnement local qui N'EST PAS le primaire", () => {
    expect(agentTourneSurCetteMachine("checkout-local", locaux)).toBe(true);
  });

  it("refuse un environnement absent de la liste — un SSH reste distant", () => {
    expect(agentTourneSurCetteMachine("ssh-vps", locaux)).toBe(false);
  });

  // Ne pas SAVOIR doit valoir « distant » : poser un lien mort coûte plus cher
  // que de demander le chemin.
  it("refuse quand la liste est inconnue (pas de pont desktop)", () => {
    expect(agentTourneSurCetteMachine("primary", undefined)).toBe(false);
  });

  it("refuse quand aucun environnement local n'est déclaré", () => {
    expect(agentTourneSurCetteMachine("primary", [])).toBe(false);
  });
});
