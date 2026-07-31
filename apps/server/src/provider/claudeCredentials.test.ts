import { describe, expect, it } from "vite-plus/test";

import { keychainServiceForConfigDir } from "./claudeCredentials.ts";

describe("keychainServiceForConfigDir", () => {
  it("derives the hashed per-directory service name the CLI actually creates", () => {
    // Real vector, read from a real keychain (28/07/2026): logging in with
    // CLAUDE_CONFIG_DIR=/Users/enzo/.claude-compte-b created the item
    // "Claude Code-credentials-e4acc0cc". If the CLI ever changes its scheme,
    // this test failing is the alarm — usage attribution silently breaking
    // is exactly the failure mode this module exists to prevent.
    expect(keychainServiceForConfigDir("/Users/enzo/.claude-compte-b")).toBe(
      "Claude Code-credentials-e4acc0cc",
    );
    expect(keychainServiceForConfigDir("/Users/enzo/.claude-compte-c")).toBe(
      "Claude Code-credentials-fa6906ac",
    );
  });

  it("binds one directory to one item — two directories never share a service", () => {
    expect(keychainServiceForConfigDir("/Users/enzo/.claude-compte-a")).not.toBe(
      keychainServiceForConfigDir("/Users/enzo/.claude-compte-b"),
    );
  });
});
