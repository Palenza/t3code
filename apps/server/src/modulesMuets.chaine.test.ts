/**
 * UN MODULE QUE PERSONNE N'APPELLE N'EST PAS LIVRÉ.
 *
 * Ce test ne vérifie pas un comportement : il vérifie qu'un module EXISTE POUR
 * QUELQU'UN. C'est le pendant de `mcp/porteDeSortie.chaine.test.ts`, et il
 * naît du même genre de journée.
 *
 * Le 01/08, en triant un chantier, j'ai compté les appelants des modules
 * absorbés d'Hermès : **8 sur 15 n'en avaient AUCUN**. Complets, testés,
 * commentés, annoncés livrés — et jamais exécutés une seule fois. Le doctor
 * savait dire « la table d'index de rappel n'existe pas, relance le serveur » ;
 * c'était vrai sur les deux bases de la machine ce jour-là, depuis des
 * semaines, et rien ne pouvait l'entendre. L'audit de démarrage avait trouvé un
 * jeton d'authentification en 0666 « dès le premier passage » — un passage que
 * personne n'a jamais rejoué.
 *
 * C'est le mode de panne que la LOI nomme A5b : le correctif qui a l'air fait
 * et ne l'est pas. Il ne laisse ni rouge, ni exception, ni trace. Les tests du
 * module passent — ils testent le module. La couverture est bonne. Le commit
 * est convaincant. Rien ne dépasse.
 *
 * Alors on l'attrape ici, par le seul angle qui reste : est-ce que quelqu'un
 * IMPORTE ce fichier ?
 *
 * ── Ce que ce test ne prétend pas ────────────────────────────────────────
 *
 * Un import n'est pas une exécution. Un module importé par un chemin mort
 * passerait ce test. C'est un fil-piège, pas une preuve — mais il attrape le
 * cas qui s'est produit huit fois en une campagne, et il coûte une seconde.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/**
 * Les dossiers de la campagne d'absorption : des modules PURS, écrits pour
 * décider, et dont c'est justement la nature d'attendre un appelant.
 *
 * On n'énumère pas tout `src/` : le dépôt est plein de modules dont le
 * câblage n'a jamais posé de question. Un garde qui crie partout est un garde
 * qu'on désactive.
 */
const DOSSIERS = [
  "contexte",
  "doctor",
  "passerelle",
  "persistance",
  "sauvegarde",
  "securite",
  "skills",
];

/**
 * Les modules SANS appelant, avec la raison. Chaque entrée est une décision
 * qu'on assume, pas un retard qu'on tolère.
 *
 * Une dérogation sans raison se reconduit toute seule — c'est pour ça que la
 * clé porte une phrase et pas un booléen.
 */
const MUETS_ASSUMES = new Map<string, string>([
  [
    "passerelle/TenirLaConnexion.ts",
    "Décision de cycle de vie de la passerelle (n°43). Aucune connexion à tenir tant qu'aucun adaptateur ne se connecte.",
  ],
  [
    "passerelle/LireUneCommande.ts",
    "Lecture des commandes de passerelle (n°44-45), écrite avant le premier adaptateur complet. Aucun message n'arrive encore d'une plateforme tierce.",
  ],
  [
    "passerelle/CibleMorte.ts",
    "Décision de livraison fiable (n°39), écrite avant le premier adaptateur — comme l'autorisation et le débit. Aucune livraison ne part encore vers une plateforme tierce.",
  ],
  [
    "securite/BudgetDeGeneration.ts",
    "Garde de dépense pour la génération d'images (n°69), écrit AVANT le moteur — comme l'autorisation avant l'adaptateur de passerelle. Aucun fournisseur n'est branché : ça engage de l'argent et le choix appartient à Enzo.",
  ],
  [
    "skills/Curateur.ts",
    "Mesuré le 01/08 : la projection ne couvre que 7,3 jours (élaguée). Le curateur répondrait « indécidable » sur toute skill plus vieille, c'est-à-dire presque toutes. Lui donner une bouche maintenant livrerait un outil incapable de rien dire. Il attend une fenêtre d'observation, pas du code.",
  ],
  [
    "sauvegarde/QuoiSauver.ts",
    "Module de décision d'une sauvegarde dont l'EXÉCUTEUR n'existe pas encore. Écrit et assumé comme tel dans son en-tête.",
  ],
  [
    "sauvegarde/QuoiDesinstaller.ts",
    "Idem : la désinstallation à trois granularités décide, mais rien n'efface encore. Un désinstalleur est le seul code dont un bug n'a pas d'annulation — sa décision se teste avant que quoi que ce soit ne touche un fichier.",
  ],
]);

