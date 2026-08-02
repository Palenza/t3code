import * as NodeOS from "node:os";

import type { ClaudeSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { expandHomePath } from "../../pathExpansion.ts";
import { inheritSharedMcpServers } from "./ClaudeSharedConfig.ts";

export const resolveClaudeHomePath = Effect.fn("resolveClaudeHomePath")(function* (
  config: Pick<ClaudeSettings, "homePath">,
): Effect.fn.Return<string, never, Path.Path> {
  const path = yield* Path.Path;
  const homePath = config.homePath.trim();
  return path.resolve(homePath.length > 0 ? expandHomePath(homePath) : NodeOS.homedir());
});

/**
 * LES SIGNAUX QUE LE MOTEUR N'ÉMET QUE SI ON LES DEMANDE.
 *
 * `session_state_changed` est traité depuis longtemps dans `ClaudeAdapter`
 * (« Authoritative turn-over signal from the CLI »), et il n'est JAMAIS arrivé :
 * le binaire ne l'émet que derrière une porte, vérifiée dans son code —
 *
 *   if (__(process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS))
 *     EX({ type: "system", subtype: "session_state_changed", state: H })
 *
 * — et `grep -rn EMIT_SESSION_STATE_EVENTS apps/ packages/` rendait ZÉRO.
 * Un branchement écrit, commenté, qui a l'air vivant et ne l'est pas : ni
 * rouge, ni exception, juste une pièce inerte. La classe exacte du mode de
 * panne A5b — la dépendance manquante qui rend le correctif inerte.
 *
 * Ce qu'on ne prétend PAS : que le handler fait quelque chose d'utile une fois
 * réveillé. On lui ouvre la porte ; ce qu'il en fait se juge à l'usage.
 */
const SIGNAUX_DE_SESSION = {
  CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1",
} as const;

export const makeClaudeEnvironment = Effect.fn("makeClaudeEnvironment")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  baseEnv?: NodeJS.ProcessEnv,
): Effect.fn.Return<NodeJS.ProcessEnv, never, Path.Path | FileSystem.FileSystem> {
  const resolvedBaseEnv = { ...(baseEnv ?? process.env), ...SIGNAUX_DE_SESSION };
  const homePath = config.homePath.trim();
  // ⚠️ Ce retour anticipé sert le compte PAR DÉFAUT (pas de dossier propre).
  // Poser un réglage plus bas seulement, c'est le manquer pour lui — et une
  // correction qui marche sur deux comptes sur trois est pire qu'aucune : elle
  // se prouve verte sur l'un et ment sur l'autre.
  if (homePath.length === 0) return resolvedBaseEnv;
  const resolvedHomePath = yield* resolveClaudeHomePath(config);
  // Un compte ajouté hérite des serveurs MCP du compte de référence — sinon
  // le relais bascule le fil sur une instance sans outillage (vécu 29/07).
  yield* inheritSharedMcpServers(resolvedHomePath);
  return {
    ...resolvedBaseEnv,
    // Isolate this instance's config via CLAUDE_CONFIG_DIR rather than HOME.
    // Overriding HOME also relocates the macOS login keychain lookup
    // ($HOME/Library/Keychains), so the spawned CLI can't find its stored
    // OAuth credentials and reports "Not logged in". CLAUDE_CONFIG_DIR points
    // Claude Code at its config dir directly while leaving HOME (and the
    // keychain) intact.
    CLAUDE_CONFIG_DIR: resolvedHomePath,
  };
});

export const makeClaudeContinuationGroupKey = Effect.fn("makeClaudeContinuationGroupKey")(
  function* (config: Pick<ClaudeSettings, "homePath">): Effect.fn.Return<string, never, Path.Path> {
    const resolvedHomePath = yield* resolveClaudeHomePath(config);
    return `claude:home:${resolvedHomePath}`;
  },
);

export const makeClaudeCapabilitiesCacheKey = Effect.fn("makeClaudeCapabilitiesCacheKey")(
  function* (
    config: Pick<ClaudeSettings, "binaryPath" | "homePath">,
    cwd?: string,
  ): Effect.fn.Return<string, never, Path.Path> {
    const resolvedHomePath = yield* resolveClaudeHomePath(config);
    return `${config.binaryPath}\0${resolvedHomePath}\0${cwd ?? ""}`;
  },
);
