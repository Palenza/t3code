/**
 * LIENS SYMBOLIQUES À L'ÉCRITURE — les trois façons de sortir de l'espace.
 *
 * Chaque cas ici a d'abord été prouvé EN DIRECT contre le contrôle lexical
 * seul, le 31/07, sur `/private/tmp/essai-lien2` : le fichier atterrissait
 * vraiment dehors, et dans un cas il a ÉCRASÉ un fichier existant hors du
 * dépôt. Ce ne sont pas des cas d'école.
 *
 * Le dernier test est le contrepoids : un lien de DOSSIER qui reste dedans
 * doit continuer de passer. C'est la forme normale d'un dépôt pnpm
 * (`node_modules/@t3tools/shared` → `packages/shared`) ; un garde qui le
 * refuserait casserait l'outil pour tout le monde.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as WorkspaceEntries from "./WorkspaceEntries.ts";
import * as WorkspaceFileSystem from "./WorkspaceFileSystem.ts";
import * as WorkspacePaths from "./WorkspacePaths.ts";

const ProjectLayer = WorkspaceFileSystem.layer.pipe(
  Layer.provide(WorkspacePaths.layer),
  Layer.provide(WorkspaceEntries.layer.pipe(Layer.provide(WorkspacePaths.layer))),
);

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(ProjectLayer),
  Layer.provideMerge(WorkspacePaths.layer),
  Layer.provideMerge(VcsDriverRegistry.layer.pipe(Layer.provide(VcsProcess.layer))),
  Layer.provide(
    ServerConfig.ServerConfig.layerTest(process.cwd(), { prefix: "t3-workspace-liens-test-" }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

/**
 * Un espace de travail et un dossier VOISIN, hors de lui.
 *
 * Les deux vivent sous un même parent temporaire : c'est exactement la
 * situation d'un dépôt posé à côté d'autre chose sur le disque de quelqu'un.
 */
const monterLeDecor = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const base = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3code-liens-" });
  // Le dossier temporaire lui-même passe par /var → /private/var sur macOS :
  // on travaille sur la racine RÉELLE, sinon chaque cas serait « dehors ».
  const reel = yield* fileSystem.realPath(base).pipe(Effect.orDie);
  const cwd = path.join(reel, "depot");
  const dehors = path.join(reel, "dehors");
  yield* fileSystem.makeDirectory(path.join(cwd, "sous"), { recursive: true }).pipe(Effect.orDie);
  yield* fileSystem.makeDirectory(dehors, { recursive: true }).pipe(Effect.orDie);
  return { cwd, dehors };
});

/** Pose un lien symbolique : `lier(là où ça pointe, le lien lui-même)`. */
const lier = (cible: string, lien: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.symlink(cible, lien).pipe(Effect.orDie);
  });

const existe = (chemin: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem.exists(chemin).pipe(Effect.orDie);
  });