const estSource = (nom: string) => nom.endsWith(".ts") && !nom.endsWith(".test.ts");

/**
 * Toutes les sources du serveur, à plat.
 *
 * Partagé par les deux tests, et c'est le POINT : ma première version faisait
 * chercher les appelants au second test dans les seuls dossiers de la
 * campagne. L'appelant du doctor vit dans `mcp/` — donc une dérogation périmée
 * serait passée inaperçue, dans le test même qui existe pour les attraper.
 */
const toutesLesSources = Effect.fn("test.toutesLesSources")(function* (racine: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const trouvees: Array<{ readonly chemin: string; readonly texte: string }> = [];

  const descendre = (dossier: string): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      const entrees = yield* fileSystem.readDirectory(dossier).pipe(Effect.orElseSucceed(() => []));
      for (const entree of entrees) {
        const complet = path.join(dossier, entree);
        const info = yield* fileSystem.stat(complet).pipe(Effect.orElseSucceed(() => null));
        if (info === null) continue;
        if (info.type === "Directory") {
          yield* descendre(complet);
          continue;
        }
        if (!estSource(entree)) continue;
        trouvees.push({
          chemin: complet,
          texte: yield* fileSystem.readFileString(complet).pipe(Effect.orElseSucceed(() => "")),
        });
      }
    });

  yield* descendre(racine);
  return trouvees;
});

/**
 * Qui importe ce fichier ?
 *
 * On cherche par NOM DE FICHIER et non par chemin : les chemins relatifs
 * varient (`./X.ts`, `../doctor/X.ts`), le nom non.
 */
const appelantsDe = (
  sources: ReadonlyArray<{ readonly chemin: string; readonly texte: string }>,
  chemin: string,
  nomDeFichier: string,
): number =>
  sources.filter((source) => source.chemin !== chemin && source.texte.includes(`/${nomDeFichier}"`))
    .length;

it.layer(NodeServices.layer, { excludeTestServices: true })("modules muets", (it) => {
  describe("chaque module de décision a au moins un appelant", () => {
    it.effect("aucun module ne dort sans raison écrite", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const racine = path.join(process.cwd(), "src");

        const sources = yield* toutesLesSources(racine);
        // Un test qui n'énumère rien passerait au vert en ne testant rien.
        assert.isAbove(sources.length, 100, "aucune source trouvée : le chemin a bougé");

        const muets: string[] = [];
        for (const dossier of DOSSIERS) {
          const chemin = path.join(racine, dossier);
          const entrees = yield* fileSystem
            .readDirectory(chemin)
            .pipe(Effect.orElseSucceed(() => []));
          assert.isAbove(entrees.length, 0, `dossier introuvable : ${dossier}`);

          for (const entree of entrees) {
            if (!estSource(entree)) continue;
            const cle = `${dossier}/${entree}`;
            if (MUETS_ASSUMES.has(cle)) continue;
            if (appelantsDe(sources, path.join(chemin, entree), entree) === 0) muets.push(cle);
          }
        }

        assert.deepEqual(
          muets,
          [],
          `Ces modules n'ont AUCUN appelant : ${muets.join(", ")}. ` +
            "Un module que personne n'appelle n'est pas une fonctionnalité livrée : c'est du code mort " +
            "qui ressemble à du code vivant. Branche-le, ou inscris-le dans MUETS_ASSUMES avec la RAISON " +
            "pour laquelle il attend.",
        );
      }),
    );

    it.effect("une dérogation périmée se voit — le module branché ne doit plus y figurer", () =>
      Effect.gen(function* () {
        // Sans ce contrôle, une dérogation survivrait à son motif : le module
        // finirait branché, la ligne resterait, et la prochaine lecture de la
        // liste raconterait une situation qui n'existe plus.
        const path = yield* Path.Path;
        const racine = path.join(process.cwd(), "src");
        const sources = yield* toutesLesSources(racine);

        const perimees = [...MUETS_ASSUMES.keys()].filter((cle) => {
          const nomDeFichier = cle.split("/").at(-1) ?? "";
          return appelantsDe(sources, path.join(racine, cle), nomDeFichier) > 0;
        });

        assert.deepEqual(
          perimees,
          [],
          `Ces dérogations sont PÉRIMÉES : ${perimees.join(", ")} — le module a trouvé un appelant. ` +
            "Retire la ligne de MUETS_ASSUMES : une exception qui survit à son motif finit par excuser autre chose.",
        );
      }),
    );
  });
});
