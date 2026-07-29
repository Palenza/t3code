import { useEffect } from "react";

import { useTheme } from "../../hooks/useTheme";
import { activeSpaceTheme, useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  resolveSidebarTheme,
  resolveSidebarThemeAppearance,
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
  const washAppearance = theme === null ? null : resolveSidebarThemeAppearance(theme, resolvedTheme);

  // La règle d'Arc que le fondateur a exigée (« pas de mode clair qui rend
  // les textes illisibles ») : le TEXTE suit le VOILE, jamais le thème
  // global de l'app. Un voile clair (☀️) impose l'encre sombre même quand
  // l'app est en sombre — et inversement. Les tokens vivent sur l'élément
  // sidebar (ancêtre des textes), posés/retirés ici.
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>("[data-app-sidebar]");
    if (sidebar === null || washAppearance === null) return;
    if (washAppearance === "light") {
      sidebar.style.setProperty("--sidebar-foreground", "oklch(0.29 0.03 262)");
      sidebar.style.setProperty("--sidebar-muted-foreground", "oklch(0.47 0.03 262)");
      sidebar.style.setProperty("--sidebar-border", "oklch(0.29 0.03 262 / 14%)");
    } else {
      sidebar.style.setProperty("--sidebar-foreground", "oklch(0.972 0.004 262)");
      sidebar.style.setProperty("--sidebar-muted-foreground", "oklch(0.78 0.01 262)");
      sidebar.style.setProperty("--sidebar-border", "oklch(0.972 0.004 262 / 14%)");
    }
    return () => {
      sidebar.style.removeProperty("--sidebar-foreground");
      sidebar.style.removeProperty("--sidebar-muted-foreground");
      sidebar.style.removeProperty("--sidebar-border");
    };
  }, [washAppearance]);

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
