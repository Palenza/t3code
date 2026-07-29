import type { ServerProvider } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderRateLimitGauges } from "./ProviderRateLimitGauges";

const NOW = Date.parse("2026-07-27T15:00:00.000Z");

const rateLimits = (
  windows: ReadonlyArray<{
    readonly kind: string;
    /** Optional, like the contract: Claude sends windows with no figure. */
    readonly utilization?: number;
    readonly severity?: "allowed" | "allowed_warning" | "rejected";
    readonly resetsAtEpoch?: number;
  }>,
): ServerProvider["rateLimits"] => ({ observedAt: "2026-07-27T14:55:00.000Z", windows }) as never;

describe("ProviderRateLimitGauges", () => {
  it("renders nothing when the provider has never reported", () => {
    // The account card must look exactly as it did before this feature until
    // there is a real reading to show.
    expect(renderToStaticMarkup(<ProviderRateLimitGauges rateLimits={undefined} now={NOW} />)).toBe(
      "",
    );
  });

  it("draws the bar at the reported share, and dates the reading", () => {
    const markup = renderToStaticMarkup(
      <ProviderRateLimitGauges
        rateLimits={rateLimits([
          { kind: "five_hour", utilization: 82, resetsAtEpoch: NOW / 1000 + 7200 },
        ])}
        now={NOW}
      />,
    );

    expect(markup).toContain("5-hour limit");
    expect(markup).toContain("82%");
    expect(markup).toContain("width:82%");
    expect(markup).toContain("resets in about 2 h");
    expect(markup).toContain("measured 5 min ago");
    expect(markup).toContain('aria-valuenow="82"');
  });

  it("renders a bar-less row when the provider sends no percentage", () => {
    // The shape a live Claude turn actually produces (28/07/2026). No bar to
    // draw, but "resets in about 2 h" is real and worth the row.
    const markup = renderToStaticMarkup(
      <ProviderRateLimitGauges
        rateLimits={rateLimits([
          { kind: "five_hour", severity: "allowed", resetsAtEpoch: NOW / 1000 + 7200 },
        ])}
        now={NOW}
      />,
    );

    expect(markup).toContain("5-hour limit");
    expect(markup).toContain("resets in about 2 h");
    expect(markup).not.toContain("progressbar");
    expect(markup).not.toContain("%<");
  });

  it("keeps the bar inside its track when the account is over", () => {
    const markup = renderToStaticMarkup(
      <ProviderRateLimitGauges
        // `now` explicite : sans lui le test compare une mesure figée au
        // 27/07 à l'heure RÉELLE, et casse 24 h après avoir été écrit.
        now={NOW}
        rateLimits={rateLimits([{ kind: "five_hour", utilization: 103 }])}
      />,
    );

    // The figure still tells the truth; only the bar is clamped.
    expect(markup).toContain("103%");
    expect(markup).toContain("width:100%");
  });

  it("shows every window a provider reports", () => {
    const markup = renderToStaticMarkup(
      <ProviderRateLimitGauges
        rateLimits={rateLimits([
          { kind: "five_hour", utilization: 12 },
          { kind: "seven_day", utilization: 64 },
        ])}
        now={NOW}
      />,
    );

    expect(markup).toContain("5-hour limit");
    expect(markup).toContain("Weekly limit");
  });
});
