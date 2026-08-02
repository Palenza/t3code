const NIGHTLY_SERVER_VERSION_PATTERN = /-nightly\.\d{8}\.\d+$/;

/**
 * Le nom affiché : le nom nu, et le stade entre parenthèses seulement quand il
 * distingue vraiment quelque chose.
 *
 * Un stade VIDE rend désormais le nom nu, au même titre que « latest ». C'est
 * la règle qui accompagne la décision du 02/08 (voir `branding.ts`) : une
 * version publiée s'appelle « Raptor », pas « Raptor () ». Sans ce cas, le
 * stade vide produisait une parenthèse orpheline — le genre de détail qui ne
 * casse aucun test et se voit dans la barre de titre.
 */
export function formatAppDisplayName(input: {
  readonly baseName: string;
  readonly stageLabel: string;
}): string {
  const stage = input.stageLabel.trim();
  if (stage.length === 0 || stage.toLowerCase() === "latest") {
    return input.baseName;
  }

  return `${input.baseName} (${stage})`;
}

/**
 * Whether the sidebar v2 beta is on by default for a build stage.
 *
 * Nightly and local dev opt in; Alpha and Latest stay on v1. This is resolved
 * from the client's own stage label rather than the connected server's version:
 * v2 only exists in the client, so a stable client on a nightly server has
 * nothing to turn on.
 */
export function resolveSidebarV2Default(stageLabel: string): boolean {
  const stage = stageLabel.trim().toLowerCase();
  return stage === "nightly" || stage === "dev";
}

/**
 * Resolved sidebar v2 state: an explicit choice if the user has made one,
 * otherwise the default for this build stage.
 *
 * A stored `enabled: true` counts as an explicit choice even without the
 * companion flag. `true` was never the schema default, so it can only have come
 * from the Settings → Beta toggle — settings written before that flag existed
 * would otherwise lose the opt-in and drop such users back to v1 on production.
 * Mirrors how `normalizeDesktopSettingsDocument` treats a legacy stored
 * `updateChannel: "nightly"` as user-configured.
 *
 * `settingsHydrated` guards the startup window: client settings load
 * asynchronously and the pre-hydration snapshot is just the schema defaults, so
 * resolving against it would mount one sidebar and swap it out a tick later,
 * remounting the tree. While hydrating, hold v1 — where both paths already
 * start.
 */
export function resolveSidebarV2Enabled(input: {
  readonly enabled: boolean;
  readonly configuredByUser: boolean;
  readonly settingsHydrated: boolean;
  readonly stageLabel: string;
}): boolean {
  if (!input.settingsHydrated) {
    return false;
  }

  return input.configuredByUser || input.enabled
    ? input.enabled
    : resolveSidebarV2Default(input.stageLabel);
}

export function resolveServerBackedAppStageLabel(input: {
  readonly primaryServerVersion: string | null | undefined;
  readonly fallbackStageLabel: string;
}): string {
  return input.primaryServerVersion &&
    NIGHTLY_SERVER_VERSION_PATTERN.test(input.primaryServerVersion)
    ? "Nightly"
    : input.fallbackStageLabel;
}

export function resolveServerBackedAppDisplayName(input: {
  readonly baseName: string;
  readonly fallbackDisplayName: string;
  readonly fallbackStageLabel: string;
  readonly primaryServerVersion: string | null | undefined;
}): string {
  const stageLabel = resolveServerBackedAppStageLabel({
    primaryServerVersion: input.primaryServerVersion,
    fallbackStageLabel: input.fallbackStageLabel,
  });

  return stageLabel === input.fallbackStageLabel
    ? input.fallbackDisplayName
    : formatAppDisplayName({ baseName: input.baseName, stageLabel });
}
