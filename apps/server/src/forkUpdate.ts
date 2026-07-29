// @effect-diagnostics nodeBuiltinImport:off - The detached rebuild outlives this process on purpose.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "./tableauLocalProxy.ts";

/**
 * Fork self-update WITHOUT an Apple Developer signature (décision fondateur
 * 29/07 : « je ne vais pas prendre Apple Developer, je préfère faire ça
 * manuellement » — mais avec le même geste que la Nightly : une barre
 * « Update available », un clic, un restart).
 *
 * electron-updater refuses unsigned installs on macOS, so the circuit is
 * local instead: upstream nightlies flow into the fork's `travail` branch by
 * the sync workflow (Enzo's features survive as merge history), this route
 * says how far the LOCAL checkout is behind, and « lancer » runs the
 * existing `t3-maj` script detached — pull, local rebuild (no quarantine),
 * open the fresh DMG. Loopback-gated like the tableau-local proxy: this
 * describes and touches only the machine the server runs on.
 */

const FORK_REPO_PATH =
  process.env["T3_FORK_REPO"] ?? NodePath.join(NodeOS.homedir(), "Documents/t3code");
const FORK_REPO = FORK_REPO_PATH;
const UPDATE_COMMAND =
  process.env["T3_FORK_UPDATE_COMMAND"] ?? NodePath.join(FORK_REPO_PATH, "scripts/t3-maj-amont.sh");
const UPDATE_LOG = NodePath.join(NodeOS.homedir(), ".t3/logs/t3-maj.log");
const GIT_TIMEOUT_MS = 25_000;

/** `git <args>` in the fork repo; null on any failure — the caller degrades. */
const runGit = (args: ReadonlyArray<string>): Effect.Effect<string | null> =>
  Effect.callback<string | null>((resume) => {
    const child = NodeChildProcess.execFile(
      "git",
      [...args],
      { cwd: FORK_REPO, timeout: GIT_TIMEOUT_MS },
      (error, stdout) => {
        resume(Effect.succeed(error === null ? stdout : null));
      },
    );
    return Effect.sync(() => {
      child.kill();
    });
  });

/** One rebuild at a time — the pill turns into "building…" meanwhile. */
let rebuildRunning = false;
/**
 * Exit code of the LAST rebuild this server process saw finish; null before
 * any, and null again while one runs. A successful rebuild normally replaces
 * the app (this process dies with it), so a non-zero value here is precisely
 * the signal that matters: the rebuild failed and the app is still the old
 * one — the client turns that into a loud toast instead of 30 min of silence.
 */
let lastRebuildExitCode: number | null = null;

/** La dernière ligne « ✗ … » du journal — la raison, en clair. */
function derniereLigneEchec(): string | null {
  try {
    const lignes = NodeFS.readFileSync(UPDATE_LOG, "utf8").split("\n");
    for (let index = lignes.length - 1; index >= 0; index -= 1) {
      const ligne = lignes[index]?.trim();
      if (ligne !== undefined && ligne.startsWith("✗")) return ligne.replace(/^✗\s*/u, "");
    }
  } catch {
    // Journal illisible : on reste muet plutôt que d'inventer une cause.
  }
  return null;
}

export function isForkRebuildRunning(): boolean {
  return rebuildRunning;
}

