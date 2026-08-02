/**
 * LE GARDE DES GARDES.
 *
 * Le 02/08, trois fils-pièges de ce dépôt étaient INEXÉCUTABLES dans le
 * pipeline. Ils partaient de `process.cwd()` en supposant la racine du dépôt,
 * ce qui est vrai quand on lance `vp test apps/web/src` depuis la racine — et
 * faux sous `npm test`, la commande réelle, qui exécute chaque paquet depuis
 * SON dossier. Le chemin doublait, et ils échouaient en ENOENT.
 *
 * Ils étaient donc verts dans ma façon de les lancer, et rouges dans celle qui
 * compte. Un garde qu'on ne peut pas exécuter là où il protège ne protège
 * rien : c'est la classe d'erreur qu'ils étaient censés attraper, retournée
 * contre eux.
 *
 * Ce fichier empêche la récidive. Il ne juge pas un comportement produit : il
 * vérifie que les gardes savent encore où ils sont.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "./racineDuDepot.ts";

/**
 * Les fils-pièges qui lisent l'arbre de fichiers, donc ceux pour qui la
 * question « où suis-je ? » a une réponse qui compte.
 */
const GARDES = [
  "apps/web/src/marque.chaine.test.ts",
  "apps/web/src/components/sidebar/moletteRelachee.test.ts",
  "apps/web/src/components/chat/pastilleSurLeLogo.test.ts",
  "apps/web/src/components/moduleSansAppelant.test.ts",
] as const;

describe("racineDuDepot", () => {
  it("trouve une racine qui EST une racine, pas un dossier au hasard", () => {
    const racine = racineDuDepot();
    expect(NodeFS.existsSync(NodePath.join(racine, "pnpm-workspace.yaml"))).toBe(true);
    // Deux repères plutôt qu'un : un dossier qui contiendrait par accident un
    // `pnpm-workspace.yaml` ne porterait pas aussi ces deux-là.
    expect(NodeFS.existsSync(NodePath.join(racine, "apps/web"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(racine, "packages/contracts"))).toBe(true);
  });

  it("rend le même chemin quel que soit le dossier courant", () => {
    // C'est TOUTE la raison d'être de cette fonction. Si elle dépendait du
    // répertoire courant, elle ne réparerait rien.
    const depuisIci = racineDuDepot();
    const avant = process.cwd();
    try {
      process.chdir(NodePath.join(depuisIci, "apps/web"));
      expect(racineDuDepot()).toBe(depuisIci);
      process.chdir(depuisIci);
      expect(racineDuDepot()).toBe(depuisIci);
    } finally {
      process.chdir(avant);
    }
  });

  it("aucun fil-piège ne devine sa position depuis le dossier courant", () => {
    // Le fil-piège du fil-piège. `process.cwd()` dans un garde qui lit l'arbre
    // est un pari sur la façon dont on le lance — et ce pari a été perdu.
    const racine = racineDuDepot();
    const fautifs: string[] = [];

    for (const garde of GARDES) {
      const chemin = NodePath.join(racine, garde);
      const contenu = NodeFS.readFileSync(chemin, "utf8");
      contenu.split("\n").forEach((ligne, index) => {
        if (!ligne.includes("process.cwd()")) return;
        // Ce fichier-ci s'en sert pour PROUVER l'indépendance ci-dessus.
        fautifs.push(`${garde}:${index + 1} → ${ligne.trim()}`);
      });
    }

    expect(
      fautifs,
      fautifs.length === 0
        ? ""
        : `Ces gardes devinent leur position depuis le dossier courant :\n${fautifs.join("\n")}\n\n` +
            `Sous « npm test » — la commande du pipeline — chaque paquet tourne depuis SON ` +
            `dossier, et ces chemins doublent (.../apps/web/apps/web/src/...). Le garde ` +
            `échoue alors en ENOENT, donc il ne garde plus rien. Utilise racineDuDepot().`,
    ).toEqual([]);
  });
});
