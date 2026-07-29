import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Arc-style sidebar theme (décision fondateur 29/07) : l'utilisateur choisit
 * 1 à 3 couleurs, une intensité et un grain ; la sidebar reçoit un voile de
 * dégradé doux dérivé de ces couleurs, fondu vers le fond CLAIR ou SOMBRE de
 * l'app (même idée que les Spaces d'Arc : couleurs libres, lisibilité
 * préservée parce que le mélange tire toujours vers le fond du mode courant).
 *
 * Le mélange se fait en oklab via `color-mix` — perceptuellement lisse, pas
 * de gris boueux au milieu des dégradés comme en sRGB.
 */

export interface SidebarTheme {
  /** 1 à 3 couleurs hex (#rrggbb). Ordre = haut → bas du dégradé. */
  readonly colors: ReadonlyArray<string>;
  /** 0..1 — part de la couleur gardée dans le mélange avec le fond. */
  readonly intensity: number;
  /** 0..1 — opacité du voile de grain. */
  readonly grain: number;
}

/** Pastels façon palette Arc — point de départ, pas une limite. */
export const SIDEBAR_THEME_PRESETS: ReadonlyArray<string> = [
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

interface SidebarThemeState {
  theme: SidebarTheme | null;
  setTheme: (theme: SidebarTheme) => void;
  clearTheme: () => void;
}

export const useSidebarThemeStore = create<SidebarThemeState>()(
  persist(
    (set) => ({
      theme: null,
      setTheme: (theme) => set({ theme }),
      clearTheme: () => set({ theme: null }),
    }),
    { name: "t3code:sidebar-theme:v1" },
  ),
);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Fonds vers lesquels les couleurs sont fondues, par mode d'apparence. */
const BLEND_BASE = { dark: "#0e1116", light: "#f7f9fc" } as const;

/**
 * La valeur CSS `background` du voile, ou null quand il n'y a rien d'honnête
 * à peindre (aucune couleur valide). Trois radiales décalées + une linéaire
 * de fond : l'approximation plate d'un mesh gradient à la Arc.
 */
export function sidebarThemeBackground(
  theme: SidebarTheme,
  appearance: "light" | "dark",
): string | null {
  const colors = theme.colors.filter((color) => HEX_COLOR.test(color));
  if (colors.length === 0) {
    return null;
  }
  const base = BLEND_BASE[appearance];
  // 22 % à 68 % de couleur gardée : sous 22 % on ne voit rien, au-delà de
  // 68 % le texte du mode sombre commence à se battre avec le fond.
  const kept = Math.round(22 + clamp01(theme.intensity) * 46);
  const mix = (color: string) => `color-mix(in oklab, ${color} ${kept}%, ${base})`;
  const c0 = colors[0];
  if (c0 === undefined) {
    return null;
  }
  const c1 = colors[1] ?? c0;
  const c2 = colors[2] ?? c1;
  return [
    `radial-gradient(140% 110% at 12% 6%, ${mix(c0)} 0%, transparent 62%)`,
    `radial-gradient(150% 120% at 88% 30%, ${mix(c1)} 0%, transparent 64%)`,
    `radial-gradient(160% 130% at 50% 104%, ${mix(c2)} 0%, transparent 60%)`,
    `linear-gradient(180deg, ${mix(c0)} 0%, ${mix(c2)} 100%)`,
  ].join(", ");
}

export function sidebarThemeGrainOpacity(theme: SidebarTheme): number {
  // Plafonné bas : le grain est une texture, pas un brouillard.
  return Math.round(clamp01(theme.grain) * 35) / 100;
}

/** Bruit fractal SVG en data-URI — aucune ressource externe, aucun asset. */
export const SIDEBAR_THEME_GRAIN_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>";
