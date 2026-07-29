import * as NodeOS from "node:os";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

/**
 * L'héritage entre comptes : un compte ajouté n'est pas un compte nu.
 *
 * Chaque instance Claude vit dans son propre `CLAUDE_CONFIG_DIR`. C'est ce
 * qui permet d'avoir plusieurs abonnements sur une machine — mais ça isole
 * AUSSI les serveurs MCP, qui sont déclarés dans le `.claude.json` du dossier.
 * Constaté en direct le 29/07 : le compte de référence portait 6 serveurs
 * (dont celui que le fondateur venait d'ajouter), les comptes A, B et C zéro.
 * Le relais bascule donc le fil sur un compte qui a perdu tout son outillage,
 * sans que rien ne le dise.
 *
 * Règle : les serveurs du compte de RÉFÉRENCE (le home par défaut, celui du
 * CLI installé) sont hérités par toute autre instance — et un serveur déclaré
 * en propre par une instance GAGNE toujours sur l'hérité. On ne touche à rien
 * d'autre : ni l'identité (`oauthAccount`), ni les projets, ni l'historique.
 *
 * Rejoué à chaque démarrage de session, pas seulement à la création : un MCP
 * ajouté demain doit suivre sans que personne n'y pense.
 */

/** Où vit le `.claude.json` d'un home — vérifié sur les 4 homes de la machine
 * (29/07) : toujours à la racine du dossier, home par défaut compris. */
export function claudeConfigFilePath(homePath: string): string {
  return `${homePath}/.claude.json`;
}

/**
 * La fusion, en pur : l'hérité d'abord, le propre par-dessus. Retourne `null`
 * quand il n'y a rien à écrire — aucun ajout, donc aucune écriture.
 */
export function mergeMcpServers(
  reference: Record<string, unknown>,
  own: Record<string, unknown>,
): Record<string, unknown> | null {
  const inherited = Object.keys(reference).filter((name) => !(name in own));
  if (inherited.length === 0) {
    return null;
  }
  return { ...reference, ...own };
}

/**
 * Fait hériter `homePath` des serveurs MCP du home de référence. Silencieux
 * quand il n'y a rien à faire ; jamais bloquant — un échec de lecture ou
 * d'écriture est journalisé et la session démarre quand même (perdre un MCP
 * est ennuyeux, ne pas démarrer est pire).
 */
export const inheritSharedMcpServers = Effect.fn("inheritSharedMcpServers")(function* (
  homePath: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem | Path.Path> {
  const path = yield* Path.Path;
  const osHomedir = path.resolve(NodeOS.homedir());
  if (path.resolve(homePath) === osHomedir) {
    // Le home de référence n'hérite de personne.
    return;
  }
  const fileSystem = yield* FileSystem.FileSystem;
  const decodeJson = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);
  const encodeJson = Schema.encodeUnknownEffect(Schema.UnknownFromJsonString);
  const readJson = (file: string) =>
    fileSystem.readFileString(file).pipe(
      Effect.flatMap(decodeJson),
      Effect.map((value) =>
        typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null,
      ),
      Effect.orElseSucceed(() => null),
    );

  const referenceConfig = yield* readJson(claudeConfigFilePath(osHomedir));
  const reference = (referenceConfig?.["mcpServers"] ?? {}) as Record<string, unknown>;
  if (Object.keys(reference).length === 0) {
    return;
  }
  const targetFile = claudeConfigFilePath(path.resolve(homePath));
  const targetConfig = yield* readJson(targetFile);
  if (targetConfig === null) {
    // Pas encore de config : le CLI l'écrira à sa première connexion, et
    // l'héritage se fera au démarrage suivant. Rien à forcer ici.
    return;
  }
  const own = (targetConfig["mcpServers"] ?? {}) as Record<string, unknown>;
  const merged = mergeMcpServers(reference, own);
  if (merged === null) {
    return;
  }
  const inherited = Object.keys(reference).filter((name) => !(name in own));
  const serialized = yield* encodeJson({ ...targetConfig, mcpServers: merged }).pipe(
    Effect.orElseSucceed(() => null),
  );
  if (serialized === null) {
    yield* Effect.logWarning("claude MCP inheritance skipped: config could not be serialized", {
      homePath,
    });
    return;
  }
  yield* fileSystem
    .writeFileString(targetFile, `${serialized}\n`)
    .pipe(
      Effect.tap(() =>
        Effect.logInfo("claude instance inherited shared MCP servers", {
          homePath,
          inherited,
        }),
      ),
      Effect.tapError((cause) =>
        Effect.logWarning("claude MCP inheritance failed", { homePath, cause }),
      ),
      Effect.orElseSucceed(() => undefined),
    );
});
