import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Thème de sidebar façon Arc, v2 (retour fondateur 29/07 après analyse vidéo
 * de l'éditeur d'Arc) : les couleurs sont des PASTILLES POSITIONNABLES sur
 * une toile — leur position pilote un dégradé multi-points rendu en direct
 * sur la sidebar — plus une intensité, un grain, un angle de fond et un mode
 * d'apparence. Comme les Spaces d'Arc, chaque PROJET peut porter son propre
 * thème ; naviguer d'un projet à l'autre change les couleurs.
 *
 * Le mélange se fait en oklab via `color-mix` — perceptuellement lisse, pas
 * de gris boueux au milieu des dégradés comme en sRGB.
 */

export interface SidebarThemeStop {
  /** Couleur hex #rrggbb. */
  readonly color: string;
  /** 0..1 — position horizontale de la pastille sur la toile. */
  readonly x: number;
  /** 0..1 — position verticale. */
  readonly y: number;
}

export interface SidebarTheme {
  /** 1 à 6 pastilles. */
  readonly stops: ReadonlyArray<SidebarThemeStop>;
  /** 0..1 — part de la couleur gardée dans le mélange avec le fond. */
  readonly intensity: number;
  /** 0..1 — opacité du voile de grain. */
  readonly grain: number;
  /** Degrés 0..360 — angle du dégradé linéaire de fond (la molette d'Arc). */
  readonly angle: number;
  /** ✨ auto (suit l'app), ☀️ clair forcé, 🌙 sombre forcé. */
  readonly appearance: "auto" | "light" | "dark";
}

export const MAX_SIDEBAR_THEME_STOPS = 6;

// Declared BEFORE the store: `migrate` runs during the synchronous hydration
// that `create()` itself triggers, and a `const` below it is still in its
// temporal dead zone at that instant — the v1 migration would throw and the
// stored theme would be lost on the next write (trouvaille essaim 29/07).
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Pastels façon palette Arc — point de départ, pas une limite. */
export const SIDEBAR_THEME_PRESETS: ReadonlyArray<string> = [
  "#f4eef0",
  "#e8b4c8",
  "#ef6292",
  "#9c5fd4",
  "#e5484d",
  "#f2994a",
  "#f5c542",
  "#4caf7d",
  "#5db3f0",
  "#3d5aa9",
];

/** Positions par défaut, en diagonale douce — l'ordre suit l'ajout. */
export const DEFAULT_STOP_POSITIONS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 0.28, y: 0.22 },
  { x: 0.74, y: 0.62 },
  { x: 0.4, y: 0.86 },
  { x: 0.82, y: 0.14 },
  { x: 0.16, y: 0.56 },
  { x: 0.6, y: 0.38 },
];

export function makeSidebarThemeFromColors(colors: ReadonlyArray<string>): SidebarTheme {
  return {
    stops: colors.slice(0, MAX_SIDEBAR_THEME_STOPS).map((color, index) => ({
      color,
      x: DEFAULT_STOP_POSITIONS[index]?.x ?? 0.5,
      y: DEFAULT_STOP_POSITIONS[index]?.y ?? 0.5,
    })),
    intensity: 0.5,
    grain: 0.25,
    angle: 165,
    appearance: "auto",
  };
}

interface SidebarThemeState {
  /** Thème par défaut (tous les projets sans thème propre). */
  theme: SidebarTheme | null;
  /** Thèmes par projet — l'équivalent des Spaces d'Arc. */
  themesByProject: Record<string, SidebarTheme>;
  /**
   * Projet actuellement affiché par la sidebar (son filtre de scope).
   * Runtime pur, jamais persisté : la sidebar le pousse, le voile le lit.
   */
  activeProjectKey: string | null;
  setTheme: (theme: SidebarTheme) => void;
  clearTheme: () => void;
  setProjectTheme: (projectId: string, theme: SidebarTheme) => void;
  clearProjectTheme: (projectId: string) => void;
  setActiveProjectKey: (projectKey: string | null) => void;
}

interface PersistedV1 {
  theme?: {
    colors?: ReadonlyArray<string>;
    intensity?: number;
    grain?: number;
  } | null;
}

export const useSidebarThemeStore = create<SidebarThemeState>()(
  persist(
    (set) => ({
      theme: null,
      themesByProject: {},
      activeProjectKey: null,
      setTheme: (theme) => set({ theme }),
      clearTheme: () => set({ theme: null }),
      setProjectTheme: (projectId, theme) =>
        set((state) => ({ themesByProject: { ...state.themesByProject, [projectId]: theme } })),
      clearProjectTheme: (projectId) =>
        set((state) => {
          const { [projectId]: _removed, ...rest } = state.themesByProject;
          return { themesByProject: rest };
        }),
      setActiveProjectKey: (projectKey) => set({ activeProjectKey: projectKey }),
    }),
    {
      name: "t3code:sidebar-theme:v1",
      version: 2,
      partialize: (state) => ({
        theme: state.theme,
        themesByProject: state.themesByProject,
      }),
      migrate: (persisted, version) => {
        if (version >= 2) {
          return persisted as SidebarThemeState;
        }
        const legacy = persisted as PersistedV1;
        const colors = legacy.theme?.colors?.filter((color) => HEX_COLOR.test(color)) ?? [];
        return {
          theme:
            colors.length > 0
              ? {
                  ...makeSidebarThemeFromColors(colors),
                  intensity: legacy.theme?.intensity ?? 0.5,
                  grain: legacy.theme?.grain ?? 0.25,
                }
              : null,
          themesByProject: {},
        } as SidebarThemeState;
      },
    },
  ),
);

