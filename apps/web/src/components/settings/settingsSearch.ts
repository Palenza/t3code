export type SettingsPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/providers"
  | "/settings/source-control"
  | "/settings/connections"
  | "/settings/voice"
  | "/settings/skills"
  | "/settings/beta"
  | "/settings/theme"
  | "/settings/tableau-local"
  | "/settings/archived";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  /**
   * Ce qu'on tape quand on ne se rappelle PAS du titre exact.
   *
   * La recherche ne regardait que les titres. Or on cherche un réglage par le
   * mot qui nous vient — « micro », « dictée », « couleur » — pas par son
   * intitulé officiel, qu'on ne connaît justement pas puisqu'on le cherche.
   * Ces mots ne s'affichent jamais : ils ne servent qu'à retrouver.
   */
  readonly keywords?: ReadonlyArray<string>;
}

/**
 * Section labels in sidebar order. The sidebar nav and the search-result
 * subtitles both render from this record, so each label exists once.
 */
export const SETTINGS_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  "/settings/general": "General",
  "/settings/appearance": "Appearance",
  "/settings/keybindings": "Keybindings",
  "/settings/providers": "Providers",
  "/settings/source-control": "Source Control",
  "/settings/connections": "Connections",
  "/settings/voice": "Voice",
  // Après Voice et avant Beta : c'est un réglage établi, pas une expérience.
  "/settings/skills": "Skills",
  "/settings/beta": "Beta",
  "/settings/theme": "Theme",
  "/settings/tableau-local": "Tableau local",
  "/settings/archived": "Archive",
};

/**
 * Every searchable setting, in result order. This catalog is the single
 * source of truth for anchor ids and visible titles: panels render both via
 * `searchableSetting`, so a retitle (or, later, a translation pass) happens
 * here once instead of separately in the panel and the index.
 */
export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "theme",
    title: "Theme",
    to: "/settings/appearance",
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    title: "Glass opacity",
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    title: "Environment identification",
    to: "/settings/appearance",
    // The setting is stage-dependent, so its parent section is the stable destination.
    targetId: "appearance",
  },
  {
    id: "word-wrap",
    title: "Word wrap",
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    title: "Project grouping",
    to: "/settings/general",
  },
  {
    id: "raptor-language",
    title: "Language",
    to: "/settings/general",
  },
  {
    id: "time-format",
    title: "Time format",
    to: "/settings/general",
  },
  {
    id: "hide-whitespace-changes",
    title: "Hide whitespace changes",
    to: "/settings/general",
  },
  {
    id: "assistant-output",
    title: "Assistant output",
    to: "/settings/general",
  },
  {
    id: "provider-update-checks",
    title: "Provider update checks",
    to: "/settings/general",
  },
  {
    id: "auto-open-task-panel",
    title: "Auto-open task panel",
    to: "/settings/general",
  },
  {
    id: "new-threads",
    title: "New threads",
    to: "/settings/general",
  },
  {
    id: "start-from-origin",
    title: "Start from origin",
    to: "/settings/general",
    targetId: "new-threads",
  },
  {
    id: "add-project-starts-in",
    title: "Add project starts in",
    to: "/settings/general",
  },
  {
    id: "archive-confirmation",
    title: "Archive confirmation",
    to: "/settings/general",
  },
  {
    id: "delete-confirmation",
    title: "Delete confirmation",
    to: "/settings/general",
  },
  {
    id: "text-generation-model",
    title: "Text generation model",
    to: "/settings/general",
  },
  {
    id: "diagnostics",
    title: "Diagnostics",
    to: "/settings/general",
  },
  {
    id: "keybindings",
    title: "Keybindings",
    to: "/settings/keybindings",
  },
  {
    id: "providers",
    title: "Providers",
    to: "/settings/providers",
  },
  {
    id: "source-control",
    title: "Source control",
    to: "/settings/source-control",
  },
  {
    id: "remote-environments",
    title: "Remote environments",
    to: "/settings/connections",
  },
  {
    id: "sidebar-v2",
    title: "Sidebar v2",
    to: "/settings/beta",
  },
  {
    id: "auto-settle-inactive-threads",
    title: "Auto-settle inactive threads",
    to: "/settings/beta",
    targetId: "sidebar-v2",
  },
  {
    id: "archive",
    title: "Archived threads",
    to: "/settings/archived",
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = Object.fromEntries(
  SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item]),
) as Readonly<Record<SettingsSearchItemId, SettingsSearchItem>>;

