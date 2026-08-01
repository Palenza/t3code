/**
 * LE GARDE DU TROISIÈME ÉTAGE, BRANCHÉ SUR LE RÉEL.
 *
 * `JamaisExecute.ts` décide ; ce fichier lui donne la matière et le fait
 * TOURNER. Il est le véhicule de livraison, choisi exprès : un outil MCP de
 * plus serait le module n°37 que personne n'appelle — précisément la panne que
 * ce garde existe pour attraper. Un test, lui, tourne à chaque `pnpm test`.
 *
 * ── Ce qui échoue ici, et ce qui se contente de PARLER ───────────────────
 *
 * ÉCHOUE (déterministe, vrai sur toute machine) :
 *   · l'énumération ne trouve aucun outil → le garde est aveugle ;
 *   · le registre nomme une surface qui n'existe plus → il ment ;
 *   · le registre couvre une surface désormais observée → il ment aussi.
 *
 * PARLE SEULEMENT (dépend de la machine) : la liste des surfaces jamais
 * appelées. La projection d'Enzo, celle d'un collègue et celle d'une CI n'ont
 * aucune raison de se ressembler. En faire un rouge fabriquerait le rouge
 * intermittent que j'ai passé une heure à supprimer cette nuit — celui qui
 * apprend à relancer au lieu de lire.
 *
 * Le compte s'affiche donc à chaque passage. Il ne bloque pas ; il ne se cache
 * pas non plus.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  assomptionsPerimees,
  confronter,
  raconter,
  type Fenetre,
  type Surface,
} from "./JamaisExecute.ts";
import { racineDesSources } from "./racineDesSources.ts";

/**
 * Les silences ACCEPTÉS, avec leur raison et sa date.
 *
 * Volontairement vide. Une entrée ici dit « on sait, et c'est voulu » — donc
 * elle doit porter POURQUOI, sinon elle ne fait que faire taire le garde.
 * Le test des assomptions périmées la nettoie toute seule le jour où la
 * surface se met enfin à servir.
 */
const SILENCES_ASSUMES = new Map<string, string>();

/** Tout `Tool.make("nom", …)` déclaré sous `mcp/toolkits`. */
const surfacesDeclarees = Effect.fn("test.surfacesDeclarees")(function* (racine: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dossier = path.join(racine, "mcp", "toolkits");
  const trouvees: Array<Surface> = [];

  const paquets = yield* fileSystem.readDirectory(dossier).pipe(Effect.orElseSucceed(() => []));
  for (const paquet of paquets) {
    const fichier = path.join(dossier, paquet, "tools.ts");
    const texte = yield* fileSystem.readFileString(fichier).pipe(Effect.orElseSucceed(() => ""));
    for (const trouvaille of texte.matchAll(/Tool\.make\("([^"]+)"/g)) {
      const nom = trouvaille[1];
      // `appelableDepuis: 0` — on ne prétend pas dater la mise en service ici.
      // La fenêtre d'observation borne de toute façon l'observable, et une
      // fausse date de naissance produirait un faux verdict.
      if (nom !== undefined) trouvees.push({ nom, appelableDepuis: 0 });
    }
  }
  return trouvees;
});

it.layer(NodeServices.layer, { excludeTestServices: true })("jamais exécuté", (it) => {
  describe("livré ne veut rien dire, observé si", () => {
    it.effect("le garde VOIT les surfaces, et son registre ne ment pas", () =>
      Effect.gen(function* () {
        const surfaces = yield* surfacesDeclarees(racineDesSources());

        // Anti-silence : un garde qui n'énumère rien passerait au vert en ne
        // gardant rien. C'est la panne qui m'a mordu six fois cette nuit.
        assert.isAbove(
          surfaces.length,
          10,
          "aucune surface trouvée : l'énumération est cassée, le garde est aveugle",
        );

        // Le registre ne doit nommer que des surfaces qui EXISTENT.
        const noms = new Set(surfaces.map((surface) => surface.nom));
        const fantomes = [...SILENCES_ASSUMES.keys()].filter((nom) => !noms.has(nom));
        assert.deepEqual(
          fantomes,
          [],
          "le registre couvre des surfaces qui n'existent plus : il raconte une histoire fausse",
        );

        // Sans projection lisible, on ne conclut RIEN (H4). Le module le sait,
        // et rend « hors-fenêtre » plutôt qu'une accusation.
        const fenetre: Fenetre | null = null;
        const lignes = confronter(surfaces, new Map(), fenetre, SILENCES_ASSUMES);

        const perimees = assomptionsPerimees(lignes, SILENCES_ASSUMES);
        assert.deepEqual(
          perimees,
          [],
          "des silences sont inscrits comme assumés alors qu'ils sont désormais observés",
        );

        // Le compte-rendu PARLE, il ne bloque pas — voir l'en-tête.
        // eslint-disable-next-line no-console
        console.log(`  [jamais-exécuté] ${raconter(lignes)}`);
      }),
    );
  });
});
