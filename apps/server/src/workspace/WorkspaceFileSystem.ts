// @effect-diagnostics nodeBuiltinImport:off
/**
 * WorkspaceFileSystem - Effect service contract for workspace file mutations.
 *
 * Owns workspace-root-relative file read/write operations and their associated
 * safety checks and cache invalidation hooks.
 *
 * @module WorkspaceFileSystem
 */
import * as NodeFSP from "node:fs/promises";

import type {
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { ancetresDuPlusProfond, verdictDeChemin } from "./CheminSur.ts";
import { verdictDeCible } from "../securite/CibleSensible.ts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as WorkspaceEntries from "./WorkspaceEntries.ts";
import * as WorkspacePaths from "./WorkspacePaths.ts";

const PROJECT_READ_FILE_MAX_BYTES = 1024 * 1024;

export class WorkspaceFileSystemOperationError extends Schema.TaggedErrorClass<WorkspaceFileSystemOperationError>()(
  "WorkspaceFileSystemOperationError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
    operationPath: Schema.String,
    operation: Schema.Literals([
      "realpath-workspace-root",
      "realpath-target",
      "open",
      "stat",
      "read",
      "close",
      "make-directory",
      "write-file",
    ]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Workspace file operation '${this.operation}' failed at '${this.operationPath}' for resolved path '${this.resolvedPath}' (requested as '${this.relativePath}' in '${this.workspaceRoot}').`;
  }
}

export class WorkspaceFilePathEscapeError extends Schema.TaggedErrorClass<WorkspaceFilePathEscapeError>()(
  "WorkspaceFilePathEscapeError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedWorkspaceRoot: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' resolves outside workspace root '${this.workspaceRoot}': ${this.resolvedPath}`;
  }
}

export class WorkspacePathNotFileError extends Schema.TaggedErrorClass<WorkspacePathNotFileError>()(
  "WorkspacePathNotFileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace path '${this.relativePath}' in '${this.workspaceRoot}' is not a file: ${this.resolvedPath}`;
  }
}

export class WorkspaceBinaryFileError extends Schema.TaggedErrorClass<WorkspaceBinaryFileError>()(
  "WorkspaceBinaryFileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' in '${this.workspaceRoot}' is binary and cannot be previewed as text.`;
  }
}

export const WorkspaceFileSystemError = Schema.Union([
  WorkspaceFileSystemOperationError,
  WorkspaceFilePathEscapeError,
  WorkspacePathNotFileError,
  WorkspaceBinaryFileError,
]);
export type WorkspaceFileSystemError = typeof WorkspaceFileSystemError.Type;

/** Service tag for workspace file operations. */
export class WorkspaceFileSystem extends Context.Service<
  WorkspaceFileSystem,
  {
    /** Read a UTF-8 text file relative to the workspace root. */
    readonly readFile: (
      input: ProjectReadFileInput,
    ) => Effect.Effect<
      ProjectReadFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /**
     * Write a file relative to the workspace root.
     *
     * Creates parent directories as needed and rejects paths that escape the
     * workspace root.
     */
    readonly writeFile: (
      input: ProjectWriteFileInput,
    ) => Effect.Effect<
      ProjectWriteFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
  }
