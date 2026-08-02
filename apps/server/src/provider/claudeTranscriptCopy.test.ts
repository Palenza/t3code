import { describe, expect, it } from "vite-plus/test";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it as itEffect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  claudeHomeFromContinuationKey,
  claudeProjectsRoot,
  claudeSessionIdFromResumeCursor,
  copyClaudeTranscriptToInstance,
  mungeClaudeProjectDirName,
} from "./claudeTranscriptCopy.ts";

describe("claudeTranscriptCopy", () => {
  it("extracts the home directory from a continuation key", () => {
    expect(claudeHomeFromContinuationKey("claude:home:/Users/enzo/.claude-compte-a")).toBe(
      "/Users/enzo/.claude-compte-a",
    );
    expect(claudeHomeFromContinuationKey("claude:home:")).toBeNull();
    expect(claudeHomeFromContinuationKey("codex:whatever")).toBeNull();
  });

  it("accepts only path-safe session ids from the resume cursor", () => {
    expect(
      claudeSessionIdFromResumeCursor({ resume: "f0ffd961-792e-4a72-89fd-7fde32f5addd" }),
    ).toBe("f0ffd961-792e-4a72-89fd-7fde32f5addd");
    expect(claudeSessionIdFromResumeCursor({ sessionId: "abc-123" })).toBe("abc-123");
    // Anything that could escape the projects directory is refused outright.
    expect(claudeSessionIdFromResumeCursor({ resume: "../evil" })).toBeNull();
    expect(claudeSessionIdFromResumeCursor({ resume: "a/b" })).toBeNull();
    expect(claudeSessionIdFromResumeCursor({ resume: "" })).toBeNull();
    expect(claudeSessionIdFromResumeCursor(null)).toBeNull();
    expect(claudeSessionIdFromResumeCursor("brut")).toBeNull();
  });

  it("maps a home to the CLI's transcripts root", () => {
    // Custom instance: CLAUDE_CONFIG_DIR points at the home itself.
    expect(claudeProjectsRoot("/Users/enzo/.claude-compte-c", "/Users/enzo")).toBe(
      "/Users/enzo/.claude-compte-c/projects",
    );
    // Default instance: empty homePath resolves to the OS home directory,
    // where the CLI keeps transcripts under ~/.claude/projects.
    expect(claudeProjectsRoot("/Users/enzo", "/Users/enzo")).toBe("/Users/enzo/.claude/projects");
  });

  it("munges the cwd exactly like the CLI's project folders", () => {
    expect(mungeClaudeProjectDirName("/Users/enzo/Documents/Palenza")).toBe(
      "-Users-enzo-Documents-Palenza",
    );
    expect(mungeClaudeProjectDirName("/Users/enzo/Documents/Palenza/.claude/worktrees/x-1")).toBe(
      "-Users-enzo-Documents-Palenza--claude-worktrees-x-1",
    );
  });
});

itEffect.layer(NodeServices.layer)("copyClaudeTranscriptToInstance", (it) => {
  const SESSION_ID = "f0ffd961-792e-4a72-89fd-7fde32f5addd";
  const CWD = "/tmp/copy-test-project";

  // Two custom instance homes inside a scratch dir — never the OS home, so
  // transcripts live under `<home>/projects` on both sides.
  const setup = Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const scratch = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "t3code-transcript-copy-",
    });
    const projectDir = mungeClaudeProjectDirName(CWD);
    const fromHome = path.join(scratch, "homeA");
    const toHome = path.join(scratch, "homeB");
    const sourceFile = path.join(fromHome, "projects", projectDir, `${SESSION_ID}.jsonl`);
    const targetFile = path.join(toHome, "projects", projectDir, `${SESSION_ID}.jsonl`);
    yield* fileSystem.makeDirectory(path.dirname(sourceFile), { recursive: true });
    yield* fileSystem.makeDirectory(path.dirname(targetFile), { recursive: true });
    return { fileSystem, fromHome, toHome, sourceFile, targetFile };
  });

  const copy = (input: { readonly fromHome: string; readonly toHome: string }) =>
    copyClaudeTranscriptToInstance({
      fromContinuationKey: `claude:home:${input.fromHome}`,
      toContinuationKey: `claude:home:${input.toHome}`,
      resumeCursor: { resume: SESSION_ID },
      cwd: CWD,
    });

  it.effect("re-copies when the target exists but is STALER than the source", () =>
    // The second hop back: the target still holds the transcript from the
    // FIRST visit, the source kept growing since. Skipping on existence
    // alone would resume a frozen history (trouvaille essaim 29/07).
    Effect.gen(function* () {
      const { fileSystem, fromHome, toHome, sourceFile, targetFile } = yield* setup;
      yield* fileSystem.writeFileString(targetFile, "old history\n");
      yield* fileSystem.utimes(targetFile, 1000, 1000);
      yield* fileSystem.writeFileString(sourceFile, "old history\nplus the new turns\n");
      yield* fileSystem.utimes(sourceFile, 2000, 2000);

      const copied = yield* copy({ fromHome, toHome });

      assert.isTrue(copied);
      assert.strictEqual(
        yield* fileSystem.readFileString(targetFile),
        "old history\nplus the new turns\n",
      );
    }),
  );

  it.effect("leaves a target newer than the source untouched", () =>
    Effect.gen(function* () {
      const { fileSystem, fromHome, toHome, sourceFile, targetFile } = yield* setup;
      yield* fileSystem.writeFileString(sourceFile, "what the source knew\n");
      yield* fileSystem.utimes(sourceFile, 1000, 1000);
      yield* fileSystem.writeFileString(targetFile, "already ahead\n");
      yield* fileSystem.utimes(targetFile, 2000, 2000);

      const copied = yield* copy({ fromHome, toHome });

      assert.isTrue(copied);
      assert.strictEqual(yield* fileSystem.readFileString(targetFile), "already ahead\n");
    }),
  );

  it.effect("still reports success when only the target holds the transcript", () =>
    Effect.gen(function* () {
      const { fileSystem, fromHome, toHome, targetFile } = yield* setup;
      yield* fileSystem.writeFileString(targetFile, "the only copy\n");

      const copied = yield* copy({ fromHome, toHome });

      assert.isTrue(copied);
      assert.strictEqual(yield* fileSystem.readFileString(targetFile), "the only copy\n");
    }),
  );

  it.effect("refuses when neither side has the transcript", () =>
    Effect.gen(function* () {
      const { fromHome, toHome } = yield* setup;
      const copied = yield* copy({ fromHome, toHome });
      assert.isFalse(copied);
    }),
  );
});
