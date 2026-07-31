import * as NodeCrypto from "node:crypto";
import * as NodeOS from "node:os";

import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { collectStreamAsString } from "./providerSnapshot.ts";

/**
 * Finds the OAuth access token Claude Code stored for one account.
 *
 * ATTRIBUTION IS THE WHOLE POINT. Two Claude instances are two subscriptions
 * with two independent quotas, and showing one account's figures under the
 * other's name is a lie the interface cannot detect. Which is why the source
 * is chosen from the instance's own config directory rather than looked up
 * globally:
 *
 *   - a custom `CLAUDE_CONFIG_DIR` → that directory's own keychain item
 *     (`Claude Code-credentials-<sha256(dir)[:8]>` — verified on a real
 *     machine, 28/07/2026: the CLI does NOT write `.credentials.json` on
 *     macOS, it creates one hashed keychain item per config directory),
 *     falling back to the directory's `.credentials.json` (non-mac);
 *   - the default directory → the macOS keychain, falling back to
 *     `~/.claude/.credentials.json`.
 *
 * Correct by construction: there is no path by which one instance can read
 * another's credential. An instance with no readable credential gets nothing
 * back and simply shows no usage.
 *
 * The token is never logged and never leaves this module except as a return
 * value handed straight to an Authorization header.
 */

/** The item Claude Code creates in the macOS login keychain. */
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/**
 * Refuse a token about to expire rather than spend a request discovering it.
 * A minute of margin covers the round trip.
 */
const EXPIRY_MARGIN_MS = 60_000;

interface StoredCredential {
  readonly accessToken: string;
  readonly expiresAt: number;
}

const parseCredential = (raw: string): StoredCredential | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A malformed credentials file is not this module's problem to report: the
    // caller shows no usage, which is the honest outcome either way.
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const oauth = (parsed as { claudeAiOauth?: unknown }).claudeAiOauth;
  if (typeof oauth !== "object" || oauth === null) {
    return undefined;
  }
  const { accessToken, expiresAt } = oauth as {
    accessToken?: unknown;
    expiresAt?: unknown;
  };
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return undefined;
  }
  return {
    accessToken,
    // A credential with no expiry is treated as usable; the endpoint is the
    // final judge and answers 401 if it disagrees.
    expiresAt: typeof expiresAt === "number" ? expiresAt : Number.POSITIVE_INFINITY,
  };
};

const readCredentialFile = Effect.fn("readClaudeCredentialFile")(function* (
  filePath: string,
): Effect.fn.Return<StoredCredential | undefined, never, FileSystem.FileSystem> {
  const fileSystem = yield* FileSystem.FileSystem;
  const raw = yield* fileSystem
    .readFileString(filePath)
    .pipe(Effect.orElseSucceed(() => undefined));
  return raw === undefined ? undefined : parseCredential(raw);
});

/**
 * The keychain service name holding one config directory's credentials.
 *
 * Derivation verified against real keychain items (28/07/2026):
 * `~/.claude-compte-b` → `Claude Code-credentials-e4acc0cc`, where `e4acc0cc`
 * is the first 8 hex chars of sha256 of the absolute directory path.
 * Attribution is preserved by construction: the hash binds the item to one
 * directory, so one instance can never read another's credential.
 */
export const keychainServiceForConfigDir = (configDir: string): string =>
  `${KEYCHAIN_SERVICE}-${NodeCrypto.createHash("sha256").update(configDir).digest("hex").slice(0, 8)}`;

const readKeychainCredential = Effect.fn("readClaudeKeychainCredential")(function* (
  service: string,
): Effect.fn.Return<StoredCredential | undefined, never, ChildProcessSpawner.ChildProcessSpawner> {
  // The keychain item only exists on macOS; anywhere else the credentials
  // file is the only source, and spawning `security` would just fail slowly.
  if ((yield* HostProcessPlatform) !== "darwin") {
    return undefined;
  }
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const stdout = yield* Effect.gen(function* () {
    const child = yield* spawner.spawn(
      ChildProcess.make("security", ["find-generic-password", "-s", service, "-w"]),
    );
    const [text, exitCode] = yield* Effect.all(
      [collectStreamAsString(child.stdout), child.exitCode.pipe(Effect.map(Number))],
      { concurrency: "unbounded" },
    );
    return exitCode === 0 ? text : undefined;
  }).pipe(
    Effect.scoped,
    // Not found, locked, or access denied. All three mean the same thing here:
    // no usage for this account.
    Effect.orElseSucceed(() => undefined),
  );

  return stdout === undefined ? undefined : parseCredential(stdout);
});

export const readClaudeAccessToken = Effect.fn("readClaudeAccessToken")(function* (input: {
  /** The instance's `CLAUDE_CONFIG_DIR`, when it sets one. */
  readonly configDir?: string | undefined;
}): Effect.fn.Return<
  string | undefined,
  never,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
> {
  const path = yield* Path.Path;
  const configDir = input.configDir?.trim();

  const credential =
    configDir !== undefined && configDir.length > 0
      ? ((yield* readKeychainCredential(keychainServiceForConfigDir(configDir))) ??
        (yield* readCredentialFile(path.join(configDir, ".credentials.json"))))
      : ((yield* readKeychainCredential(KEYCHAIN_SERVICE)) ??
        (yield* readCredentialFile(path.join(NodeOS.homedir(), ".claude", ".credentials.json"))));

  if (credential === undefined) {
    return undefined;
  }

  // Measured on a real machine (28/07/2026): the file copy under `~/.claude`
  // was three days stale while the keychain copy was current. That is why the
  // keychain is tried first, and why expiry is checked rather than trusted.
  const now = DateTime.toEpochMillis(yield* DateTime.now);
  return credential.expiresAt - EXPIRY_MARGIN_MS > now ? credential.accessToken : undefined;
});
