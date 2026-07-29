import { describe, expect, it } from "vite-plus/test";

import {
  claudeHomeFromContinuationKey,
  claudeProjectsRoot,
  claudeSessionIdFromResumeCursor,
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
    expect(claudeProjectsRoot("/Users/enzo", "/Users/enzo")).toBe(
      "/Users/enzo/.claude/projects",
    );
  });

  it("munges the cwd exactly like the CLI's project folders", () => {
    expect(mungeClaudeProjectDirName("/Users/enzo/Documents/Palenza")).toBe(
      "-Users-enzo-Documents-Palenza",
    );
    expect(
      mungeClaudeProjectDirName("/Users/enzo/Documents/Palenza/.claude/worktrees/x-1"),
    ).toBe("-Users-enzo-Documents-Palenza--claude-worktrees-x-1");
  });
});
