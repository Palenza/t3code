import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";
import { assert, it } from "@effect/vitest";

import { CheckpointRef, GitCommandError } from "@t3tools/contracts";
import * as ServerConfig from "../config.ts";
import * as GitVcsDriver from "./GitVcsDriver.ts";
import * as VcsProcess from "./VcsProcess.ts";
import { runVcsDriverContractSuite } from "./testing/VcsDriverContractHarness.ts";

const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-git-vcs-contract-",
});
const GitContractLayer = Layer.mergeAll(GitVcsDriver.vcsLayer, GitVcsDriver.layer).pipe(
  Layer.provide(ServerConfigLayer),
  Layer.provideMerge(VcsProcess.layer),
  Layer.provideMerge(NodeServices.layer),
);

const runGit = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    yield* driver.execute({
      operation: "GitVcsDriver.contract.git",
      cwd,
      args,
      timeoutMs: 10_000,
    });
  });

type GitContractError = GitCommandError | PlatformError.PlatformError;

runVcsDriverContractSuite<GitVcsDriver.GitVcsDriver, GitContractError>({
  name: "Git",
  kind: "git",
  layer: GitContractLayer,
  fixture: {
    createRepo: (cwd) =>
      Effect.gen(function* () {
        yield* runGit(cwd, ["init"]);
        yield* runGit(cwd, ["config", "user.email", "test@test.com"]);
        yield* runGit(cwd, ["config", "user.name", "Test"]);
      }),
    writeFile: (cwd, relativePath, contents) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const absolutePath = path.join(cwd, relativePath);
        yield* fileSystem.makeDirectory(path.dirname(absolutePath), { recursive: true });
        yield* fileSystem.writeFileString(absolutePath, contents);
      }),
    trackFile: (cwd, relativePath) => runGit(cwd, ["add", relativePath]),
    commit: (cwd, message) => runGit(cwd, ["commit", "-m", message]),
    ignorePath: (cwd, pattern) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fileSystem.writeFileString(path.join(cwd, ".gitignore"), `${pattern}\n`);
      }),
  },
});

it.effect("GitVcsDriver forwards execute env to the VCS process", () => {
  let observedEnv: NodeJS.ProcessEnv | undefined;
  let observedAppendTruncationMarker: boolean | undefined;

  return Effect.gen(function* () {
    const driver = yield* GitVcsDriver.makeVcsDriverShape();

    yield* driver.execute({
      operation: "GitVcsDriver.test.env",
      cwd: "/repo",
      args: ["status"],
      env: {
        GIT_INDEX_FILE: "/tmp/t3-index",
      },
      appendTruncationMarker: true,
    });

    assert.deepStrictEqual(observedEnv, {
      GIT_INDEX_FILE: "/tmp/t3-index",
    });
    assert.strictEqual(observedAppendTruncationMarker, true);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        Layer.mock(VcsProcess.VcsProcess)({
          run: (input) =>
            Effect.sync(() => {
              observedEnv = input.env;
              observedAppendTruncationMarker = input.appendTruncationMarker;
              return {
                exitCode: ChildProcessSpawner.ExitCode(0),
                stdout: "",
                stderr: "",
                stdoutTruncated: false,
                stderrTruncated: false,
              };
            }),
        }),
      ),
    ),
  );
});

it.effect("restore avec rescueRef : l'état écrasé reste RÉCUPÉRABLE — jamais une destruction", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-rescue-" });
    const git = (args: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const driver = yield* GitVcsDriver.GitVcsDriver;
        yield* driver.execute({
          operation: "GitVcsDriver.test.rescue",
          cwd,
          args,
          timeoutMs: 10_000,
        });
      });
    yield* git(["init"]);
    yield* git(["config", "user.email", "test@test.com"]);
    yield* git(["config", "user.name", "Test"]);
    yield* fileSystem.writeFileString(path.join(cwd, "suivi.txt"), "v1");
    yield* git(["add", "."]);
    yield* git(["commit", "-m", "base"]);

    const shape = yield* GitVcsDriver.makeVcsDriverShape();
    const checkpoints = shape.checkpoints;
    assert.isDefined(checkpoints);
    if (!checkpoints) return;

    const cible = CheckpointRef.make("refs/t3code/test/turn-0");
    yield* checkpoints.captureCheckpoint({ cwd, checkpointRef: cible });

    // Le travail d'APRÈS le checkpoint — ce que la restauration va écraser.
    yield* fileSystem.writeFileString(path.join(cwd, "nouveau.txt"), "créé après le checkpoint");
    yield* fileSystem.writeFileString(path.join(cwd, "suivi.txt"), "v2");

    const sauvetage = CheckpointRef.make("refs/t3code/test/rescue-1");
    const restaure = yield* checkpoints.restoreCheckpoint({
      cwd,
      checkpointRef: cible,
      rescueRef: sauvetage,
    });
    assert.isTrue(restaure);

    // L'écrasement a bien eu lieu — c'est le contrat de restore…
    assert.strictEqual(yield* fileSystem.readFileString(path.join(cwd, "suivi.txt")), "v1");
    assert.isFalse(yield* fileSystem.exists(path.join(cwd, "nouveau.txt")));

    // …mais RIEN n'est perdu : le sauvetage ramène l'état d'avant, intégralement.
    const revenu = yield* checkpoints.restoreCheckpoint({ cwd, checkpointRef: sauvetage });
    assert.isTrue(revenu);
    assert.strictEqual(
      yield* fileSystem.readFileString(path.join(cwd, "nouveau.txt")),
      "créé après le checkpoint",
    );
    assert.strictEqual(yield* fileSystem.readFileString(path.join(cwd, "suivi.txt")), "v2");
  }).pipe(Effect.scoped, Effect.provide(GitContractLayer)),
);