it.layer(TestLayer, { excludeTestServices: true })("writeFile · liens symboliques", (it) => {
  describe("refuse ce qui sort", () => {
    it.effect("un DOSSIER du chemin qui pointe dehors", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const path = yield* Path.Path;
        const { cwd, dehors } = yield* monterLeDecor;
        yield* lier(dehors, path.join(cwd, "sous", "lien"));

        // `Effect.flip` échoue bruyamment si l'écriture RÉUSSIT : le test ne
        // peut pas passer au vert en laissant le trou ouvert.
        const refus = yield* workspaceFileSystem
          .writeFile({ cwd, relativePath: "sous/lien/vole.txt", contents: "VOLE" })
          .pipe(Effect.flip);

        assert.equal(refus._tag, "WorkspaceFilePathEscapeError");
        // Et surtout : rien n'a été écrit dehors.
        assert.isFalse(yield* existe(path.join(dehors, "vole.txt")));
      }),
    );

    it.effect("la FEUILLE elle-même est un lien vers dehors — le cas qui ÉCRASE", () =>
      Effect.gen(function* () {
        // Prouvé en direct : le fichier hors du dépôt est passé de « AVANT » à
        // « VOLE ». Une écriture dans l'espace de travail a détruit une donnée
        // qui n'y était pas.
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { cwd, dehors } = yield* monterLeDecor;
        const victime = path.join(dehors, "cible.txt");
        yield* fileSystem.writeFileString(victime, "AVANT").pipe(Effect.orDie);
        yield* lier(victime, path.join(cwd, "direct.txt"));

        const refus = yield* workspaceFileSystem
          .writeFile({ cwd, relativePath: "direct.txt", contents: "VOLE" })
          .pipe(Effect.flip);

        assert.equal(refus._tag, "WorkspaceFilePathEscapeError");
        expect(yield* fileSystem.readFileString(victime)).toBe("AVANT");
      }),
    );

    it.effect("un lien CASSÉ en feuille — realpath ne peut rien dire, on ne suit pas", () =>
      Effect.gen(function* () {
        // Le traître : `realpath` échoue, donc un garde qui « retombe sur le
        // parent » accepte, et `writeFile` CRÉE le fichier au bout du lien.
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const path = yield* Path.Path;
        const { cwd, dehors } = yield* monterLeDecor;
        const jamais = path.join(dehors, "pas-encore.txt");
        yield* lier(jamais, path.join(cwd, "casse.txt"));

        const refus = yield* workspaceFileSystem
          .writeFile({ cwd, relativePath: "casse.txt", contents: "VOLE" })
          .pipe(Effect.flip);

        assert.equal(refus._tag, "WorkspaceFilePathEscapeError");
        assert.isFalse(yield* existe(jamais), "le fichier a été créé HORS de l'espace");
      }),
    );

    it.effect("l'erreur NOMME où ça mène (A7) — un agent doit pouvoir réparer", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const path = yield* Path.Path;
        const { cwd, dehors } = yield* monterLeDecor;
        yield* lier(dehors, path.join(cwd, "sous", "lien"));

        const issue = yield* workspaceFileSystem
          .writeFile({ cwd, relativePath: "sous/lien/vole.txt", contents: "x" })
          .pipe(Effect.flip);

        assert.equal(issue._tag, "WorkspaceFilePathEscapeError");
        // Le chemin demandé, ET l'endroit réel : « chemin invalide » ne
        // servirait à rien.
        assert.include(issue.message, "sous/lien/vole.txt");
        assert.include(issue.message, dehors);
      }),
    );
  });

  describe("cibles sensibles DANS l'espace de travail", () => {
    it.effect("`.git/hooks/pre-commit` est refusé — c'est du code exécuté au commit", () =>
      Effect.gen(function* () {
        // Le garde des liens ferme la SORTIE. Celui-ci ferme ce qui donne
        // l'exécution de code SANS sortir : un hook git s'exécute au prochain
        // commit, sur la machine de l'humain, avec ses droits.
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const path = yield* Path.Path;
        const { cwd } = yield* monterLeDecor;

        const refus = yield* workspaceFileSystem
          .writeFile({
            cwd,
            relativePath: ".git/hooks/pre-commit",
            contents: "#!/bin/sh\ncurl evil",
          })
          .pipe(Effect.flip);

        assert.equal(refus._tag, "WorkspaceFilePathEscapeError");
        assert.include(refus.message, "core.pager");
        assert.isFalse(yield* existe(path.join(cwd, ".git", "hooks", "pre-commit")));
      }),
    );

    it.effect("`.env` s'écrit quand même — on le DIT, on ne le bloque pas", () =>
      Effect.gen(function* () {
        // Bloquer un fichier qu'on édite pour de vraies raisons le ferait
        // éditer autrement, sans trace.
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { cwd } = yield* monterLeDecor;

        yield* workspaceFileSystem.writeFile({
          cwd,
          relativePath: ".env.local",
          contents: "CLE=valeur\n",
        });

        expect(yield* fileSystem.readFileString(path.join(cwd, ".env.local"))).toBe("CLE=valeur\n");
      }),
    );

    it.effect("le garde des cibles est BRANCHÉ — invariant de la chaîne C", () =>
      Effect.gen(function* () {
        // La chaîne C n'avait aucun invariant testé, et la carte la désigne
        // comme la plus dangereuse. Celui-ci : aucun chemin d'écriture du
        // module `workspace` ne contourne les deux gardes.
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dossier = path.join(process.cwd(), "src", "workspace");
        const source = yield* fileSystem
          .readFileString(path.join(dossier, "WorkspaceFileSystem.ts"))
          .pipe(Effect.orDie);
        assert.include(source, "verifierEcritureReelle", "le garde des liens a disparu");
        assert.include(source, "verdictDeCible", "le garde des cibles a disparu");

        // Et personne d'autre n'écrit dans ce module : un second chemin
        // d'écriture serait un contournement complet.
        const noms = yield* fileSystem.readDirectory(dossier).pipe(Effect.orDie);
        const ecrivains: string[] = [];
        for (const nom of noms) {
          if (!nom.endsWith(".ts") || nom.includes(".test.") || nom === "WorkspaceFileSystem.ts") {
            continue;
          }
          const autre = yield* fileSystem
            .readFileString(path.join(dossier, nom))
            .pipe(Effect.orElseSucceed(() => ""));
          if (autre.includes("writeFileString")) ecrivains.push(nom);
        }
        assert.deepEqual(
          ecrivains,
          [],
          `Ces modules écrivent sans passer par les gardes : ${ecrivains.join(", ")}`,
        );
      }),
    );
  });

  describe("laisse passer ce qui reste dedans", () => {
    it.effect("un lien de DOSSIER interne — la forme normale d'un dépôt pnpm", () =>
      Effect.gen(function* () {
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { cwd } = yield* monterLeDecor;
        yield* fileSystem
          .makeDirectory(path.join(cwd, "paquets", "partage"), { recursive: true })
          .pipe(Effect.orDie);
        yield* fileSystem.makeDirectory(path.join(cwd, "modules")).pipe(Effect.orDie);
        yield* lier(path.join(cwd, "paquets", "partage"), path.join(cwd, "modules", "partage"));

        const resultat = yield* workspaceFileSystem.writeFile({
          cwd,
          relativePath: "modules/partage/index.ts",
          contents: "export const x = 1;\n",
        });

        assert.equal(resultat.relativePath, "modules/partage/index.ts");
        expect(yield* fileSystem.readFileString(path.join(cwd, "paquets/partage/index.ts"))).toBe(
          "export const x = 1;\n",
        );
      }),
    );

    it.effect("une écriture ordinaire dans un dossier qui n'existe pas encore", () =>
      Effect.gen(function* () {
        // Le contrepoids du contrepoids : le garde remonte aux ancêtres, il ne
        // doit pas exiger qu'ils existent.
        const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { cwd } = yield* monterLeDecor;

        yield* workspaceFileSystem.writeFile({
          cwd,
          relativePath: "a/b/c/neuf.ts",
          contents: "ok",
        });

        expect(yield* fileSystem.readFileString(path.join(cwd, "a/b/c/neuf.ts"))).toBe("ok");
      }),
    );
  });
});
