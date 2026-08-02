// @effect-diagnostics nodeBuiltinImport:off - Ce garde LIT le source pour vérifier qu un état de glissé est bien relâché : il lui faut le disque brut, pas une couche Effect.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "../../racineDuDepot.ts";

/**
 * LA MOLETTE NE TOURNE QUE PENDANT UN GLISSÉ — jamais au survol.
 *
 * Le 02/08, Enzo : « le survol de souris ne doit pas faire bouger le
 * slider, c'est le cas là ». La cause : `onPointerDown` posait
 * `rotationRef`, `onPointerMove` tournait tant qu'il était non nul… et RIEN
 * ne le remettait à null. Après le premier clic, chaque survol traînait la
 * pilule, pour toujours.
 *
 * C'est la panne qu'aucun autre garde n'attrape : elle ne laisse ni rouge ni
 * exception — un état posé d'un côté et jamais relâché de l'autre. Pas de
 * test d'évènements DOM dans ce dépôt (rendu statique seulement), donc on
 * vérifie AU SOURCE que les trois relâchements existent : up, cancel, et
 * perte de capture. Retirer l'un d'eux refait le bug ; ce test le dira.
 */

const SOURCE = NodeFS.readFileSync(
  NodePath.join(racineDuDepot(), "apps/web/src/components/sidebar/SpaceThemePanel.tsx"),
  "utf8",
);

describe("la molette de grain relâche son glissé", () => {
  const molette = SOURCE.slice(SOURCE.indexOf("function GrainDial"));

  it("a un GrainDial à surveiller (sinon ce garde surveille du vide)", () => {
    expect(SOURCE.includes("function GrainDial")).toBe(true);
  });

  for (const evenement of ["onPointerUp", "onPointerCancel", "onLostPointerCapture"]) {
    it(`relâche sur ${evenement}`, () => {
      expect(molette).toContain(`${evenement}={relacherLaMolette}`);
    });
  }

  it("le relâchement remet bien la rotation à null", () => {
    expect(molette).toMatch(/relacherLaMolette[\s\S]{0,120}rotationRef\.current = null/u);
  });
});
