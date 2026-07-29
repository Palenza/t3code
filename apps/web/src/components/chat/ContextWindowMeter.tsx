import { useCallback, useRef } from "react";

import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { usePrimaryEnvironment } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ProviderRateLimitGauges } from "../settings/ProviderRateLimitGauges";
import { presentProviderRateLimits } from "../settings/providerRateLimits";

/** At most one hover-triggered refresh per meter per window. */
const HOVER_REFRESH_THROTTLE_MS = 15_000;

/**
 * Opening the popover IS the "someone is looking" moment: fire a targeted
 * provider refresh so the plan-usage figures are seconds old, never minutes
 * (« je ne veux plus jamais voir updated il y a vingt minutes », 29/07). The
 * server piggybacks an account-usage fetch on the probe and streams fresh
 * snapshots back; failures degrade to the stored figures.
 */
function useRefreshRateLimitsOnOpen(instanceId: ProviderInstanceId | null | undefined) {
  const primaryEnvironment = usePrimaryEnvironment();
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const lastRefreshAtRef = useRef(0);
  return useCallback(
    (open: boolean) => {
      if (!open || !instanceId || !primaryEnvironment) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < HOVER_REFRESH_THROTTLE_MS) return;
      lastRefreshAtRef.current = now;
      void refreshProviders({
        environmentId: primaryEnvironment.environmentId,
        input: { instanceId },
      });
    },
    [instanceId, primaryEnvironment, refreshProviders],
  );
}

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot;
  providerDisplayName?: string | null;
  /** The active account's subscription usage, shown alongside the context window. */
  rateLimits?: ServerProvider["rateLimits"];
  /** The instance those rate limits belong to — refreshed when the popover opens. */
  rateLimitsInstanceId?: ProviderInstanceId | null;
  /**
   * True when the instance's driver DOES report plan limits (Claude, Codex).
   * The section then always renders — with an honest "no reading yet" when
   * the account has not answered (walled, throttled, never probed), instead
   * of silently vanishing (reproche fondateur 29/07 : « ça ne montre
   * toujours pas le contexte global d'utilisation »).
   */
  rateLimitsExpected?: boolean;
}) {
  const { usage, providerDisplayName, rateLimits, rateLimitsInstanceId, rateLimitsExpected } =
    props;
  const handleOpenChange = useRefreshRateLimitsOnOpen(rateLimitsInstanceId);
  const hasRateLimits =
    rateLimits !== undefined && presentProviderRateLimits({ rateLimits, now: Date.now() }) !== null;
  const showRateLimitsSection =
    hasRateLimits || (rateLimitsExpected === true && rateLimitsInstanceId != null);
  const usedPercentage = formatPercentage(usage.usedPercentage);
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalizedPercentage / 100) * circumference;
  const totalProcessedTokens = usage.totalProcessedTokens ?? null;
  const showTotalProcessed = totalProcessedTokens !== null && totalProcessedTokens > 0;
  const isOverloaded = normalizedPercentage > 90;
  const usageColor = isOverloaded
    ? "var(--color-red-500)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            aria-label={
              usage.maxTokens !== null && usedPercentage
                ? `Context window ${usedPercentage} used`
                : `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used`
            }
          >
            <span className="relative flex size-5 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted-foreground) 24%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke={usageColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
            </span>
          </button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        className="dropdown-glass w-64 max-w-none border-0! bg-secondary! p-0 shadow-none! before:hidden"
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Context Window</div>
            {usage.maxTokens !== null && usedPercentage ? (
              <div className="text-[11px] tabular-nums text-muted-foreground/70">
                <span>{usedPercentage}</span>
                <span className="mx-1">·</span>
                <span>
                  {formatContextWindowTokens(usage.usedTokens)}/
                  {formatContextWindowTokens(usage.maxTokens ?? null)}
                </span>
              </div>
            ) : (
              <div className="text-[11px] tabular-nums text-muted-foreground/70">
                {formatContextWindowTokens(usage.usedTokens)}
              </div>
            )}
          </div>
          {usage.maxTokens !== null ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(normalizedPercentage)}
              aria-label="Context window usage"
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${normalizedPercentage}%`, backgroundColor: usageColor }}
              />
            </div>
          ) : null}
          {showTotalProcessed ? (
            <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
              <span className="text-muted-foreground/60">Total processed</span>
              <span className="font-medium tabular-nums text-muted-foreground/80">
                {formatContextWindowTokens(totalProcessedTokens)}
              </span>
            </div>
          ) : null}
          {usage.compactsAutomatically ? (
            <div className="mt-1 text-pretty text-[11px] font-medium text-muted-foreground/70">
              {providerDisplayName ?? "It"} automatically compacts its context when needed.
            </div>
          ) : null}
          {showRateLimitsSection ? (
            <div className="mt-1 border-t border-border/60 pt-2">
              <div className="font-medium text-muted-foreground text-xs">Plan usage limits</div>
              {hasRateLimits ? (
                <ProviderRateLimitGauges rateLimits={rateLimits} />
              ) : (
                <p className="pt-1 text-pretty text-[11px] leading-4 text-muted-foreground/60">
                  No reading yet — the account has not reported its limits. Hovering here retries.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