/** Le thème effectif d'un projet : le sien, sinon le défaut. */
export function resolveSidebarTheme(
  state: Pick<SidebarThemeState, "theme" | "themesByProject">,
  projectId: string | null | undefined,
): SidebarTheme | null {
  if (projectId) {
    const projectTheme = state.themesByProject[projectId];
    if (projectTheme !== undefined) {
      return projectTheme;
    }
  }
  return state.theme;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Fonds vers lesquels les couleurs sont fondues, par mode d'apparence. */
const BLEND_BASE = { dark: "#0e1116", light: "#f7f9fc" } as const;

export function resolveSidebarThemeAppearance(
  theme: SidebarTheme,
  appAppearance: "light" | "dark",
): "light" | "dark" {
  return theme.appearance === "auto" ? appAppearance : theme.appearance;
}

/**
 * La valeur CSS `background` du voile, ou null quand il n'y a rien d'honnête
 * à peindre (aucune pastille valide). Une radiale PAR pastille, à sa
 * position, + une linéaire de fond orientée par l'angle : l'approximation
 * plate du mesh gradient d'Arc.
 */
export function sidebarThemeBackground(
  theme: SidebarTheme,
  appearance: "light" | "dark",
): string | null {
  const stops = theme.stops.filter((stop) => HEX_COLOR.test(stop.color));
  if (stops.length === 0) {
    return null;
  }
  const base = BLEND_BASE[resolveSidebarThemeAppearance(theme, appearance)];
  // 25 % à 90 % de couleur gardée. La borne haute vient de la vidéo d'Arc
  // (29/07) : à fond, leur voile est de la couleur FRANCHE — cyan pétant,
  // magenta plein — pas un pastel. L'intensité est un curseur d'engagement :
  // délavé en bas, assumé en haut.
  const kept = Math.round(25 + clamp01(theme.intensity) * 65);
  const mix = (color: string) => `color-mix(in oklab, ${color} ${kept}%, ${base})`;
  const at = (value: number) => `${Math.round(clamp01(value) * 100)}%`;
  const radials = stops.map(
    (stop) =>
      `radial-gradient(130% 100% at ${at(stop.x)} ${at(stop.y)}, ${mix(stop.color)} 0%, transparent 60%)`,
  );
  const first = stops[0]!;
  const last = stops.at(-1)!;
  const angle = Number.isFinite(theme.angle) ? ((theme.angle % 360) + 360) % 360 : 165;
  return [
    ...radials,
    `linear-gradient(${angle}deg, ${mix(first.color)} 0%, ${mix(last.color)} 100%)`,
  ].join(", ");
}

/**
 * L'encre qui garde le texte NET sur le voile.
 *
 * Mesuré, puis CORRIGÉ (T4 filmé le 29/07 : magenta saturé + encre claire =
 * contraste 1,0, texte littéralement invisible sur 2 777 frames ; Arc, lui,
 * pose une encre SOMBRE sur son doré). La règle n'est pas un seuil de
 * luminance choisi à la main : c'est le CONTRASTE WCAG qui tranche. Le point
 * d'égalité entre encre claire et encre sombre est à luminance ≈ 0,179 —
 * au-dessus, le sombre gagne toujours, ce qui explique qu'Arc soit sombre
 * sur presque toutes les couleurs et clair seulement sur les vraies nuits.
 *
 * On approxime la luminance du voile par la moyenne des pastilles mélangée
 * à la base au dosage du fond (`kept`), puis on retourne l'encre qui donne
 * le meilleur rapport de contraste.
 */
export function sidebarThemeInk(
  theme: SidebarTheme,
  appearance: "light" | "dark",
): "light-ink" | "dark-ink" {
  const stops = theme.stops.filter((stop) => HEX_COLOR.test(stop.color));
  const resolved = resolveSidebarThemeAppearance(theme, appearance);
  if (stops.length === 0) {
    return resolved === "dark" ? "light-ink" : "dark-ink";
  }
  const kept = (25 + clamp01(theme.intensity) * 65) / 100;
  const base = resolved === "dark" ? [14, 17, 22] : [247, 249, 252];
  // Luminance relative WCAG : linéarisation sRGB par canal, pas la moyenne
  // brute — un magenta pur et un vert pur de même moyenne ne pèsent pas du
  // tout pareil pour l'œil.
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const channel = (offset: number) => {
    const average =
      stops.reduce(
        (sum, stop) => sum + Number.parseInt(stop.color.slice(1 + offset, 3 + offset), 16),
        0,
      ) / stops.length;
    return linear(average * kept + base[offset / 2]! * (1 - kept));
  };
  const luma = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // SEUIL MESURÉ CHEZ ARC (797 frames pleine résolution, encre relevée par
  // percentile sur les pixels de texte) : sous L≈0,25 l'encre est claire à
  // 97 %, dès L≈0,40 elle est sombre à 98-100 %. Arc garde donc le clair un
  // peu au-delà du pur optimum de contraste (0,179) — c'est un choix de
  // goût, on le copie plutôt que de « corriger » leur design.
  return luma < 0.4 ? "light-ink" : "dark-ink";
}

export function sidebarThemeGrainOpacity(theme: SidebarTheme): number {
  // Plafonné bas : le grain est une texture, pas un brouillard.
  return Math.round(clamp01(theme.grain) * 35) / 100;
}

/** Bruit fractal SVG en data-URI — aucune ressource externe, aucun asset. */
export const SIDEBAR_THEME_GRAIN_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>";
