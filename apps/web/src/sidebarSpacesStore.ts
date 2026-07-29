import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SidebarTheme } from "./sidebarThemeStore";

/**
 * Espaces façon Arc (demande fondateur 29/07, doc officielle ratissée) :
 * un Espace = un nom, une icône emoji, SON thème de couleurs, et les fils
 * qu'on y a rangés. La barre d'icônes vit en bas de la sidebar ; on bascule
 * au clic ou au swipe deux doigts ; le voile de couleurs suit l'espace.
 * L'espace « nul » (activeSpaceId null) = la vue par défaut : tout, comme
 * avant — les Espaces s'ajoutent, ils ne cassent rien.
 *
 * Les FAVORIS sont la grille d'icônes tout en haut, TRANSVERSALE aux
 * espaces (comme Arc, max 12) — chaque favori est UN FIL relié : cliquer
 * rouvre ce fil et son contexte, jamais une fenêtre neuve.
 */

export interface SidebarSpace {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly theme: SidebarTheme | null;
}

export interface SidebarFavorite {
  /** `${environmentId}:${threadId}` — la clé de fil canonique. */
  readonly threadKey: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly title: string;
}

export const MAX_SIDEBAR_FAVORITES = 12;

export const SPACE_EMOJI_PRESETS: ReadonlyArray<string> = [
  "🎨",
  "🐛",
  "🚀",
  "🏭",
  "🧪",
  "📈",
  "🎧",
  "📦",
  "🧭",
  "💡",
  "🔧",
  "🗂️",
];

interface SidebarSpacesState {
  spaces: SidebarSpace[];
  activeSpaceId: string | null;
  /** threadKey → spaceId. Un fil vit dans au plus un espace. */
  assignments: Record<string, string>;
  favorites: SidebarFavorite[];
  createSpace: (input: { name: string; emoji: string; theme: SidebarTheme | null }) => string;
  renameSpace: (id: string, name: string) => void;
  /** Change l'icône d'un espace — emoji ou icône lucide (`icon:<nom>`). */
  setSpaceEmoji: (id: string, emoji: string) => void;
  /** Réordonne la barre : l'espace `id` prend la place de `overId`. */
  reorderSpaces: (id: string, overId: string) => void;
  setSpaceTheme: (id: string, theme: SidebarTheme | null) => void;
  deleteSpace: (id: string) => void;
  setActiveSpace: (id: string | null) => void;
  /** Espace suivant/précédent, la vue « tout » (null) fait partie du cycle. */
  cycleSpace: (direction: 1 | -1) => void;
  assignThread: (threadKey: string, spaceId: string | null) => void;
  /** "full" = cap atteint, rien n'a bougé — l'appelant le DIT (jamais muet). */
  toggleFavorite: (favorite: SidebarFavorite) => "added" | "removed" | "full";
  /** Un fil supprimé ne laisse ni favori fantôme ni rangement orphelin. */
  purgeThread: (threadKey: string) => void;
}

const makeSpaceId = (): string =>
  `space-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const useSidebarSpacesStore = create<SidebarSpacesState>()(
  persist(
    (set, get) => ({
      spaces: [],
      activeSpaceId: null,
      assignments: {},
      favorites: [],
      createSpace: ({ name, emoji, theme }) => {
        const id = makeSpaceId();
        set((state) => ({
          spaces: [...state.spaces, { id, name, emoji, theme }],
          activeSpaceId: id,
        }));
        return id;
      },
      renameSpace: (id, name) =>
        set((state) => ({
          spaces: state.spaces.map((space) => (space.id === id ? { ...space, name } : space)),
        })),
      setSpaceEmoji: (id, emoji) =>
        set((state) => ({
          spaces: state.spaces.map((space) => (space.id === id ? { ...space, emoji } : space)),
        })),
      reorderSpaces: (id, overId) =>
        set((state) => {
          const depuis = state.spaces.findIndex((space) => space.id === id);
          const vers = state.spaces.findIndex((space) => space.id === overId);
          if (depuis === -1 || vers === -1 || depuis === vers) return state;
          const spaces = [...state.spaces];
          const [deplace] = spaces.splice(depuis, 1);
          if (deplace === undefined) return state;
          spaces.splice(vers, 0, deplace);
          return { spaces };
        }),
      setSpaceTheme: (id, theme) =>
        set((state) => ({
          spaces: state.spaces.map((space) => (space.id === id ? { ...space, theme } : space)),
        })),
      deleteSpace: (id) =>
        set((state) => {
          const assignments: Record<string, string> = {};
          for (const [threadKey, spaceId] of Object.entries(state.assignments)) {
            if (spaceId !== id) {
              assignments[threadKey] = spaceId;
            }
          }
          return {
            spaces: state.spaces.filter((space) => space.id !== id),
            assignments,
            activeSpaceId: state.activeSpaceId === id ? null : state.activeSpaceId,
          };
        }),
      setActiveSpace: (id) => set({ activeSpaceId: id }),
      cycleSpace: (direction) => {
        const { spaces, activeSpaceId } = get();
        if (spaces.length === 0) return;
        // Le cycle : [tout, espace1, espace2, …] — le swipe traverse tout.
        const ring: Array<string | null> = [null, ...spaces.map((space) => space.id)];
        const currentIndex = ring.indexOf(activeSpaceId);
        const nextIndex = (currentIndex + direction + ring.length) % ring.length;
        set({ activeSpaceId: ring[nextIndex] ?? null });
      },
      assignThread: (threadKey, spaceId) =>
        set((state) => {
          if (spaceId === null) {
            const { [threadKey]: _removed, ...rest } = state.assignments;
            return { assignments: rest };
          }
          return { assignments: { ...state.assignments, [threadKey]: spaceId } };
        }),
      toggleFavorite: (favorite) => {
        const state = get();
        if (state.favorites.some((f) => f.threadKey === favorite.threadKey)) {
          set({
            favorites: state.favorites.filter((f) => f.threadKey !== favorite.threadKey),
          });
          return "removed";
        }
        if (state.favorites.length >= MAX_SIDEBAR_FAVORITES) {
          return "full";
        }
        set({ favorites: [...state.favorites, favorite] });
        return "added";
      },
      purgeThread: (threadKey) =>
        set((state) => {
          const { [threadKey]: _removed, ...assignments } = state.assignments;
          return {
            assignments,
            favorites: state.favorites.filter((f) => f.threadKey !== threadKey),
          };
        }),
    }),
    { name: "t3code:sidebar-spaces:v1" },
  ),
);

/** Le thème effectif de l'espace actif, s'il en a un. */
export function activeSpaceTheme(
  state: Pick<SidebarSpacesState, "spaces" | "activeSpaceId">,
): SidebarTheme | null {
  if (state.activeSpaceId === null) return null;
  return state.spaces.find((space) => space.id === state.activeSpaceId)?.theme ?? null;
}
