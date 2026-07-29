import { useEffect } from "react";

import { useTheme } from "../../hooks/useTheme";
import { activeSpaceTheme, useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  resolveSidebarTheme,
  SIDEBAR_THEME_GRAIN_URL,
  sidebarThemeBackground,
  sidebarThemeGrainOpacity,
  sidebarThemeInk,
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
  const washInk = theme === null ? null : sidebarThemeInk(theme, resolvedTheme);

  // La règle d'Arc, MESURÉE sur la vidéo fondateur (5 bascules observées) :
  // l'encre suit la LUMINANCE RÉELLE du voile, pas un mode. Voile sombre ou
  // saturé foncé → texte blanc ; voile clair ou pastel → texte sombre. Les
  // tokens vivent sur l'élément sidebar (ancêtre des textes).
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>("[data-app-sidebar]");
    if (sidebar === null || washInk === null) return;
    // L'attribut arme la règle CSS qui rend leur opacité PLEINE aux
    // libellés semi-transparents (index.css) ; les tokens donnent l'encre.
    sidebar.dataset["washInk"] = washInk;
    if (washInk === "dark-ink") {
      sidebar.style.setProperty("--sidebar-foreground", "oklch(0.20 0.02 262)");
      sidebar.style.setProperty("--sidebar-muted-foreground", "oklch(0.32 0.02 262)");
      sidebar.style.setProperty("--sidebar-border", "oklch(0.20 0.02 262 / 18%)");
      sidebar.style.setProperty("--foreground", "oklch(0.20 0.02 262)");
      sidebar.style.setProperty("--muted-foreground", "oklch(0.32 0.02 262)");
    } else {
      sidebar.style.setProperty("--sidebar-foreground", "oklch(0.99 0.002 262)");
      sidebar.style.setProperty("--sidebar-muted-foreground", "oklch(0.93 0.004 262)");
      sidebar.style.setProperty("--sidebar-border", "oklch(0.99 0.002 262 / 22%)");
      sidebar.style.setProperty("--foreground", "oklch(0.99 0.002 262)");
      sidebar.style.setProperty("--muted-foreground", "oklch(0.93 0.004 262)");
    }
    return () => {
      delete sidebar.dataset["washInk"];
      for (const token of [
        "--sidebar-foreground",
        "--sidebar-muted-foreground",
        "--sidebar-border",
        "--foreground",
        "--muted-foreground",
      ]) {
        sidebar.style.removeProperty(token);
      }
    };
  }, [washInk]);

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