>()("t3/workspace/WorkspaceFileSystem") {}

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;

  const readFile: WorkspaceFileSystem["Service"]["readFile"] = Effect.fn(
    "WorkspaceFileSystem.readFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    const realWorkspaceRoot = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(input.cwd),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: input.cwd,
          operation: "realpath-workspace-root",
          cause,
        }),
    });
    const realTargetPath = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(target.absolutePath),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: target.absolutePath,
          operation: "realpath-target",
          cause,
        }),
    });
    const relativeRealPath = path.relative(realWorkspaceRoot, realTargetPath);
    if (
      relativeRealPath.startsWith(`..${path.sep}`) ||
      relativeRealPath === ".." ||
      path.isAbsolute(relativeRealPath)
    ) {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: realWorkspaceRoot,
        resolvedPath: realTargetPath,
      });
    }

    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => NodeFSP.open(realTargetPath, "r"),
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: realTargetPath,
            operationPath: realTargetPath,
            operation: "open",
            cause,
          }),
      }),
      (handle) =>
        Effect.gen(function* () {
          const stat = yield* Effect.tryPromise({
            try: () => handle.stat(),
            catch: (cause) =>
              new WorkspaceFileSystemOperationError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: realTargetPath,
                operationPath: realTargetPath,
                operation: "stat",
                cause,
              }),
          });
          if (!stat.isFile()) {
            return yield* new WorkspacePathNotFileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          const bytesToRead = Math.min(stat.size, PROJECT_READ_FILE_MAX_BYTES);
          const buffer = Buffer.alloc(bytesToRead);
          const { bytesRead } = yield* Effect.tryPromise({
            try: () => handle.read(buffer, 0, bytesToRead, 0),
            catch: (cause) =>
              new WorkspaceFileSystemOperationError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: realTargetPath,
                operationPath: realTargetPath,
                operation: "read",
                cause,
              }),
          });
          const fileBytes = buffer.subarray(0, bytesRead);
          if (fileBytes.includes(0)) {
            return yield* new WorkspaceBinaryFileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          return {
            relativePath: target.relativePath,
            contents: new TextDecoder("utf-8").decode(fileBytes),
            byteLength: stat.size,
            truncated: stat.size > PROJECT_READ_FILE_MAX_BYTES,
          };
        }),
      (handle) =>
        Effect.tryPromise({
          try: () => handle.close(),
          catch: (cause) =>
            new WorkspaceFileSystemOperationError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
              operationPath: realTargetPath,
              operation: "close",
              cause,
            }),
        }),
    );
  });

  /** `realpath`, ou `null` si le chemin n'existe pas / ne se résout pas. */
  const reelOuRien = (chemin: string) =>
    Effect.tryPromise({ try: () => NodeFSP.realpath(chemin), catch: () => null }).pipe(
      Effect.orElseSucceed(() => null),
    );

  /**
   * Où va VRAIMENT une écriture ? Trois façons d'en sortir, les trois prouvées.
   *
   * Démonstration en direct du 31/07 sur `/private/tmp/essai-lien2`, contre le
   * contrôle lexical seul :
   *
   * | ce qu'on écrit      | ce qui est un lien   | où le fichier a atterri     |
   * |---------------------|----------------------|-----------------------------|
   * | `sous/lien/vole.txt`| un DOSSIER du chemin | `…/dehors/vole.txt`         |
   * | `direct.txt`        | la FEUILLE           | `…/dehors/cible.txt` ÉCRASÉ |
   * | `casse.txt`         | la feuille, CASSÉE   | `…/dehors/pas-encore.txt`   |
   *
   * Le troisième est le traître : `realpath` échoue sur un lien cassé, donc un
   * garde qui « retombe sur le parent » l'accepte — et `writeFile` CRÉE le
   * fichier au bout du lien, dehors.
   */
  const verifierEcritureReelle = Effect.fn("WorkspaceFileSystem.verifierEcritureReelle")(
    function* (input: {
      readonly workspaceRoot: string;
      readonly relativePath: string;
      readonly absolutePath: string;
      readonly relativeToRoot: string;
    }) {
      const racineReelle = yield* reelOuRien(input.workspaceRoot);
      if (racineReelle === null) {
        return yield* new WorkspaceFilePathEscapeError({
          workspaceRoot: input.workspaceRoot,
          relativePath: input.relativePath,
          resolvedWorkspaceRoot: input.workspaceRoot,
          resolvedPath: input.absolutePath,
        });
      }

      const refuser = (resolvedPath: string) =>
        new WorkspaceFilePathEscapeError({
          workspaceRoot: input.workspaceRoot,
          relativePath: input.relativePath,
          resolvedWorkspaceRoot: racineReelle,
          resolvedPath,
        });
      const juger = (cibleReelle: string) =>
        verdictDeChemin({
          demande: input.relativePath,
          racineReelle,
          cibleReelle,
          relatif: path.relative(racineReelle, cibleReelle),
          separateur: path.sep,
        });

      // 1 · LA FEUILLE. `lstat` ne suit rien : c'est la seule façon de voir
      //     qu'on s'apprête à écrire À TRAVERS un lien.
      const feuille = yield* Effect.tryPromise({
        try: () => NodeFSP.lstat(input.absolutePath),
        catch: () => null,
      }).pipe(Effect.orElseSucceed(() => null));

      // Ce qu'on va vérifier par remontée d'ancêtres. Un lien cassé le
      // déplace : le fichier naîtra au bout du lien, pas ici.
      let relatifAVerifier = input.relativeToRoot;

      if (feuille?.isSymbolicLink() === true) {
        const bout = yield* reelOuRien(input.absolutePath);
        if (bout !== null) {
          // Lien valide : `realpath` a suivi TOUTE la chaîne. Le verdict est
          // définitif, dans les deux sens — un lien qui reste dedans est
          // légitime (un dépôt pnpm en est plein).
          return juger(bout).sur ? undefined : yield* refuser(bout);
        }
        // Lien CASSÉ : `realpath` ne peut rien dire. Un seul saut suffit — si
        // le bout traversait d'autres liens, ils existeraient, et `realpath`
        // aurait abouti.
        const saut = yield* Effect.tryPromise({
          try: () => NodeFSP.readlink(input.absolutePath),
          catch: () => null,
        }).pipe(Effect.orElseSucceed(() => null));
        if (saut === null) return yield* refuser(input.absolutePath);
        const ou = path.resolve(path.dirname(input.absolutePath), saut);
        relatifAVerifier = path.relative(racineReelle, ou);
        if (!juger(ou).sur) return yield* refuser(ou);
      }

      // 2 · LES DOSSIERS DU CHEMIN. On ne peut pas résoudre un fichier qui
      //     n'existe pas encore ; on résout le premier ancêtre qui EXISTE.
      //     `realpath` étant transitif, s'il est dedans, tous ceux d'avant le
      //     sont aussi — et ceux d'après seront créés comme de vrais dossiers.
      for (const ancetre of ancetresDuPlusProfond(relatifAVerifier, path.sep)) {
        const reel = yield* reelOuRien(
          ancetre.length === 0 ? racineReelle : path.join(racineReelle, ancetre),
        );
        if (reel === null) continue;
        return juger(reel).sur ? undefined : yield* refuser(reel);
      }
      return undefined;
    },
  );

  const writeFile: WorkspaceFileSystem["Service"]["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    // LES LIENS SE RÉSOLVENT AUSSI À L'ÉCRITURE.
    //
    // `resolveRelativePathWithinRoot` ne fait qu'un contrôle LEXICAL : il
    // rejette `..` et l'absolu, mais ne suit aucun lien symbolique. `readFile`
    // ajoute un `realpath` sur la racine ET la cible ; l'écriture ne le
    // faisait pas.
    //
    // Démontré le 31/07 sur un dépôt d'essai : une écriture sur
    // `sous/lien/vole.txt`, où `sous/lien` pointe dehors, passait le contrôle
    // lexical et le fichier atterrissait HORS de l'espace de travail. Ce n'est
    // pas théorique dans un dépôt pnpm, qui est plein de liens.
    //
    // On ne peut pas résoudre la cible : elle n'existe pas encore. On regarde
    // donc la FEUILLE sans la suivre (`lstat`), puis on remonte au premier
    // ANCÊTRE EXISTANT et on résout celui-là.
    // CE QUI EST DEDANS N'EST PAS ORDINAIRE POUR AUTANT.
    //
    // Le garde ci-dessous ferme la SORTIE de l'espace de travail. Il ne dit
    // rien de `.git/hooks/pre-commit`, qui ne franchit aucune frontière et
    // donne pourtant l'exécution de code arbitraire au prochain commit — sur
    // la machine de l'humain, avec ses droits.
    const cible = verdictDeCible(target.relativePath);
    if (cible.nature === "interdite") {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: input.cwd,
        resolvedPath: cible.pourquoi,
      });
    }
    if (cible.nature === "sensible") {
      // On ÉCRIT quand même : ce sont des fichiers qu'on édite pour de vraies
      // raisons, et les bloquer les ferait éditer autrement, sans trace.
      yield* Effect.logWarning(cible.pourquoi);
    }

    yield* verifierEcritureReelle({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
      absolutePath: target.absolutePath,
      relativeToRoot: target.relativePath,
    });

    yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: target.absolutePath,
            operationPath: path.dirname(target.absolutePath),
            operation: "make-directory",
            cause,
          }),
      ),
    );
    yield* fileSystem.writeFileString(target.absolutePath, input.contents).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: target.absolutePath,
            operationPath: target.absolutePath,
            operation: "write-file",
            cause,
          }),
      ),
    );
    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });

  return WorkspaceFileSystem.of({ readFile, writeFile });
});

export const layer = Layer.effect(WorkspaceFileSystem, make);
