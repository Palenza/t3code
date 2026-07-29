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
  /**
   * La clé unique du favori : `${environmentId}:${threadId}` pour un fil,
   * `lien:${url}` pour un lien.
   */
  readonly threadKey: string;
  /** Absents sur un favori LIEN. */
  readonly environmentId?: string;
  readonly threadId?: string;
  readonly title: string;
  /**
   * Un favori LIEN — l'adresse à rouvrir (demande fondateur 29/07 : « quand
   * on bosse sur le design, le banc.html, il faut qu'il soit épinglé en
   * favori, qu'on n'ait pas à re-cliquer sur je-ne-sais-quoi qui
   * disparaît »). Absent = c'est un fil.
   */
  readonly url?: string;
  /**
   * L'espace auquel ce favori appartient. `null`/absent = visible partout,
   * comme la grille transversale d'Arc ; renseigné = ne se montre que dans
   * cet espace — le lien de design vit dans l'espace Design.
   */
  readonly spaceId?: string | null;
}

/** La clé canonique d'un favori-lien. */
export const linkFavoriteKey = (url: string): string => `lien:${url}`;

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
  /**
   * Épingle une ADRESSE. Renvoie "duplicate" si elle y est déjà — on ne crée
   * jamais deux tuiles pour la même page.
   */
  addLinkFavorite: (input: {
    url: string;
    title: string;
    spaceId: string | null;
  }) => "added" | "duplicate" | "full";
  /** Renomme un favori (les deux sortes) — le nom donné vaut mieux qu'une URL. */
  renameFavorite: (threadKey: string, title: string) => void;
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
            // Un favori rattaché à l'espace supprimé deviendrait invisible à
            // jamais (aucun espace ne le montre) tout en mangeant une place
            // sur les 12 — on le retire avec l'espace.
            favorites: state.favorites.filter((favorite) => favorite.spaceId !== id),
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
      addLinkFavorite: ({ url, title, spaceId }) => {
        const state = get();
        const threadKey = linkFavoriteKey(url);
        if (state.favorites.some((f) => f.threadKey === threadKey)) {
          return "duplicate";
        }
        if (state.favorites.length >= MAX_SIDEBAR_FAVORITES) {
          return "full";
        }
        set({ favorites: [...state.favorites, { threadKey, title, url, spaceId }] });
        return "added";
      },
      renameFavorite: (threadKey, title) =>
        set((state) => ({
          favorites: state.favorites.map((favorite) =>
            favorite.threadKey === threadKey ? { ...favorite, title } : favorite,
          ),
        })),
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

/**
 * Un fil qui vient de naître hérite de l'espace où on se trouve — la règle
 * d'Arc, et la réponse à « est-ce que ça a du sens de demander dans quel
 * space le mettre ? » (fondateur 29/07) : non. Créer un fil est le geste le
 * plus fréquent de l'app ; y poser une question, c'est une friction payée dix
 * fois par jour pour un rangement qu'on peut deviner. Dans « Tous », le fil
 * ne se range nulle part — comme avant.
 *
 * Ne touche JAMAIS un fil déjà rangé : un classement fait à la main a le
 * dernier mot, et l'appel devient idempotent.
 */
export function inheritActiveSpace(threadKey: string): void {
  const state = useSidebarSpacesStore.getState();
  if (state.activeSpaceId === null) return;
  if (state.assignments[threadKey] !== undefined) return;
  state.assignThread(threadKey, state.activeSpaceId);
}

/**
 * Les favoris à montrer là où on est : ceux de l'espace actif, plus les
 * transversaux (sans espace) qui suivent partout — la grille d'Arc.
 */
export function visibleFavorites(
  state: Pick<SidebarSpacesState, "favorites" | "activeSpaceId">,
): SidebarFavorite[] {
  return state.favorites.filter(
    (favorite) =>
      favorite.spaceId === undefined ||
      favorite.spaceId === null ||
      favorite.spaceId === state.activeSpaceId,
  );
}

/** Le thème effectif de l'espace actif, s'il en a un. */
export function activeSpaceTheme(
  state: Pick<SidebarSpacesState, "spaces" | "activeSpaceId">,
): SidebarTheme | null {
  if (state.activeSpaceId === null) return null;
  return state.spaces.find((space) => space.id === state.activeSpaceId)?.theme ?? null;
}
