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
/**
 * L'IDENTITÉ DE L'APP — une seule source, et c'est ici.
 *
 * Décision fondateur du 02/08/2026, qui REMPLACE celle du 29/07. L'ancienne
 * disait que la marque affichée restait celle de l'amont et que « Raptor »
 * n'était que le nom du canal local. La nouvelle, mot pour mot : « je veux me
 * détacher absolument des mentions de l'amont. Moi c'est Raptor. » Raptor
 * n'est plus un fork qui s'annonce sous le nom d'un autre, c'est son propre
 * outil.
 *
 * Le nom de STADE ne sert plus qu'à distinguer les builds : « Dev » en
 * développement, « Nightly » sur le canal de nuit, et RIEN sur une version
 * publiée — le nom nu, comme toute app finie. C'est `formatAppDisplayName` qui
 * applique cette règle, des deux côtés (web et bureau).
 *
 * Ce que ce renommage NE touche pas, volontairement : les dossiers de données
 * (`userData` reste épinglé sur `t3code`, le serveur sur `~/.t3`) et les noms
 * de paquets npm `@t3tools/*`. Les déplacer demande une migration ; les
 * confondre avec un changement de marque, c'est perdre les fils d'Enzo pour un
 * mot. Ils seront traités à part, avec leur migration.
 */
export const APP_BASE_NAME = "Raptor";
export const APP_STAGE_LABEL =
  injectedDesktopAppBranding?.stageLabel ??
  HOSTED_APP_CHANNEL_LABEL ??
  (import.meta.env.DEV ? "Dev" : "");
export const APP_DISPLAY_NAME = formatAppDisplayName({
  baseName: APP_BASE_NAME,
  stageLabel: APP_STAGE_LABEL,
});
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
/**
 * Le numéro du BUILD qu'on exécute — celui du DMG, pas celui de l'app web.
 *
 * `APP_VERSION` sert à la détection d'écart client/serveur (`versionSkew`) et
 * vaut la version de `apps/web`. En construction locale, seul `apps/desktop`
 * est bumpé : la barre affichait donc 0.0.31 pendant que le DMG posé était en
 * 0.0.73 (constaté sur une capture d'Enzo le 02/08). Un numéro faux, et
 * crédible — exactement ce que cet affichage devait empêcher.
 *
 * Celui-ci est le numéro à MONTRER. Il retombe sur `APP_VERSION` quand le
 * build ne le fournit pas, donc rien ne régresse là où les deux coïncident.
 */
export const APP_BUILD_VERSION = import.meta.env.APP_BUILD_VERSION || APP_VERSION;
