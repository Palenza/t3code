import { useTheme } from "../../hooks/useTheme";
import { activeSpaceTheme, useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  resolveSidebarTheme,
  SIDEBAR_THEME_GRAIN_URL,
  sidebarThemeBackground,
  sidebarThemeGrainOpacity,
  useSidebarThemeStore,
} from "../../sidebarThemeStore";

/**
 * The Arc-style colour wash behind the whole sidebar: one radial per
 * positioned colour dot, a grain veil above, both inert
 * (`pointer-events-none`, `-z-10` inside the sidebar's own stacking context)
 * so rows, header art and hover states paint exactly as before. Follows the
 * sidebar's ACTIVE PROJECT like Arc's Spaces — switching projects switches
 * colours. Renders nothing when no theme applies — the default look stays
 * byte-for-byte the upstream one.
 */
export function SidebarThemeWash() {
  // Résolution : thème de l'ESPACE actif > thème du projet > thème défaut.
  const spaceTheme = useSidebarSpacesStore(activeSpaceTheme);
  const fallbackTheme = useSidebarThemeStore((state) =>
    resolveSidebarTheme(state, state.activeProjectKey),
  );
  const theme = spaceTheme ?? fallbackTheme;
  const { resolvedTheme } = useTheme();
  if (theme === null) {
    return null;
  }
  const background = sidebarThemeBackground(theme, resolvedTheme);
  if (background === null) {
    return null;
  }
  const grainOpacity = sidebarThemeGrainOpacity(theme);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div
        className="absolute inset-0 transition-[background] duration-700 ease-out motion-reduce:transition-none"
        style={{ background }}
      />
      {grainOpacity > 0 ? (
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{ backgroundImage: `url("${SIDEBAR_THEME_GRAIN_URL}")`, opacity: grainOpacity }}
        />
      ) : null}
    </div>
  );
}
