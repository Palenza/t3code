/**
 * DÉSINSTALLER — retirer ce qu'on a posé, et RIEN de ce qui ne nous appartient
 * pas.
 *
 * Chantier n°58, chaîne F. Aspiré de `hermes_cli/uninstall.py` (964 l.) et de
 * son interface, qui offre trois granularités : l'app seule, l'app et l'agent
 * en gardant les données, ou tout.
 *
 * ── Pourquoi ce module est PUR et séparé de l'effacement ──────────────────
 *
 * Un désinstalleur est le seul code du produit dont un bug ne se rattrape
 * pas : il n'y a pas de « annuler ». La décision de ce qui part doit donc
 * pouvoir être lue, testée et discutée SANS qu'un fichier soit touché. Ce
 * module décide ; un autre exécutera, et il ne saura rien décider.
 *
 * ── La règle qui prime sur les trois granularités ─────────────────────────
 *
 * T3 dépose des choses CHEZ L'UTILISATEUR : une skill `raptor-outillage` dans
 * chaque home Claude, des dossiers de travail, un état. La doctrine est déjà
 * écrite dans `ClaudeOutillage.ts` — « on n'écrase que ce qu'on a écrit » — et
 * elle vaut plus fort encore au moment de partir.
 *
 * Donc, quelle que soit la granularité demandée :
 *
 *   · le HOME CLAUDE de l'utilisateur ne se touche JAMAIS. Il contient ses
 *     identifiants, ses conversations, ses propres skills. Il existait avant
 *     nous et il existera après ;
 *   · un DÉPÔT de l'utilisateur ne se touche jamais, même s'il porte un
 *     `.claude/` que nous avons peuplé ;
 *   · ce que T3 a DÉPOSÉ chez lui part avec T3 — laisser une skill orpheline
 *     qui parle d'un outil disparu est une nuisance, pas une politesse.
 *
 * Module PUR.
 */

/** Ce que l'humain a choisi de retirer. */
export type Granularite =
  /** L'application seulement. L'agent, les réglages et les fils restent. */
  | "app-seule"
  /** L'application et ce que T3 a déposé, mais on garde l'état et les fils. */
  | "app-et-outillage"
  /** Tout ce qui appartient à T3. Jamais rien d'autre. */
  | "tout";

export type Sort = "retirer" | "garder" | "jamais";

/** À qui appartient un chemin. C'est ça qui décide, pas la granularité. */
export type Appartenance =
  /** L'application elle-même : binaire, ressources. */
  | "application"
  /** Ce que T3 a déposé chez l'utilisateur : skills d'outillage, dossiers de travail. */
  | "outillage-depose"
  /** L'état de T3 : réglages, base, fils, journaux. */
  | "etat-de-t3"
  /** À l'utilisateur. Home Claude, dépôts, identifiants. JAMAIS touché. */
  | "a-l-utilisateur";

export interface Element {
  readonly chemin: string;
  readonly appartenance: Appartenance;
  /** Ce qu'on en dit à l'humain avant de le retirer. */
  readonly quoi: string;
}

export interface Verdict {
  readonly chemin: string;
  readonly sort: Sort;
  /** Nommé pour un HUMAIN (A7) : ce qui part, ce qui reste, et pourquoi. */
  readonly pourquoi: string;
}

/**
 * Ce qui part, par granularité et par appartenance.
 *
 * `a-l-utilisateur` vaut « jamais » sur les trois colonnes, et c'est
 * volontairement écrit trois fois : une table où la règle se lit d'un coup
 * d'œil vaut mieux qu'une exception cachée dans une condition.
 */
const TABLE: Record<Appartenance, Record<Granularite, Sort>> = {
  application: { "app-seule": "retirer", "app-et-outillage": "retirer", tout: "retirer" },
  "outillage-depose": { "app-seule": "garder", "app-et-outillage": "retirer", tout: "retirer" },
  "etat-de-t3": { "app-seule": "garder", "app-et-outillage": "garder", tout: "retirer" },
  "a-l-utilisateur": { "app-seule": "jamais", "app-et-outillage": "jamais", tout: "jamais" },
};

const RAISONS: Record<Sort, (element: Element, granularite: Granularite) => string> = {
  retirer: (element) => `${element.quoi} — posé par T3, part avec lui.`,
  garder: (element, granularite) =>
    `${element.quoi} — CONSERVÉ : la granularité « ${granularite} » ne l'inclut pas. Une réinstallation le retrouvera intact.`,
  jamais: (element) =>
    `${element.quoi} — NE SE TOUCHE JAMAIS, quelle que soit la granularité. Ça ne nous appartient pas : ça existait avant T3 et ça existera après.`,
};

/** Le sort d'UN élément. */
export function sortDe(element: Element, granularite: Granularite): Verdict {
  const sort = TABLE[element.appartenance][granularite];
  return { chemin: element.chemin, sort, pourquoi: RAISONS[sort](element, granularite) };
}

/** Le plan complet, dans l'ordre reçu. */
export function planDeDesinstallation(
  elements: ReadonlyArray<Element>,
  granularite: Granularite,
): ReadonlyArray<Verdict> {
  return elements.map((element) => sortDe(element, granularite));
}

/**
 * La phrase qu'on montre AVANT d'effacer quoi que ce soit.
 *
 * Elle dit d'abord ce qui RESTE. Un humain qui désinstalle a peur de perdre
 * quelque chose ; lui montrer la liste des suppressions en premier, c'est
 * répondre à une question qu'il ne se pose pas.
 */
export function resumeAvantDeffacer(
  verdicts: ReadonlyArray<Verdict>,
  granularite: Granularite,
): string {
  const compte = (sort: Sort) => verdicts.filter((v) => v.sort === sort).length;
  const intouchables = verdicts.filter((v) => v.sort === "jamais").map((v) => v.chemin);
  const lignes = [
    `Désinstallation « ${granularite} ».`,
    "",
    `RESTE INTACT : ${compte("jamais") + compte("garder")} élément(s).`,
  ];
  if (intouchables.length > 0) {
    lignes.push(
      `  Dont, quoi qu'il arrive : ${intouchables.join(", ")} — tes comptes, tes conversations, tes dépôts.`,
    );
  }
  lignes.push("", `SERA RETIRÉ : ${compte("retirer")} élément(s).`);
  for (const verdict of verdicts.filter((v) => v.sort === "retirer")) {
    lignes.push(`  ${verdict.chemin}`);
  }
  return lignes.join("\n");
}

/**
 * Le garde de dernière seconde, à appeler juste avant d'effacer.
 *
 * Il ne remplace pas la table : il la CONTRÔLE. Si un jour quelqu'un ajoute
 * une granularité et oublie une colonne, ou range un chemin utilisateur dans
 * la mauvaise appartenance, ce filtre le rattrape — et il ne coûte rien.
 */
export function seulementCeQuiPart(verdicts: ReadonlyArray<Verdict>): ReadonlyArray<string> {
  return verdicts.filter((v) => v.sort === "retirer").map((v) => v.chemin);
}
