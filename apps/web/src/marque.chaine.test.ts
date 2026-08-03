// @effect-diagnostics nodeBuiltinImport:off - Ce garde SCANNE l arbre de fichiers pour refuser le retour du nom de l'amont : il lui faut le disque brut, pas une couche Effect.
/**
 * RAPTOR NE S'ANNONCE PLUS SOUS LE NOM D'UN AUTRE.
 *
 * Le 02/08/2026, décision fondateur : « je veux me détacher absolument des
 * mentions de l'amont. Moi c'est Raptor. » Elle REMPLACE celle du 29/07, qui
 * disait l'inverse — la marque affichée restait celle de l'amont, « Raptor »
 * n'était que le nom du canal local.
 *
 * Ce jour-là, le renommage a touché 62 chaînes dans 31 fichiers. Le problème
 * n'est pas de les avoir changées : c'est qu'une seule qui repousse suffit à
 * ramener l'amont dans une fenêtre de réglages, et que personne ne relit
 * 31 fichiers avant un commit. Une marque se re-contamine par un copier-coller
 * depuis un fichier voisin, par un `git revert` partiel, par une fusion avec
 * l'amont — qui, lui, continue de s'appeler comme avant et dont on fusionne le
 * code chaque nuit.
 *
 * D'où ce fil-piège. Il ne juge aucun comportement : il lit les sources et
 * refuse le retour du nom.
 *
 * ── Ce que ce test ne prétend pas ────────────────────────────────────────
 *
 * Il ne garantit pas que l'app s'affiche bien « Raptor » — c'est le travail de
 * `branding.test.ts`. Il garantit seulement qu'aucun fichier ne réintroduit le
 * nom de l'amont en dur. Un fichier qui appellerait la marque autrement (une
 * variable, une concaténation) passerait au travers. C'est un fil-piège, pas
 * une preuve, et il coûte quelques millisecondes.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "./racineDuDepot.ts";

/** Le nom de l'amont, écrit ici en morceaux pour que ce fichier ne se dénonce pas lui-même. */
const NOM_AMONT = ["T3", "Code"].join(" ");

/**
 * LES SEULES EXCEPTIONS, et ce ne sont PAS des noms de marque.
 *
 * Ce sont les dossiers de données des versions antérieures, sur le disque des
 * utilisateurs. `resolveUserDataPath` préfère l'ancien chemin QUAND IL EXISTE ;
 * les renommer orphelinerait les fils de quiconque a installé l'app avant le
 * 02/08 — l'app se rouvrirait vierge, sans une erreur, et « j'ai perdu mes
 * conversations » serait la seule trace.
 *
 * Le 02/08, un remplacement en masse les a justement emportés, et deux tests
 * sont passés au rouge en le disant. Ils sont donc doublement gardés : par ces
 * tests, et par cette liste.
 */
const CHEMINS_HERITES = [
  `${NOM_AMONT} (Dev)`,
  `${NOM_AMONT} (Nightly)`,
  `${NOM_AMONT} (Alpha)`,
] as const;

/**
 * La même marque, écrite avec un TIRET — la forme qui sert aux noms de
 * fichiers, et celle que le premier garde laissait passer.
 *
 * Trouvée le 02/08 en cherchant autre chose : `artifactName` valait
 * « T3-Code-${version}-${arch}.${ext} », donc le DMG s'appelait encore comme
 * l'amont alors que l'app affichait Raptor. Le garde ne voyait rien : il
 * cherchait « Raptor » avec une espace.
 */
const NOM_AMONT_TIRET = ["T3", "Code"].join("-");

/**
 * LE NOM DU FICHIER D'ARTEFACT, et c'est une exception ASSUMÉE.
 *
 * Ce n'est pas de la marque affichée : c'est de la plomberie, et six endroits
 * en dépendent — `scripts/t3-maj-amont.sh`, les gabarits de
 * `release-smoke.ts` et `merge-update-manifests.test.ts`, plus le script
 * `~/.local/bin/t3-maj` qui vit HORS du dépôt et qu'un renommage casserait
 * sans qu'aucun test ne rougisse.
 *
 * Le renommer demande de bouger les six ensemble, dans le bon ordre. Tant que
 * ce n'est pas fait, on le NOMME ici plutôt que de laisser croire que le
 * débranding est complet — une exception écrite vaut mieux qu'un trou muet.
 */
const ARTEFACT_HERITE = `artifactName: "${NOM_AMONT_TIRET}-\${version}-\${arch}.\${ext}"`;

/** Les arbres qui produisent ce que l'utilisateur LIT. */
const ARBRES = ["apps/web/src", "apps/desktop/src"] as const;
const FICHIERS_ISOLES = ["scripts/build-desktop-artifact.ts"] as const;

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

/** Une ligne fautive, ou `null` si elle ne l'est que par un chemin hérité. */
function ligneFautive(ligne: string): boolean {
  if (!ligne.includes(NOM_AMONT)) return false;
  // Une ligne qui ne contient le nom QUE dans un chemin hérité est innocente.
  let reste = ligne;
  for (const herite of CHEMINS_HERITES) {
    reste = reste.split(herite).join("");
  }
  return reste.includes(NOM_AMONT);
}

