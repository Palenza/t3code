import { describe, expect, it } from "vite-plus/test";

import {
  searchableSetting,
  searchSettings,
  SETTINGS_SEARCH_INDEX,
  SETTINGS_SEARCH_ITEMS,
  SETTINGS_SECTION_LABELS,
  type SettingsPath,
  type SettingsSearchItem,
} from "./settingsSearch";

const ITEMS: ReadonlyArray<SettingsSearchItem> = [
  {
    id: "word-wrap",
    title: "Word wrap",
    to: "/settings/general",
  },
  {
    id: "network-access",
    title: "Network access",
    to: "/settings/connections",
  },
  {
    id: "providers",
    title: "Providers",
    to: "/settings/providers",
  },
  {
    id: "provider-updates",
    title: "Update checks",
    to: "/settings/general",
  },
  {
    id: "automatic-updates",
    title: "Automatic updates",
    to: "/settings/general",
  },
];

describe("searchSettings", () => {
  it("matches only setting titles", () => {
    expect(searchSettings("word", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("network", ITEMS).map((item) => item.id)).toEqual(["network-access"]);
    expect(searchSettings("connections", ITEMS)).toEqual([]);
    expect(searchSettings("claude", ITEMS)).toEqual([]);
  });

  it("matches normalized title substrings", () => {
    expect(searchSettings("  WORD   WRAP  ", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("work")).toEqual([]);
  });

  it("keeps catalog order for multiple title matches", () => {
    expect(searchSettings("update", ITEMS).map((item) => item.id)).toEqual([
      "provider-updates",
      "automatic-updates",
    ]);
  });

  it("returns no results for an empty query", () => {
    expect(searchSettings("   ", ITEMS)).toEqual([]);
  });

  it("keeps catalog result ids unique", () => {
    const ids = SETTINGS_SEARCH_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("serves anchor props to panels from the catalog", () => {
    expect(searchableSetting("word-wrap")).toEqual({ id: "word-wrap", title: "Word wrap" });
    expect(searchableSetting("archive")).toEqual({ id: "archive", title: "Archived threads" });
  });

  it("routes appearance settings to their current section", () => {
    expect(searchSettings("theme")[0]).toMatchObject({
      id: "theme",
      to: "/settings/appearance",
    });
    expect(searchSettings("word wrap")[0]).toMatchObject({
      id: "word-wrap",
      to: "/settings/appearance",
    });
    expect(searchSettings("environment identification")[0]).toMatchObject({
      id: "environment-identification",
      to: "/settings/appearance",
      targetId: "appearance",
    });
  });

  it("atteint CHAQUE section — quatre étaient introuvables", () => {
    // Le 02/08 : Voice, Skills, Theme et Tableau local n'avaient pas une seule
    // entrée de recherche. Taper « voice » ne menait nulle part, alors que la
    // page existait. Ce test tombe si une section redevient inatteignable —
    // y compris une section ajoutée demain.
    const orphelines = (Object.keys(SETTINGS_SECTION_LABELS) as ReadonlyArray<SettingsPath>).filter(
      (chemin) => !SETTINGS_SEARCH_INDEX.some((item) => item.to === chemin),
    );

    expect(
      orphelines,
      `Ces sections ne sont atteignables par AUCUNE recherche : ${orphelines.join(", ")}. ` +
        `Elles doivent figurer dans SETTINGS_SEARCH_INDEX — les entrées de section en ` +
        `sont dérivées automatiquement, donc une orpheline signale que la dérivation a sauté.`,
    ).toEqual([]);
  });

  it("trouve une section par son nom, dans les deux langues", () => {
    expect(searchSettings("voice").some((item) => item.to === "/settings/voice")).toBe(true);
    // Le mot qui vient à l'esprit, pas l'intitulé officiel.
    expect(searchSettings("dictée").some((item) => item.to === "/settings/voice")).toBe(true);
    expect(searchSettings("micro").some((item) => item.to === "/settings/voice")).toBe(true);
    expect(searchSettings("skills").some((item) => item.to === "/settings/skills")).toBe(true);
    expect(searchSettings("tableau").some((item) => item.to === "/settings/tableau-local")).toBe(
      true,
    );
  });

  it("trouve un compte par le nom du fournisseur, jamais écrit dans un titre", () => {
    expect(searchSettings("claude").some((item) => item.to === "/settings/providers")).toBe(true);
    expect(searchSettings("quota").some((item) => item.to === "/settings/providers")).toBe(true);
  });

  it("cherche un mot-clé par DÉBUT DE MOT, pas par fragment", () => {
    // « work » ne doit pas tomber sur le mot-clé « network » : un mot-clé est
    // un nom de rechange, pas un morceau de chaîne. Sans cette règle, chercher
    // « work » ramenait Connexions — et le test voisin, qui exige zéro
    // résultat, l'a attrapé.
    expect(searchSettings("work")).toEqual([]);
    // Mais un début de mot trouve bien : c'est tout l'intérêt.
    expect(searchSettings("dict").some((item) => item.to === "/settings/voice")).toBe(true);
    // Y compris à l'intérieur d'un mot-clé en plusieurs mots.
    expect(searchSettings("jour").some((item) => item.to === "/settings/general")).toBe(true);
  });

  it("ignore les accents dans les mots-clés comme dans les titres", () => {
    expect(searchSettings("dictee").some((item) => item.to === "/settings/voice")).toBe(true);
    expect(searchSettings("theme").some((item) => item.to === "/settings/theme")).toBe(true);
  });

  it("laisse le RÉGLAGE passer devant la section qui le contient", () => {
    // « Theme » est à la fois un réglage d'Apparence et une section. Le
    // réglage nommé doit rester le premier résultat : sinon un clic d'habitude
    // atterrit ailleurs qu'avant.
    expect(searchSettings("theme")[0]).toMatchObject({
      id: "theme",
      to: "/settings/appearance",
    });
  });

  it("garde des identifiants uniques une fois les sections ajoutées", () => {
    const ids = SETTINGS_SEARCH_INDEX.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("n'affiche jamais un mot-clé — ils ne servent qu'à retrouver", () => {
    for (const item of SETTINGS_SEARCH_INDEX) {
      for (const mot of item.keywords ?? []) {
        expect(item.title).not.toContain(mot);
      }
    }
  });
});
