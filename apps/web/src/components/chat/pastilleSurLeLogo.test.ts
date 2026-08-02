import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * LA PASTILLE SUR LE LOGO NE DOIT PAS REVENIR.
 *
 * Enzo l'a signalée trois fois, la dernière le 02/08 : « bug réintroduit, des
 * boutons sous le logo Claude ». Réintroduite, parce qu'elle vient d'AMONT
 * (`#3379`) : chaque synchro du fork la ramène, et on la retire à nouveau.
 * Deux occurrences valent une mécanique.
 *
 * Pourquoi une lecture du SOURCE et pas un rendu : le mode de panne n'est pas
 * un bug de rendu, c'est une propriété qu'une fusion amont remet à `true`. On
 * surveille donc exactement ce qui bouge. Le dépôt a déjà ce genre de garde
 * (`moduleSansAppelant.test.ts`), pour la même raison.
 *
 * Si un jour on VEUT la pastille, ce test est l'endroit où le dire — en
 * l'écrivant, pas en la laissant réapparaître par une fusion que personne
 * n'a relue.
 */

const ICI = join(process.cwd(), "apps/web/src/components/chat");

const lire = (fichier: string): string => readFileSync(join(ICI, fichier), "utf8");

/** Les deux endroits où un logo de fournisseur est posé sur une surface. */
const SURFACES = [
  { fichier: "ProviderModelPicker.tsx", ou: "la gâchette du composeur" },
  { fichier: "ModelPickerSidebar.tsx", ou: "le rail du sélecteur" },
] as const;

describe("pas de pastille collée sous le logo du fournisseur", () => {
  for (const surface of SURFACES) {
    it(`${surface.ou} ne l'active pas`, () => {
      const source = lire(surface.fichier);
      const activations = source.match(/showBadge=\{(?!false\})/gu) ?? [];
      expect(activations).toEqual([]);
      // Et la propriété reste passée EXPLICITEMENT à false : la retirer
      // laisserait la valeur par défaut décider, donc une fusion amont
      // pourrait la rallumer sans que rien ne change ici.
      expect(source).toContain("showBadge={false}");
    });
  }

  it("garde une trace du pourquoi, pour que personne ne l'enlève par ménage", () => {
    for (const surface of SURFACES) {
      expect(lire(surface.fichier)).toMatch(/pastille|PASTILLE/u);
    }
  });
});
