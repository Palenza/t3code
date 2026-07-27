import type { ServerProvider } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { presentProviderRateLimits, type RateLimitTone } from "./providerRateLimits";

const TONE_BAR: Record<RateLimitTone, string> = {
  normal: "bg-muted-foreground/60",
  warning: "bg-warning",
  critical: "bg-destructive",
};

const TONE_TEXT: Record<RateLimitTone, string> = {
  normal: "text-muted-foreground/80",
  warning: "text-warning",
  critical: "text-destructive",
};

/**
 * Subscription usage for one account.
 *
 * Renders nothing at all when the provider has never reported — an empty
 * gauge would read as "0% used", and "we have heard nothing" is a different
 * statement from "you have used nothing".
 *
 * Every judgement behind what is shown lives in `providerRateLimits.ts`, under
 * test: which figure is clamped, which is not, and when a reset time is honest
 * enough to display.
 */
export function ProviderRateLimitGauges(props: {
  readonly rateLimits: ServerProvider["rateLimits"];
  /** Injected so the render is a pure function of its inputs in tests. */
  readonly now?: number;
}) {
  const presented = presentProviderRateLimits({
    rateLimits: props.rateLimits,
    now: props.now ?? Date.now(),
  });
  if (presented === null) {
    return null;
  }

  return (
    <div className="mt-2 grid gap-1.5">
      {presented.gauges.map((gauge) => (
        <div key={gauge.kind} className="grid gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px] leading-4">
            <span className="truncate text-muted-foreground/70">{gauge.label}</span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              {gauge.resetLabel ? (
                <span className="text-muted-foreground/50">{gauge.resetLabel}</span>
              ) : null}
              <span className={cn("font-medium tabular-nums", TONE_TEXT[gauge.tone])}>
                {gauge.percentLabel}
              </span>
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(gauge.barPercent)}
            aria-label={`${gauge.label} used`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
                TONE_BAR[gauge.tone],
              )}
              style={{ width: `${gauge.barPercent}%` }}
            />
          </div>
        </div>
      ))}
      {/* The age is not decoration: a stale 12% and a fresh 12% are different
          claims, and the reader has to be able to tell which one this is. */}
      <p className="text-[10px] leading-4 text-muted-foreground/50">{presented.observedLabel}</p>
    </div>
  );
}
