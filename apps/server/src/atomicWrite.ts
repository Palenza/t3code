import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/**
 * Le mode d'un fichier que seul son propriétaire doit lire.
 *
 * ── Pourquoi il est là (chantier n°20, audit de démarrage) ────────────────
 *
 * Vérifié le 31/07 sur la vraie machine : `~/.t3/userdata/settings.json` était
 * en `-rw-r--r--`, donc lisible par TOUT utilisateur local. Claude Code, lui,
 * écrit son `.credentials.json` en `-rw-------`.
 *
 * Ce fichier ne porte pas de secret — les jetons vivent au trousseau depuis
 * `3512d7788`. Il porte la CONFIGURATION : combien de comptes existent, et
 * surtout le `homePath` de chacun, c'est-à-dire l'adresse exacte du fichier
 * d'identifiants à aller lire ensuite. Ce n'est pas une fuite, c'est une
 * carte.
 *
 * Le mode est posé sur le fichier TEMPORAIRE, avant le renommage : entre
 * `writeFileString` et `chmod`, un fichier écrit en 0644 est lisible pendant
 * quelques millisecondes. Le renommer une fois déjà restreint ne laisse aucune
 * fenêtre.
 */
export const MODE_PROPRIETAIRE_SEUL = 0o600;

export const writeFileStringAtomically = (input: {
  readonly filePath: string;
  readonly contents: string;
  /**
   * Restreint le fichier à son propriétaire. À poser dès que le contenu dit
   * quelque chose de l'installation — pas seulement quand il porte un secret.
   */
  readonly proprietaireSeul?: boolean;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const targetDirectory = path.dirname(input.filePath);

      yield* fs.makeDirectory(targetDirectory, { recursive: true });
      const tempDirectory = yield* fs.makeTempDirectoryScoped({
        directory: targetDirectory,
        prefix: `${path.basename(input.filePath)}.`,
      });
      const tempPath = path.join(tempDirectory, "contents.tmp");

      yield* fs.writeFileString(tempPath, input.contents);
      if (input.proprietaireSeul === true) {
        // Fail-soft : un système de fichiers sans permissions POSIX (un partage
        // Windows, un volume monté) ne doit pas faire échouer l'écriture — on
        // perd la restriction, pas le fichier.
        yield* fs
          .chmod(tempPath, MODE_PROPRIETAIRE_SEUL)
          .pipe(Effect.orElseSucceed(() => undefined));
      }
      yield* fs.rename(tempPath, input.filePath);
    }),
  );