export const forkUpdateEtatRouteLayer = HttpRouter.add(
  "GET",
  "/api/fork-update/etat",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }
    // A fetch that fails (offline, repo moved) degrades to comparing against
    // the last-known remote ref — still honest, just possibly stale.
    yield* runGit(["fetch", "origin", "travail"]);
    const countOutput = yield* runGit(["rev-list", "--count", "HEAD..origin/travail"]);
    const behind = countOutput === null ? null : Number.parseInt(countOutput.trim(), 10);
    const subjectOutput =
      behind !== null && behind > 0
        ? yield* runGit(["log", "origin/travail", "-1", "--format=%s"])
        : null;

    // Le RETARD SUR L'AMONT — ce que le fondateur cherchait vraiment quand
    // il comparait avec la Nightly officielle (29/07). Le bouton natif de
    // l'amont ne peut pas marcher chez nous : notre fork ne publie aucune
    // release, et sur macOS electron-updater exige une app signée Apple
    // (compte refusé, décision fondateur). On donne donc l'information
    // autrement : combien de commits de Théo nous manquent, et le dernier.
    yield* runGit(["fetch", "upstream", "main", "--tags"]);
    const amontCountOutput = yield* runGit(["rev-list", "--count", "HEAD..upstream/main"]);
    const amontBehind =
      amontCountOutput === null ? null : Number.parseInt(amontCountOutput.trim(), 10);
    const amontSujetOutput =
      amontBehind !== null && amontBehind > 0
        ? yield* runGit(["log", "upstream/main", "-1", "--format=%s"])
        : null;

    return HttpServerResponse.jsonUnsafe(
      {
        // La RAISON du dernier échec, pas seulement son code : le script sait
        // toujours pourquoi il s'arrête (dépôt sale, conflit, test rouge) et
        // l'écrit dans son journal — « Update échouée (code 1) » ne disait
        // rien à personne (30/07).
        derniereRaison: lastRebuildExitCode !== null && lastRebuildExitCode !== 0
          ? derniereLigneEchec()
          : null,
        behind: behind !== null && Number.isFinite(behind) ? behind : null,
        latestSubject: subjectOutput === null ? null : subjectOutput.trim(),
        amontBehind: amontBehind !== null && Number.isFinite(amontBehind) ? amontBehind : null,
        amontSujet: amontSujetOutput === null ? null : amontSujetOutput.trim(),
        building: rebuildRunning,
        lastRebuildExitCode,
        repo: FORK_REPO,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);

export const forkUpdateLancerRouteLayer = HttpRouter.add(
  "POST",
  "/api/fork-update/lancer",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }
    if (rebuildRunning) {
      return HttpServerResponse.jsonUnsafe({ started: false, reason: "already-running" });
    }
    // `spawn` fails ASYNCHRONOUSLY (a missing `t3-maj` emits `error` on the
    // next tick), so answering right after the call would report started:true
    // for a command that never ran (trouvaille essaim 29/07). The response
    // waits for the child's own verdict: `spawn` fired or `error` fired.
    const started = yield* Effect.callback<boolean>((resume) => {
      try {
        NodeFS.mkdirSync(NodePath.dirname(UPDATE_LOG), { recursive: true });
        const log = NodeFS.openSync(UPDATE_LOG, "a");
        // Detached on purpose: the rebuild replaces THIS app, so it must not
        // die with the server process it updates.
        const child = NodeChildProcess.spawn(UPDATE_COMMAND, [], {
          cwd: FORK_REPO,
          detached: true,
          stdio: ["ignore", log, log],
        });
        rebuildRunning = true;
        lastRebuildExitCode = null;
        child.on("spawn", () => {
          resume(Effect.succeed(true));
        });
        child.on("exit", (code) => {
          rebuildRunning = false;
          lastRebuildExitCode = code ?? -1;
        });
        child.on("error", () => {
          rebuildRunning = false;
          resume(Effect.succeed(false));
        });
        child.unref();
        NodeFS.closeSync(log);
      } catch {
        rebuildRunning = false;
        resume(Effect.succeed(false));
      }
    });
    if (!started) {
      return HttpServerResponse.jsonUnsafe(
        { started: false, reason: "spawn-failed", command: UPDATE_COMMAND },
        { status: 500 },
      );
    }
    yield* Effect.logInfo("fork update rebuild launched", {
      command: UPDATE_COMMAND,
      log: UPDATE_LOG,
    });
    return HttpServerResponse.jsonUnsafe({ started: true, log: UPDATE_LOG });
  }),
);