describe("la marque de Raptor", () => {
  it("ne réintroduit nulle part le nom de l'amont", () => {
    const racine = racineDuDepot();
    const cibles = [
      ...ARBRES.flatMap((arbre) => fichiersSources(NodePath.join(racine, arbre))),
      ...FICHIERS_ISOLES.map((fichier) => NodePath.join(racine, fichier)),
    ];

    const fautes: string[] = [];
    for (const chemin of cibles) {
      // Ce fichier parle du nom pour le refuser : il ne s'inspecte pas.
      if (chemin.endsWith("marque.chaine.test.ts")) continue;
      const lignes = NodeFS.readFileSync(chemin, "utf8").split("\n");
      lignes.forEach((ligne, index) => {
        if (ligneFautive(ligne)) {
          fautes.push(`${chemin.slice(racine.length + 1)}:${index + 1} → ${ligne.trim()}`);
        }
      });
    }

    // Le message NOMME chaque faute avec son fichier et sa ligne : nos erreurs
    // sont lues par un agent, pas par un humain, et « il reste des mentions »
    // ne se répare pas.
    expect(
      fautes,
      fautes.length === 0
        ? ""
        : `Le nom de l'amont est revenu dans ${fautes.length} ligne(s) :\n${fautes.join("\n")}\n\n` +
            `La marque a UNE source : APP_BASE_NAME (apps/web/src/branding.ts et ` +
            `apps/desktop/src/app/DesktopEnvironment.ts). Une chaîne visible doit la LIRE, ` +
            `jamais la recopier. Si c'est un chemin de données hérité, ajoute-le à ` +
            `CHEMINS_HERITES avec la raison.`,
    ).toEqual([]);
  });

  it("refuse aussi la forme à TIRET, celle des noms de fichiers", () => {
    // Le premier garde ne cherchait que « Raptor » avec une espace, et la
    // forme à tiret lui échappait entièrement. Une seule occurrence existe
    // aujourd'hui — le nom d'artefact — et elle est nommée ci-dessus avec sa
    // raison. Toute AUTRE fait tomber ce test.
    const racine = racineDuDepot();
    const cibles = [
      ...ARBRES.flatMap((arbre) => fichiersSources(NodePath.join(racine, arbre))),
      ...FICHIERS_ISOLES.map((fichier) => NodePath.join(racine, fichier)),
    ];

    const fautes: string[] = [];
    for (const chemin of cibles) {
      if (chemin.endsWith("marque.chaine.test.ts")) continue;
      const lignes = NodeFS.readFileSync(chemin, "utf8").split("\n");
      lignes.forEach((ligne, index) => {
        if (!ligne.includes(NOM_AMONT_TIRET)) return;
        if (ligne.includes(ARTEFACT_HERITE)) return;
        fautes.push(`${chemin.slice(racine.length + 1)}:${index + 1} → ${ligne.trim()}`);
      });
    }

    expect(
      fautes,
      fautes.length === 0
        ? ""
        : `La marque de l'amont revient sous sa forme à tiret dans ${fautes.length} ligne(s) :\n` +
            `${fautes.join("\n")}\n\n` +
            `Si c'est un nom de fichier d'artefact, il n'y en a qu'UN de légitime et il est ` +
            `déjà nommé dans ARTEFACT_HERITE. Sinon, lis la marque depuis APP_BASE_NAME.`,
    ).toEqual([]);
  });

  it("l'exception du nom d'artefact existe VRAIMENT — sinon elle ment", () => {
    // Une exception qui ne correspond plus à rien est pire qu'aucune : elle
    // ouvre une porte au nom d'un problème qui n'existe plus. Le jour où le
    // renommage est fait, ce test tombe et la ligne doit disparaître.
    const build = NodeFS.readFileSync(
      NodePath.join(racineDuDepot(), "scripts/build-desktop-artifact.ts"),
      "utf8",
    );
    expect(
      build.includes(ARTEFACT_HERITE),
      "L'artefact a été renommé — retire ARTEFACT_HERITE de ce fichier, l'exception n'a plus d'objet.",
    ).toBe(true);
  });

  it("garde les chemins de données hérités, qui ne sont pas la marque", () => {
    // Le pendant du test ci-dessus, et il a servi DEUX FOIS le jour même.
    //
    // Un remplacement en masse « Raptor → Raptor » emporte ces trois noms
    // sans rien casser de visible : le typecheck passe, l'app démarre, et elle
    // ne retrouve simplement plus les données de l'utilisateur. Le 02/08, ça
    // s'est produit deux fois de suite — dans la source, puis dans les tests —
    // alors même que le fichier portait l'avertissement en toutes lettres.
    //
    // On épingle donc la SOURCE et ses TESTS ensemble : les deux doivent
    // nommer les mêmes dossiers hérités, sinon l'un des deux a été « nettoyé ».
    const aVerifier = [
      "apps/desktop/src/app/DesktopEnvironment.ts",
      "apps/desktop/src/app/DesktopEnvironment.test.ts",
      "apps/desktop/src/app/DesktopAppIdentity.test.ts",
    ];
    for (const fichier of aVerifier) {
      const contenu = NodeFS.readFileSync(NodePath.join(racineDuDepot(), fichier), "utf8");
      const presents = CHEMINS_HERITES.filter((herite) => contenu.includes(herite));
      expect(
        presents.length,
        `${fichier} ne nomme plus aucun dossier de données hérité — un renommage ` +
          `de marque l'a probablement emporté. Ces noms décrivent des dossiers RÉELS ` +
          `sur le disque des utilisateurs ; les changer orpheline leurs fils.`,
      ).toBeGreaterThan(0);
    }
  });
});
