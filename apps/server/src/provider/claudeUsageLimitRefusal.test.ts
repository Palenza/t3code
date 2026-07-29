import { describe, expect, it } from "vite-plus/test";

import {
  detectClaudeUsageLimitRefusal,
  synthesizedUsageLimitRateLimitPayload,
} from "./claudeUsageLimitRefusal.ts";

describe("claudeUsageLimitRefusal", () => {
  it("detects the live session-limit refusal wording", () => {
    // Verbatim from a walled account, 29/07/2026.
    expect(
      detectClaudeUsageLimitRefusal("You've hit your session limit · resets 12:50pm (Asia/Makassar)"),
    ).toEqual({ windowKind: "five_hour" });
    expect(detectClaudeUsageLimitRefusal("You've hit your usage limit.")).toEqual({
      windowKind: "five_hour",
    });
    expect(detectClaudeUsageLimitRefusal("Session limit reached ∙ resets 3pm")).toEqual({
      windowKind: "five_hour",
    });
  });

  it("maps weekly wordings to the seven-day window", () => {
    expect(
      detectClaudeUsageLimitRefusal("You've hit your weekly limit · resets Tue 10am"),
    ).toEqual({ windowKind: "seven_day" });
    expect(detectClaudeUsageLimitRefusal("Weekly limit reached · resets Aug 4")).toEqual({
      windowKind: "seven_day",
    });
  });

  it("never trips on prose that merely discusses limits", () => {
    expect(
      detectClaudeUsageLimitRefusal(
        "The banner shows « You've hit your session limit » when the CLI declines a turn; " +
          "we synthesize a rejected rate-limit event so the relay can react. This sentence " +
          "is analysis, not a refusal, and must therefore never be detected as one at all.",
      ),
    ).toBeNull();
    expect(detectClaudeUsageLimitRefusal("")).toBeNull();
    expect(detectClaudeUsageLimitRefusal("All done — no limits were involved.")).toBeNull();
  });

  it("never trips on SHORT sentences that quote or explain the refusal (essaim 29/07)", () => {
    expect(
      detectClaudeUsageLimitRefusal(
        'Done — the banner now shows "You\'ve hit your session limit".',
      ),
    ).toBeNull();
    expect(
      detectClaudeUsageLimitRefusal('Let me check where "Session limit reached" is parsed.'),
    ).toBeNull();
    expect(
      detectClaudeUsageLimitRefusal("Because you've hit your session limit on that account."),
    ).toBeNull();
    expect(detectClaudeUsageLimitRefusal("Session limit reached hier, c'est reparti")).toEqual({
      // Anchored start + no quotes: indistinguishable from a real refusal —
      // accepted knowingly, the reset-expiry rule limits the blast radius.
      windowKind: "five_hour",
    });
  });

  it("synthesizes the exact payload shape the normalizer reads", () => {
    expect(synthesizedUsageLimitRateLimitPayload({ windowKind: "five_hour" })).toEqual({
      rateLimits: {
        rate_limit_info: { status: "rejected", rateLimitType: "five_hour" },
        synthesizedFromRefusalText: true,
      },
    });
  });
});
