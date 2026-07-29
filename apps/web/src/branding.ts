import type { DesktopAppBranding } from "@t3tools/contracts";
import { formatAppDisplayName } from "./branding.logic";

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding?.() ?? null;
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();
const hostedAppChannel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();

export const HOSTED_APP_CHANNEL =
  hostedAppChannel === "latest" || hostedAppChannel === "nightly" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL =
  HOSTED_APP_CHANNEL === "nightly" ? "Nightly" : HOSTED_APP_CHANNEL === "latest" ? "Latest" : null;
// Fork identity (décision fondateur 29/07, révisée le soir même) : la marque
// AFFICHÉE est T3 Code — le fork garde le nom amont — et son canal local
// s'appelle RAPTOR (plus jamais « Alpha »).
export const APP_BASE_NAME = "T3 Code";
export const APP_STAGE_LABEL =
  injectedDesktopAppBranding?.stageLabel ??
  HOSTED_APP_CHANNEL_LABEL ??
  (import.meta.env.DEV ? "Dev" : "Raptor");
export const APP_DISPLAY_NAME = formatAppDisplayName({
  baseName: APP_BASE_NAME,
  stageLabel: APP_STAGE_LABEL,
});
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
