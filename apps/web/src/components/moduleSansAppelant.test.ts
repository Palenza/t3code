// @effect-diagnostics nodeBuiltinImport:off - Ce garde SCANNE l arbre de fichiers pour trouver les composants exportés sans appelant : il lui faut le disque brut, pas une couche Effect.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vite-plus/test";

/**
 * UN MODULE EXPORTÉ QUE PERSONNE N'IMPORTE — la faute qui revient, patchée ici
 * pour de bon.
 *
 * Le 01/08, la page Skills a été écrite, testée, annoncée LIVRÉE… et laissée
 * SANS LIEN : route créée, panneau créé, aucune entrée de navigation. Enzo ne
 * pouvait pas l'ouvrir. Ce n'était pas la première fois — la mémoire du projet
 * nomme cette pente « finir le module et oublier de le brancher », 8 fois sur
 * 15. Corriger l'occurrence ne suffisait pas ; c'est la CLASSE qu'il faut tuer,
 * et c'est à l'agent de le voir seul.
 *
 * Même principe que `garde-chemins-spawnes` côté Palenza : un chemin cité est
 * un CONTRAT. Ici : un composant exporté sans aucun importateur est du code
 * mort qui a l'air vivant — il passe le typecheck, il passe ses propres tests,
 * et il ne s'exécute jamais.
 *
 * Les dérogations portent leur RAISON écrite, et une dérogation PÉRIMÉE fait
 * rougir : sans ce second contrôle la liste devient un cimetière (leçon du
 * banc des gardes, 01/08).
 */

const RACINE = new URL("..", import.meta.url).pathname;
const COMPOSANTS = join(RACINE, "components");

/** Ceux qui n'ont légitimement aucun importateur, avec la raison. */
const SANS_APPELANT_ASSUME: Readonly<Record<string, string>> = {};

function fichiersSources(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiersSources(chemin));
      continue;
    }
    if (!entree.endsWith(".tsx")) continue;
    if (entree.includes(".test.") || entree.includes(".browser.")) continue;
    sortie.push(chemin);
  }
  return sortie;
}

function toutLeSource(): string {
  const racines = ["components", "routes", "state", "hooks"].map((d) => join(RACINE, d));
  let texte = "";
  for (const racine of racines) {
    try {
      for (const f of fichiersSources(racine)) texte += readFileSync(f, "utf8");
    } catch {
      // Un dossier absent n'est pas une panne : on scanne ce qui existe.
    }
  }
  return texte;
}

describe("aucun composant exporté ne reste sans appelant", () => {
  it("chaque panneau de réglages est importé quelque part", () => {
    const source = toutLeSource();
    const panneaux = fichiersSources(join(COMPOSANTS, "settings")).filter((f) =>
      readFileSync(f, "utf8").includes("export function "),
    );

    const orphelins: string[] = [];
    for (const chemin of panneaux) {
      const nom = chemin.split("/").pop()?.replace(".tsx", "") ?? "";
      const relatif = relative(RACINE, chemin);
      if (SANS_APPELANT_ASSUME[nom] !== undefined) continue;
      // Un import cite le NOM du fichier : `from "./SkillsSettingsPanel"`.
      const cite = source.split(`/${nom}"`).length - 1 + (source.split(`"./${nom}"`).length - 1);
      if (cite === 0) orphelins.push(relatif);
    }

    expect(
      orphelins,
      `Ces panneaux sont exportés mais JAMAIS importés — écrits, jamais atteignables :\n  ${orphelins.join("\n  ")}\n` +
        `Brancher l'appelant, ou déclarer la raison dans SANS_APPELANT_ASSUME.`,
    ).toEqual([]);
  });
});
