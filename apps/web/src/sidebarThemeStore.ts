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

/**
 * DÉPINGLER L'APPARENCE — la trace du mode nuit, retiré le 31/07.
 *
 * L'ancien panneau avait deux boutons, les étoiles (`auto`) et la lune
 * (`dark`), et cliquer la lune écrivait `appearance: "dark"` DANS le thème
 * enregistré. Le bouton est parti ; les enregistrements, eux, sont restés
 * épinglés. Résultat : le voile de la colonne continuait de se fondre vers
 * une base nocturne même app en clair, sans plus aucun bouton pour le
 * défaire — et le panneau, lui, affichait « auto ». Il mentait.
 *
 * Le panneau corrige déjà ce qu'il ré-écrit, mais ça ne soigne que les
 * thèmes qu'on RETOUCHE. Ici on soigne l'enregistrement lui-même, une fois,
 * à la lecture : plus aucune donnée ne reste dans un état que l'interface
 * ne sait plus produire ni annuler.
 *
 * `resolveSidebarThemeAppearance` garde donc son comportement d'origine —
 * un thème épinglé force sa base. C'est juste qu'il n'en existe plus.
 */
export function desepinglerApparence(theme: SidebarTheme): SidebarTheme {
  return theme.appearance === "auto" ? theme : { ...theme, appearance: "auto" };
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
      version: 3,
      partialize: (state) => ({
        theme: state.theme,
        themesByProject: state.themesByProject,
      }),
      migrate: (persisted, version) => {
        if (version >= 2) {
          // v2 → v3 : on retire l'apparence épinglée par le mode nuit disparu.
          const garde = persisted as SidebarThemeState;
          return {
            ...garde,
            theme: garde.theme === null ? null : desepinglerApparence(garde.theme),
            themesByProject: Object.fromEntries(
              Object.entries(garde.themesByProject ?? {}).map(([cle, valeur]) => [
                cle,
                desepinglerApparence(valeur),
              ]),
            ),
          } satisfies SidebarThemeState;
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
  // La molette ne se VOYAIT pas : le bruit brut d'un `feTurbulence` se serre
  // autour du gris moyen, et `mix-blend-overlay` sur du gris moyen est à peu
  // près l'identité — d'où « ça n'ajoute pas de grain, ça fait autre chose ».
  // Le bruit est maintenant étalé en contraste (voir l'URL plus bas) et la
  // course monte jusqu'à 42 % : au maximum on voit une TEXTURE, jamais un
  // brouillard. La courbe est en puissance 0,75 parce qu'un voile se perçoit
  // en gros comme la racine de son opacité : en linéaire, les six premiers
  // crans de la molette étaient indistinguables de zéro.
  return Math.round(clamp01(theme.grain) ** 0.75 * 42) / 100;
}

/**
 * Bruit fractal SVG en data-URI — aucune ressource externe, aucun asset.
 *
 * `feComponentTransfer` ÉTALE le bruit : sans lui, `feTurbulence` sort une
 * plage serrée autour de 0,5 que le mode `overlay` laisse passer presque
 * inchangée. Pente 2,6 / ordonnée −0,8 garde le point milieu (0,5 → 0,5) et
 * pousse les extrêmes (0,35 → 0,11 · 0,65 → 0,89) : du VRAI grain.
 * baseFrequency 0,65 → un grain de ~1,5 css, indépendant du zoom écran.
 */
export const SIDEBAR_THEME_GRAIN_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n' x='0' y='0' width='100%25' height='100%25'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='2.6' intercept='-0.8'/><feFuncG type='linear' slope='2.6' intercept='-0.8'/><feFuncB type='linear' slope='2.6' intercept='-0.8'/></feComponentTransfer></filter><rect width='140' height='140' filter='url(%23n)'/></svg>";

/**
 * LA COULEUR D'ACCENT DE L'ESPACE — celle que portent le panneau de plan et
 * les notifications de fin de tâche.
 *
 * Consigne fondateur : « si quelqu'un change la palette de couleur, ça change
 * aussi la palette de ses notifs ». Une couleur en dur — le vert de ma
 * maquette — dit toujours la même chose quel que soit l'espace ; elle se
 * cogne au voile dès qu'on sort du gris, et elle n'appartient à personne.
 *
 * La dominante d'un thème est `stops[0]` : c'est déjà elle qui décide du
 * voile de la colonne. La reprendre ici fait que la progression d'une tâche
 * et l'espace où elle tourne parlent la MÊME couleur — on sait d'un coup
 * d'œil de quel espace vient ce qui bouge.
 *
 * Sans thème, on retombe sur le bleu du libellé « Working » (sky-500) :
 * l'état par défaut est déjà bleu partout ailleurs dans l'app, on ne va pas
 * inventer une troisième couleur au repos.
 */
export const ACCENT_PAR_DEFAUT = "#0ea5e9";

export function sidebarThemeAccent(theme: SidebarTheme | null | undefined): string {
  const dominante = theme?.stops.find((stop) => HEX_COLOR.test(stop.color));
  return dominante?.color ?? ACCENT_PAR_DEFAUT;
}