/**
 * `id` and `title` props for the element a search item anchors to. Panels
 * spread (or pick from) this instead of restating the strings, so the catalog
 * and the rendered settings cannot drift apart.
 */
export function searchableSetting(id: SettingsSearchItemId): {
  readonly id: string;
  readonly title: string;
} {
  const { id: anchorId, title } = SEARCH_ITEMS_BY_ID[id];
  return { id: anchorId, title };
}

/**
 * Les mots qui mènent à une SECTION entière.
 *
 * Français ET anglais, parce que l'app mélange les deux et que personne ne se
 * rappelle dans quelle langue est écrit l'intitulé qu'il cherche.
 */
const MOTS_DES_SECTIONS: Readonly<Record<SettingsPath, ReadonlyArray<string>>> = {
  "/settings/general": ["général", "divers", "démarrage", "mises à jour", "updates"],
  "/settings/appearance": ["apparence", "couleur", "police", "font", "verre", "glass"],
  "/settings/keybindings": ["raccourcis", "clavier", "touches", "shortcuts"],
  "/settings/providers": ["comptes", "claude", "codex", "cursor", "grok", "opencode", "quota"],
  "/settings/source-control": ["git", "github", "gitlab", "dépôt", "branche", "repo"],
  "/settings/connections": ["réseau", "network", "appairage", "pairing", "sessions", "accès"],
  "/settings/voice": ["dictée", "micro", "microphone", "parler", "transcription", "speech"],
  "/settings/skills": ["compétences", "capacités"],
  "/settings/beta": ["bêta", "expérimental", "experimental"],
  "/settings/theme": ["thème", "couleurs", "espace", "space"],
  "/settings/tableau-local": ["usine", "affiliation", "palenza", "dashboard"],
  "/settings/archived": ["archive", "archivés", "fils rangés"],
};

/**
 * UNE ENTRÉE PAR SECTION, dérivée — jamais recopiée.
 *
 * Le 02/08, quatre sections sur douze n'étaient atteignables par AUCUNE
 * recherche : Voice, Skills, Theme et Tableau local n'avaient pas une seule
 * entrée. Taper « dictée » ne menait nulle part, alors que la page existe.
 *
 * En les DÉRIVANT des libellés de navigation plutôt qu'en les écrivant à la
 * main, une section ajoutée demain est trouvable le jour même, sans que
 * personne ait à y penser. C'est le mécanisme qui garde la règle, pas la
 * vigilance.
 */
export const SETTINGS_SECTION_SEARCH_ITEMS: ReadonlyArray<SettingsSearchItem> = (
  Object.keys(SETTINGS_SECTION_LABELS) as ReadonlyArray<SettingsPath>
).map((to) => ({
  // Préfixé : un id de section ne doit jamais heurter un id de réglage.
  id: `section:${to}`,
  title: SETTINGS_SECTION_LABELS[to],
  to,
  keywords: MOTS_DES_SECTIONS[to],
}));

/**
 * Ce que la recherche parcourt : les réglages nommés d'abord, les sections
 * ensuite. L'ordre compte — chercher « theme » doit tomber sur LE réglage
 * avant de proposer la section qui le contient.
 */
export const SETTINGS_SEARCH_INDEX: ReadonlyArray<SettingsSearchItem> = [
  ...SETTINGS_SEARCH_ITEMS,
  ...SETTINGS_SECTION_SEARCH_ITEMS,
];

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_INDEX,
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];

  return items.filter((item) => {
    if (normalizeSearchText(item.title).includes(normalizedQuery)) {
      return true;
    }
    // Les mots-clés ne rattrapent QUE ce que le titre a laissé passer : ils
    // n'avancent jamais un résultat devant une correspondance de titre, parce
    // que l'ordre du catalogue est préservé par `filter`.
    //
    // Et ils se cherchent par DÉBUT DE MOT, pas par sous-chaîne comme les
    // titres. Un mot-clé est un nom de rechange, pas un fragment : taper
    // « work » ne doit pas tomber sur « network », alors que « dict » doit
    // bien trouver « dictée ». Le test qui exigeait zéro résultat sur « work »
    // a attrapé exactement ça.
    return (item.keywords ?? []).some((mot) =>
      normalizeSearchText(mot)
        .split(" ")
        .some((morceau) => morceau.startsWith(normalizedQuery)),
    );
  });
}
