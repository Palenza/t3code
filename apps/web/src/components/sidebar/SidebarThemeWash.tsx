import { useTheme } from "../../hooks/useTheme";
import {
  SIDEBAR_THEME_GRAIN_URL,
  sidebarThemeBackground,
  sidebarThemeGrainOpacity,
  useSidebarThemeStore,
} from "../../sidebarThemeStore";

/**
 * The Arc-style colour wash behind the whole sidebar: gradient layers first,
 * a grain veil above them, both inert (`pointer-events-none`, `-z-10` inside
 * the sidebar's own stacking context) so rows, header art and hover states
 * paint exactly as before. Renders nothing when no theme is set — the
 * default look stays byte-for-byte the upstream one.
 */
export function SidebarThemeWash() {
  const theme = useSidebarThemeStore((state) => state.theme);
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
      <div className="absolute inset-0" style={{ background }} />
      {grainOpacity > 0 ? (
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{ backgroundImage: `url("${SIDEBAR_THEME_GRAIN_URL}")`, opacity: grainOpacity }}
        />
      ) : null}
    </div>
  );
}
