import * as NodeOS from "node:os";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/**
 * Copies one thread's CHAT TRANSCRIPT (a plain `<sessionId>.jsonl` history
 * file) into the project folder of another configured Claude instance, so the
 * same conversation can continue there with `--resume`.
 *
 * This touches conversation history files only. It never reads, writes or
 * moves credentials, keychain items or auth state of any kind — accounts stay
 * signed in exactly as they are; only the visible chat log gains a copy.
 *
 * Product context (décision fondateur 29/07, « je veux garder le même
 * thread ») : chaque instance garde ses transcriptions sous
 * `<home>/projects/<dossier-projet>/<sessionId>.jsonl` ; sans cette copie, le
 * sélecteur refuse de continuer un fil démarré sur une autre instance.
 */

const CONTINUATION_KEY_PREFIX = "claude:home:";
/** Claude session ids are UUIDs; anything else must never reach a file path. */
const SAFE_SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

export function claudeHomeFromContinuationKey(key: string): string | null {
  if (!key.startsWith(CONTINUATION_KEY_PREFIX)) {
    return null;
  }
  const home = key.slice(CONTINUATION_KEY_PREFIX.length).trim();
  return home.length > 0 ? home : null;
}

export function claudeSessionIdFromResumeCursor(resumeCursor: unknown): string | null {
  if (!resumeCursor || typeof resumeCursor !== "object") {
    return null;
  }
  const cursor = resumeCursor as { readonly resume?: unknown; readonly sessionId?: unknown };
  const candidate =
    typeof cursor.resume === "string" && cursor.resume.trim().length > 0
      ? cursor.resume
      : typeof cursor.sessionId === "string" && cursor.sessionId.trim().length > 0
        ? cursor.sessionId
        : null;
  return candidate !== null && SAFE_SESSION_ID.test(candidate) ? candidate : null;
}

/** The CLI's project-directory name: every non-alphanumeric byte becomes `-`. */
export function mungeClaudeProjectDirName(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Where the CLI keeps transcripts for a given resolved home. Custom instances
 * point CLAUDE_CONFIG_DIR at their home, so transcripts live directly under
 * `<home>/projects`. The DEFAULT instance has an empty homePath: its
 * continuation key encodes the plain OS home directory, but the CLI (with no
 * CLAUDE_CONFIG_DIR set) stores transcripts under `~/.claude/projects`.
 */
export function claudeProjectsRoot(home: string, osHomedir: string): string {
  return home === osHomedir ? `${home}/.claude/projects` : `${home}/projects`;
}

/**
 * Returns true when the target instance ends up holding the transcript
 * (freshly copied or already present), false when the copy cannot be done —
 * the caller then keeps its existing refusal, nothing is ever half-moved.
 * The source file is left untouched: the original instance keeps its history.
 */
export const copyClaudeTranscriptToInstance = Effect.fn("copyClaudeTranscriptToInstance")(
  function* (input: {
    readonly fromContinuationKey: string;
    readonly toContinuationKey: string;
    readonly resumeCursor: unknown;
    readonly cwd: string | undefined;
  }): Effect.fn.Return<boolean, never, FileSystem.FileSystem | Path.Path> {
    const fromHome = claudeHomeFromContinuationKey(input.fromContinuationKey);
    const toHome = claudeHomeFromContinuationKey(input.toContinuationKey);
    const sessionId = claudeSessionIdFromResumeCursor(input.resumeCursor);
    if (fromHome === null || toHome === null || sessionId === null || !input.cwd) {
      // A refusal here silently re-locks the account switch — always say why.
      yield* Effect.logWarning("claude transcript copy skipped: unusable inputs", {
        hasFromHome: fromHome !== null,
        hasToHome: toHome !== null,
        hasSessionId: sessionId !== null,
        resumeCursorType: typeof input.resumeCursor,
        hasCwd: Boolean(input.cwd),
      });
      return false;
    }
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const osHomedir = path.resolve(NodeOS.homedir());
    const projectDirName = mungeClaudeProjectDirName(input.cwd);
    const sourceFile = path.join(
      claudeProjectsRoot(fromHome, osHomedir),
      projectDirName,
      `${sessionId}.jsonl`,
    );
    const targetDir = path.join(claudeProjectsRoot(toHome, osHomedir), projectDirName);
    const targetFile = path.join(targetDir, `${sessionId}.jsonl`);

    const targetExists = yield* fileSystem
      .exists(targetFile)
      .pipe(Effect.orElseSucceed(() => false));
    if (targetExists) {
      return true;
    }
    const sourceExists = yield* fileSystem
      .exists(sourceFile)
      .pipe(Effect.orElseSucceed(() => false));
    if (!sourceExists) {
      yield* Effect.logWarning("claude transcript copy skipped: source transcript not found", {
        sourceFile,
      });
      return false;
    }
    return yield* fileSystem.makeDirectory(targetDir, { recursive: true }).pipe(
      Effect.andThen(fileSystem.copyFile(sourceFile, targetFile)),
      Effect.as(true),
      Effect.tapError((cause) =>
        Effect.logWarning("claude transcript copy failed", { sourceFile, targetFile, cause }),
      ),
      Effect.orElseSucceed(() => false),
    );
  },
);
