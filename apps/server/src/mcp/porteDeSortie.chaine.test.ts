/**
 * LA CHAÎNE NE DOIT PAS SE DÉTACHER EN SILENCE.
 *
 * Ce test ne vérifie pas un comportement : il vérifie un CÂBLAGE. C'est
 * délibéré, et voici pourquoi.
 *
 * Le 31/07 au matin, j'ai écrit `SortieDOutil.ts` — la porte par laquelle tout
 * ce que nos outils rendent au modèle doit passer : caviardage des secrets,
 * borne de poids. Son en-tête la déclare « PORTE OBLIGATOIRE », avec cette
 * phrase : « une transformation qu'on peut oublier de brancher finit par être
 * oubliée ».
 *
 * Le soir même, sur une remarque du fondateur — « ne code pas un truc le
 * matin, 36 autres entre-temps, et le premier ne marche plus » — j'ai compté :
 * DEUX toolkits sur six ne la traversaient pas. `repo_map` et les quinze
 * poignées de `preview`. Or un `preview_snapshot` rend le contenu d'une page :
 * un jeton dans une URL ou un champ caché partait droit dans le contexte, non
 * caviardé.
 *
 * Le trou n'était pas dans la porte. Il était dans le fait que RIEN ne
 * vérifiait qu'elle était branchée partout — et une règle écrite dans un
 * en-tête de fichier n'a jamais arrêté personne.
 *
 * Ce test énumère les toolkits sur DISQUE. Un toolkit ajouté demain sans la
 * porte tombera au rouge sans que personne n'ait à y penser : c'est le seul
 * moyen connu pour qu'une chaîne survive à ceux qui l'allongent.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { racineDesSources } from "../racineDesSources.ts";

/**
 * Les toolkits qui n'ont légitimement pas de porte, avec la RAISON.
 *
 * Volontairement vide. Toute entrée ici doit dire pourquoi, et un vide est le
 * bon défaut : une dérogation sans raison se reconduit toute seule.
 */
const DEROGATIONS = new Map<string, string>();

it.layer(NodeServices.layer, { excludeTestServices: true })("porte de sortie", (it) => {
  describe("elle est branchée PARTOUT", () => {
    it.effect("chaque toolkit MCP fait passer ce qu'il rend par transformerSortie", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const racine = path.join(racineDesSources(), "mcp");
        const dossier = path.join(racine, "toolkits");

        const noms = yield* fileSystem.readDirectory(dossier).pipe(Effect.orDie);
        // Un test qui n'énumère rien passerait au vert en ne testant rien.
        assert.isAbove(noms.length, 3, "aucun toolkit trouvé : le chemin a bougé");

        const sansPorte: string[] = [];
        for (const nom of noms) {
          if (DEROGATIONS.has(nom)) continue;
          const source = yield* fileSystem
            .readFileString(path.join(dossier, nom, "handlers.ts"))
            .pipe(Effect.orElseSucceed(() => ""));
          if (source.length === 0) continue;
          const traverse = source.includes("porteDeSortie") || source.includes("passerLaPorte");
          if (!traverse) sansPorte.push(nom);
        }

        assert.deepEqual(
          sansPorte,
          [],
          `Ces toolkits rendent au modèle sans passer par la porte : ${sansPorte.join(", ")}. ` +
            "Ajoute `porteDeSortie` à la SORTIE du gestionnaire (voir preuve/handlers.ts), " +
            "ou inscris une dérogation MOTIVÉE dans DEROGATIONS.",
        );
      }),
    );

    it.effect("la porte elle-même caviarde, borne, déborde ET scanne — les quatre", () =>
      Effect.gen(function* () {
        // Si quelqu'un retire une des deux moitiés, le test de câblage
        // resterait vert : le nom serait toujours là, la protection non.
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const source = yield* fileSystem
          .readFileString(path.join(racineDesSources(), "mcp", "SortieDOutil.ts"))
          .pipe(Effect.orDie);
        assert.include(source, "caviarder", "la porte ne caviarde plus");
        assert.include(source, "alleger", "la porte ne fait plus déborder sur disque");
        assert.include(source, "scannerMenaces", "la porte ne scanne plus le contenu tiers");
        assert.include(source, "PLAFOND_SORTIE", "la porte ne borne plus le poids");
      }),
    );
  });
});
