import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  activeSpaceTheme,
  MAX_SIDEBAR_FAVORITES,
  useSidebarSpacesStore,
} from "./sidebarSpacesStore";
import { makeSidebarThemeFromColors } from "./sidebarThemeStore";

const reset = () =>
  useSidebarSpacesStore.setState({
    spaces: [],
    activeSpaceId: null,
    assignments: {},
    favorites: [],
  });

describe("sidebarSpacesStore", () => {
  beforeEach(reset);

  it("creates a space, activates it, and resolves its theme", () => {
    const theme = makeSidebarThemeFromColors(["#4caf7d"]);
    const id = useSidebarSpacesStore.getState().createSpace({
      name: "Design",
      emoji: "🎨",
      theme,
    });
    const state = useSidebarSpacesStore.getState();
    expect(state.activeSpaceId).toBe(id);
    expect(activeSpaceTheme(state)).toBe(theme);
    expect(activeSpaceTheme({ ...state, activeSpaceId: null })).toBeNull();
  });

  it("cycles through [all, …spaces] in both directions", () => {
    const store = useSidebarSpacesStore.getState();
    const a = store.createSpace({ name: "A", emoji: "🅰️", theme: null });
    const b = useSidebarSpacesStore.getState().createSpace({ name: "B", emoji: "🅱️", theme: null });
    useSidebarSpacesStore.getState().setActiveSpace(null);
    useSidebarSpacesStore.getState().cycleSpace(1);
    expect(useSidebarSpacesStore.getState().activeSpaceId).toBe(a);
    useSidebarSpacesStore.getState().cycleSpace(1);
    expect(useSidebarSpacesStore.getState().activeSpaceId).toBe(b);
    useSidebarSpacesStore.getState().cycleSpace(1);
    expect(useSidebarSpacesStore.getState().activeSpaceId).toBeNull();
    useSidebarSpacesStore.getState().cycleSpace(-1);
    expect(useSidebarSpacesStore.getState().activeSpaceId).toBe(b);
  });

  it("deleting a space drops its assignments and falls back to the all view", () => {
    const id = useSidebarSpacesStore.getState().createSpace({
      name: "Debug",
      emoji: "🐛",
      theme: null,
    });
    useSidebarSpacesStore.getState().assignThread("env:t1", id);
    useSidebarSpacesStore.getState().assignThread("env:t2", id);
    useSidebarSpacesStore.getState().deleteSpace(id);
    const state = useSidebarSpacesStore.getState();
    expect(state.spaces).toHaveLength(0);
    expect(state.assignments).toEqual({});
    expect(state.activeSpaceId).toBeNull();
  });

  it("assigning to null unassigns", () => {
    const id = useSidebarSpacesStore.getState().createSpace({
      name: "Prod",
      emoji: "🚀",
      theme: null,
    });
    useSidebarSpacesStore.getState().assignThread("env:t1", id);
    expect(useSidebarSpacesStore.getState().assignments["env:t1"]).toBe(id);
    useSidebarSpacesStore.getState().assignThread("env:t1", null);
    expect(useSidebarSpacesStore.getState().assignments["env:t1"]).toBeUndefined();
  });

  it("favorites toggle and cap at the Arc maximum", () => {
    const favorite = (n: number) => ({
      threadKey: `env:t${n}`,
      environmentId: "env",
      threadId: `t${n}`,
      title: `Fil ${n}`,
    });
    for (let n = 0; n < MAX_SIDEBAR_FAVORITES + 3; n += 1) {
      useSidebarSpacesStore.getState().toggleFavorite(favorite(n));
    }
    expect(useSidebarSpacesStore.getState().favorites).toHaveLength(MAX_SIDEBAR_FAVORITES);
    useSidebarSpacesStore.getState().toggleFavorite(favorite(0));
    expect(useSidebarSpacesStore.getState().favorites).toHaveLength(MAX_SIDEBAR_FAVORITES - 1);
    expect(
      useSidebarSpacesStore.getState().favorites.some((f) => f.threadKey === "env:t0"),
    ).toBe(false);
  });
});

describe("gestion des espaces (façon Arc)", () => {
  it("réordonne la barre en insérant à la place visée", () => {
    // Glisser le 3e sur le 1er le place EN PREMIER, les autres décalent —
    // c'est ce que fait Arc quand on réarrange ses espaces (29/07).
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const a = store.getState().createSpace({ name: "A", emoji: "🎨", theme: null });
    const b = store.getState().createSpace({ name: "B", emoji: "🐛", theme: null });
    const c = store.getState().createSpace({ name: "C", emoji: "🚀", theme: null });

    store.getState().reorderSpaces(c, a);

    expect(store.getState().spaces.map((space) => space.id)).toEqual([c, a, b]);
  });

  it("ne bouge rien si la cible n'existe pas ou est elle-même", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const a = store.getState().createSpace({ name: "A", emoji: "🎨", theme: null });
    const b = store.getState().createSpace({ name: "B", emoji: "🐛", theme: null });

    store.getState().reorderSpaces(a, a);
    store.getState().reorderSpaces(a, "inconnu");

    expect(store.getState().spaces.map((space) => space.id)).toEqual([a, b]);
  });

  it("renomme et rhabille un espace sans toucher aux autres", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const a = store.getState().createSpace({ name: "A", emoji: "🎨", theme: null });
    const b = store.getState().createSpace({ name: "B", emoji: "🐛", theme: null });

    store.getState().renameSpace(a, "Design");
    store.getState().setSpaceEmoji(a, "icon:code dev");

    const [premier, second] = store.getState().spaces;
    expect(premier).toMatchObject({ id: a, name: "Design", emoji: "icon:code dev" });
    expect(second).toMatchObject({ id: b, name: "B", emoji: "🐛" });
  });
});
