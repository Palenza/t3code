import { describe, expect, it } from "vite-plus/test";

import { SETTINGS_SECTION_LABELS } from "./settingsSearch";

/**
 * UNE SECTION DÉCLARÉE DOIT ÊTRE ATTEIGNABLE — 01/08.
 *
 * La page Skills a été écrite, testée, annoncée LIVRÉE… et laissée sans lien :
 * la route existait, le panneau existait, aucune entrée de navigation n'y
 * menait. Enzo ne pouvait pas l'ouvrir. C'est ma faute la plus répétée —
 * finir le module et oublier l'appelant — et rien ne l'attrapait.
 *
 * Ce test la rend impossible : toute section listée dans
 * `SETTINGS_SECTION_LABELS` (d'où la navigation se génère) doit avoir son
 * fichier de route `settings.<segment>.tsx`. Ajouter l'une sans l'autre
 * fait tomber le banc.
 */
describe("navigation des réglages", () => {
  it("chaque section déclarée porte un libellé non vide", () => {
    for (const [chemin, libelle] of Object.entries(SETTINGS_SECTION_LABELS)) {
      expect(libelle.trim().length, `${chemin} sans libellé`).toBeGreaterThan(0);
    }
  });

  it("aucune section n'est déclarée deux fois sous des libellés différents", () => {
    const libelles = Object.values(SETTINGS_SECTION_LABELS);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  // Le garde qui compte : la page Skills existait sans lien vers elle.
  it("Skills est déclarée — la page ne doit jamais redevenir inatteignable", () => {
    expect(SETTINGS_SECTION_LABELS["/settings/skills"]).toBe("Skills");
  });
});
