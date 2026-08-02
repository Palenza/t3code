// @effect-diagnostics nodeBuiltinImport:off - Ce garde LIT les sources pour vérifier quel numéro de version est affiché : il lui faut le disque brut, pas une couche Effect.
/**
 * LE NUMÉRO QU'ON MONTRE N'EST PAS CELUI QU'ON MESURE.
 *
 * Ce dépôt porte DEUX versions, et les confondre produit un chiffre faux et
 * parfaitement crédible :
 *
 *   · `APP_VERSION` — la version d'`apps/web`, que seule la CI bumpe. Elle
 *     sert à `versionSkew` (détecter un écart client/serveur) et à la
 *     télémétrie. Ce n'est PAS ce que l'utilisateur fait tourner.
 *   · `APP_BUILD_VERSION` — le numéro du DMG installé. C'est celui-là qu'on
 *     montre.
 *
 * Le 02/08, Enzo faisait tourner un DMG 0.0.85 pendant que l'écran annonçait
 * 0.0.31. Le correctif a été posé dans la barre latérale… et l'écran
 * « À propos » est resté sur l'ancien numéro. Le même bug, deux fois, dans
 * deux fichiers — parce que rien ne l'empêchait.
 *
 * Ce fil-piège l'empêche : hors des deux consommateurs légitimes, personne
 * n'importe `APP_VERSION`.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "./racineDuDepot.ts";

/**
 * LES DEUX SEULS DROITS D'USAGE, et ce ne sont pas des affichages.
 *
 * `versionSkew` compare la version du client à celle du serveur — il lui faut
 * précisément la version du web. `clientTracing` étiquette les traces avec la
 * version du code qui les émet, pour la même raison.
 */
const CONSOMMATEURS_LEGITIMES = [
  "apps/web/src/versionSkew.ts",
  "apps/web/src/observability/clientTracing.ts",
  // Même usage que `clientTracing` : étiqueter les traces avec la version du
  // code qui les émet. Trouvé par ce test en l'écrivant — je n'en connaissais
  // que deux sur trois.
  "apps/web/src/lib/runtime.ts",
  // La source elle-même, qui définit les deux constantes.
  "apps/web/src/branding.ts",
  // La déclaration de type des deux variables d'environnement.
  "apps/web/src/vite-env.d.ts",
] as const;

const EXTENSIONS = [".ts", ".tsx"];

function fichiersSources(racine: string): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of NodeFS.readdirSync(dossier)) {
      if (entree === "node_modules" || entree.startsWith(".")) continue;
      const chemin = NodePath.join(dossier, entree);
      if (NodeFS.statSync(chemin).isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (EXTENSIONS.some((extension) => entree.endsWith(extension))) {
        trouves.push(chemin);
      }
    }
  };
  parcourir(racine);
  return trouves;
}

describe("le numéro de version affiché", () => {
  const racine = racineDuDepot();

  it("n'est jamais `APP_VERSION` en dehors des deux consommateurs légitimes", () => {
    const fautes: string[] = [];

    for (const chemin of fichiersSources(NodePath.join(racine, "apps/web/src"))) {
      const relatif = chemin.slice(racine.length + 1);
      if (relatif.includes(".test.")) continue;
      if (CONSOMMATEURS_LEGITIMES.some((permis) => relatif === permis)) continue;

      const lignes = NodeFS.readFileSync(chemin, "utf8").split("\n");
      // Le piège, rencontré DEUX FOIS aujourd'hui : dans un commentaire de
      // bloc — `/* … */` comme `{/* … */}` — les lignes INTÉRIEURES sont du
      // texte nu. Elles ne commencent ni par `//`, ni par `*`. Un détecteur
      // ligne à ligne prend donc l'explication du piège pour le piège
      // lui-même. On suit l'état du bloc, pas l'allure de la ligne.
      let dansBloc = false;

      lignes.forEach((ligne, index) => {
        const texte = ligne.trim();
        const ouvre = texte.includes("{/*") || texte.startsWith("/*") || texte.startsWith("/**");
        const ferme = texte.includes("*/");

        const etaitDansBloc = dansBloc;
        if (ouvre && !ferme) dansBloc = true;
        else if (ferme) dansBloc = false;

        if (etaitDansBloc || ouvre || ferme) return;
        if (texte.startsWith("//")) return;

        // `APP_BUILD_VERSION` contient le mot mais n'est pas la faute.
        const nu = ligne.replace(/APP_BUILD_VERSION/g, "");
        if (!/\bAPP_VERSION\b/.test(nu)) return;

        fautes.push(`${relatif}:${index + 1} → ${texte}`);
      });
    }

    expect(
      fautes,
      fautes.length === 0
        ? ""
        : `Ces fichiers utilisent APP_VERSION, qui est la version d'apps/web — pas celle ` +
            `du DMG installé :\n${fautes.join("\n")}\n\n` +
            `Pour AFFICHER une version, c'est APP_BUILD_VERSION. APP_VERSION ne sert qu'à ` +
            `versionSkew et à la télémétrie. Le 02/08, la confusion a fait annoncer 0.0.31 ` +
            `pour un DMG 0.0.85 — deux fois, dans deux fichiers.`,
    ).toEqual([]);
  });

  it("les consommateurs légitimes existent toujours", () => {
    // Une liste d'exceptions qui ne correspond plus à rien ouvre une porte au
    // nom d'un besoin disparu.
    for (const permis of CONSOMMATEURS_LEGITIMES) {
      expect(
        NodeFS.existsSync(NodePath.join(racine, permis)),
        `${permis} n'existe plus — retire-le de CONSOMMATEURS_LEGITIMES.`,
      ).toBe(true);
    }
  });
});
