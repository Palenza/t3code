import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  activeSpaceTheme,
  inheritActiveSpace,
  MAX_SIDEBAR_FAVORITES,
  linkFavoriteKey,
  useSidebarSpacesStore,
  visibleFavorites,
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
  it("épingle une adresse dans l'espace courant et la garde pour lui seul", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const design = store.getState().createSpace({ name: "Design", emoji: "🎨", theme: null });
    const autre = store.getState().createSpace({ name: "Usine", emoji: "🏭", theme: null });

    store.getState().addLinkFavorite({
      url: "http://localhost:4321/banc.html",
      title: "Banc",
      spaceId: design,
    });
    store.getState().addLinkFavorite({ url: "https://arc.net", title: "Arc", spaceId: null });

    // Dans Design : le banc ET le favori transversal.
    expect(
      visibleFavorites({ favorites: store.getState().favorites, activeSpaceId: design }).map(
        (favorite) => favorite.title,
      ),
    ).toEqual(["Banc", "Arc"]);
    // Ailleurs : le banc a disparu, le transversal suit.
    expect(
      visibleFavorites({ favorites: store.getState().favorites, activeSpaceId: autre }).map(
        (favorite) => favorite.title,
      ),
    ).toEqual(["Arc"]);
  });

  it("refuse la même adresse deux fois et le DIT", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const url = "http://localhost:4321/banc.html";

    expect(store.getState().addLinkFavorite({ url, title: "Banc", spaceId: null })).toBe("added");
    expect(store.getState().addLinkFavorite({ url, title: "Banc bis", spaceId: null })).toBe(
      "duplicate",
    );
    expect(store.getState().favorites).toHaveLength(1);
  });

  it("supprimer un espace emporte les favoris qui n'existaient que pour lui", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const design = store.getState().createSpace({ name: "Design", emoji: "🎨", theme: null });
    store
      .getState()
      .addLinkFavorite({ url: "http://localhost:4321/banc.html", title: "Banc", spaceId: design });
    store.getState().addLinkFavorite({ url: "https://arc.net", title: "Arc", spaceId: null });

    store.getState().deleteSpace(design);

    // Sinon il resterait invisible à jamais tout en mangeant une des 12 places.
    expect(store.getState().favorites.map((favorite) => favorite.title)).toEqual(["Arc"]);
  });

  it("renomme un favori sans toucher aux autres", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    store.getState().addLinkFavorite({ url: "https://a.test", title: "A", spaceId: null });
    store.getState().addLinkFavorite({ url: "https://b.test", title: "B", spaceId: null });

    store.getState().renameFavorite(linkFavoriteKey("https://a.test"), "Banc de design");

    expect(store.getState().favorites.map((favorite) => favorite.title)).toEqual([
      "Banc de design",
      "B",
    ]);
  });
  it("un fil neuf hérite de l'espace où on travaille, sans jamais demander", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const design = store.getState().createSpace({ name: "Design", emoji: "🎨", theme: null });

    inheritActiveSpace("env:fil-neuf");

    expect(store.getState().assignments["env:fil-neuf"]).toBe(design);
  });

  it("dans « Tous », un fil neuf ne se range nulle part", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    store.getState().createSpace({ name: "Design", emoji: "🎨", theme: null });
    store.getState().setActiveSpace(null);

    inheritActiveSpace("env:fil-neuf");

    expect(store.getState().assignments["env:fil-neuf"]).toBeUndefined();
  });

  it("l'héritage ne déloge JAMAIS un fil rangé à la main", () => {
    const store = useSidebarSpacesStore;
    store.setState({ spaces: [], activeSpaceId: null, assignments: {}, favorites: [] });
    const design = store.getState().createSpace({ name: "Design", emoji: "🎨", theme: null });
    const usine = store.getState().createSpace({ name: "Usine", emoji: "🏭", theme: null });
    store.getState().assignThread("env:fil", design);

    // On est dans Usine, mais le fil a déjà été classé dans Design à la main.
    store.getState().setActiveSpace(usine);
    inheritActiveSpace("env:fil");

    expect(store.getState().assignments["env:fil"]).toBe(design);
  });
});
