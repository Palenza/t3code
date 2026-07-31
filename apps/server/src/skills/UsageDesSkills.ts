/**
 * USAGE DES SKILLS — savoir laquelle sert, sans jamais le deviner.
 *
 * Chantier n°2 (`tools/skill_usage.py`, 1 145 lignes). C'est le socle du n°1,
 * le curateur : sans mesure, il archiverait à l'aveugle.
 *
 * ── Deux choses qu'Hermès fait et qu'on ne DOIT pas refaire ────────────────
 *
 * 1. **Le sidecar `.usage.json` dans le dossier de la skill.** Chez eux c'est
 *    la bonne réponse : rien ne persiste les invocations. Chez nous ce serait
 *    un défaut ACTIF. `signatureDesSkills` (ClaudeAdapter) calcule
 *    `nb fichiers : mtime max` par marche récursive des dossiers de skills, et
 *    compare au début de chaque tour pour décider d'un `reloadSkills()`.
 *    Écrire un compteur là-dedans changerait l'empreinte À CHAQUE APPEL : la
 *    télémétrie déclencherait un rechargement par tour. Le remède causerait la
 *    maladie.
 *
 * 2. **L'instrumentation.** Inutile : T3 enregistre DÉJÀ chaque invocation.
 *    Vérifié sur la vraie base le 31/07 — `projection_thread_activities`,
 *    `kind='tool.completed'`, `payload_json.data.toolName='Skill'`, et le nom
 *    de la skill dans `data.input.skill`. 11 appels réels sur 28 097 activités
 *    d'outil. Ce module est donc une LECTURE, comme `PreuveStore`.
 *
 * ── Ce qui rend le chantier non trivial : la FENÊTRE ──────────────────────
 *
 * Mesuré le 31/07 sur `~/.t3/userdata/state.sqlite` :
 *
 *   fenêtre d'observation réelle ...... 7,1 jours (24/07 → 31/07)
 *   skills sur disque ................. 17
 *   skills appelées dans la fenêtre ... 3
 *   skills MUETTES .................... 14
 *   plus ancienne .................... `debug-navigateur`, née le 30/05 (62 j)
 *
 * Un curateur naïf archiverait 82 % des skills — dont `debug-navigateur`, que
 * la loi du projet rend OBLIGATOIRE (M12). Zéro appel en 7 jours ne dit
 * strictement rien d'une skill qui a 62 jours.
 *
 * La projection est d'ailleurs élaguée : la fenêtre restera courte. Ce n'est
 * pas un manque de données à combler, c'est une contrainte permanente.
 *
 * D'où la forme retenue : **le verdict porte sa fenêtre, et se tait quand
 * elle ne le porte pas.** H4 — « on n'a pas vu d'appel » est un fait sur
 * NOUS ; « elle ne sert pas » est une affirmation sur le monde qu'on n'a pas
 * prouvée.
 *
 * Module PUR : on lui donne des comptes et des dates, il juge. `DateTime`
 * est un module de DONNÉES d'Effect (pas un effet) — l'importer ne rend
 * rien effectuel, et le dépôt interdit `new Date` partout.
 */
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

/**
 * Trois états, et le troisième est le seul qui rende le curateur sûr.
 *
 * - `utilisée` — au moins un appel vu.
 * - `inutilisée` — zéro appel, ET la fenêtre couvre toute la vie de la skill,
 *   ET elle est assez longue pour que ça veuille dire quelque chose.
 * - `indécidable` — zéro appel, mais on n'a pas regardé assez longtemps.
 */
export type EtatDeSkill = "utilisée" | "inutilisée" | "indécidable";

/** La période réellement couverte par les données, en millisecondes. */
export interface Fenetre {
  readonly depuis: number;
  readonly jusqu: number;
}

export interface AppelsDUneSkill {
  readonly nom: string;
  readonly appels: number;
  /** `null` quand aucun appel n'a été vu. */
  readonly dernierAppel: number | null;
}

export interface SkillSurDisque {
  readonly nom: string;
  /** Date de naissance. `null` = inconnue, et alors on ne conclut jamais. */
  readonly neLe: number | null;
  /** Épinglée : orthogonal à l'état. Une épinglée se mesure, ne s'archive pas. */
  readonly epinglee: boolean;
}

export interface UsageDUneSkill {
  readonly nom: string;
  readonly appels: number;
  readonly dernierAppel: number | null;
  readonly etat: EtatDeSkill;
  readonly epinglee: boolean;
  /** `true` seulement si un geste destructeur serait JUSTIFIÉ. */
  readonly archivable: boolean;
  /** Nommé pour un AGENT (A7) : la raison, avec ses chiffres. */
  readonly pourquoi: string;
}

/**
 * En dessous, « inutilisée » n'est pas une conclusion, c'est une impatience.
 *
 * REÇU (31/07, `/tmp/ecarts.mjs` sur la base réelle) : le plus grand écart
 * OBSERVABLE entre deux usages d'une même skill est de 4,0 jours
 * (`claude-api`) — et la fenêtre ne faisant que 7,1 jours, aucun écart plus
 * long ne PEUT être vu. Un plancher doit donc dépasser largement ce qu'on
 * sait voir : 30 jours ≈ 7,5× le plus grand écart mesuré, 4× la fenêtre
 * entière.
 *
 * Conséquence assumée : sur les données d'aujourd'hui, ce module rend
 * `indécidable` pour les 17 skills. C'est la RÉPONSE VRAIE, et elle rend le
 * curateur sûr par construction tant qu'on n'a pas d'historique.
 *
 * À remesurer quand la fenêtre dépassera 30 jours — pas avant.
 */
export const FENETRE_MINIMALE_MS = 30 * 24 * 60 * 60 * 1000;

/** La fenêtre couverte par une liste d'horodatages, ou `null` si elle est vide. */
export function fenetreDe(horodatages: ReadonlyArray<number>): Fenetre | null {
  if (horodatages.length === 0) return null;
  let depuis = horodatages[0] ?? 0;
  let jusqu = depuis;
  for (const t of horodatages) {
    if (t < depuis) depuis = t;
    if (t > jusqu) jusqu = t;
  }
  return { depuis, jusqu };
}

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Un horodatage en ISO, ou `null`.
 *
 * Vit ICI et pas dans le gestionnaire : ce module n'importe pas Effect, donc
 * `Date` y est permis. Dans du code Effect, le diagnostic exige `DateTime` —
 * et faire descendre un `DateTime` jusqu'à une chaîne de rendu coûterait une
 * dépendance pour un `toISOString`.
 */
export function isoDe(ms: number | null): string | null {
  if (ms === null || Number.isNaN(ms)) return null;
  return Option.match(DateTime.make(ms), {
    onNone: () => null,
    onSome: (quand) => DateTime.formatIso(quand),
  });
}

/** Le jour seul, `AAAA-MM-JJ`, ou `""` si l'horodatage est inexploitable. */
function jourDe(ms: number): string {
  return isoDe(ms)?.slice(0, 10) ?? "";
}
const enJours = (ms: number): string => (ms / JOUR).toFixed(1);

/**
 * L'état d'UNE skill, avec sa raison.
 *
 * L'ordre des tests est la doctrine : on cherche d'abord une preuve d'usage,
 * puis une raison de ne PAS conclure. On ne conclut à l'inutilité qu'en
 * dernier, quand plus rien ne s'y oppose.
 */
export function etatDUneSkill(input: {
  readonly skill: SkillSurDisque;
  readonly appels: AppelsDUneSkill | undefined;
  readonly fenetre: Fenetre | null;
}): UsageDUneSkill {
  const { skill, fenetre } = input;
  const appels = input.appels?.appels ?? 0;
  const dernierAppel = input.appels?.dernierAppel ?? null;
  const socle = { nom: skill.nom, appels, dernierAppel, epinglee: skill.epinglee };

  if (appels > 0) {
    return {
      ...socle,
      etat: "utilisée",
      archivable: false,
      pourquoi: `${appels} appel(s) vu(s)${dernierAppel === null ? "" : `, le dernier le ${jourDe(dernierAppel)}`}.`,
    };
  }

  const indecidable = (pourquoi: string): UsageDUneSkill => ({
    ...socle,
    etat: "indécidable",
    archivable: false,
    pourquoi,
  });

  if (fenetre === null) {
    return indecidable("aucune donnée d'usage : on n'a rien observé du tout.");
  }
  const duree = fenetre.jusqu - fenetre.depuis;
  if (duree < FENETRE_MINIMALE_MS) {
    return indecidable(
      `aucun appel vu, mais on n'a regardé que ${enJours(duree)} jours — il en faut ${enJours(FENETRE_MINIMALE_MS)} pour que « inutilisée » veuille dire quelque chose.`,
    );
  }
  if (skill.neLe === null) {
    return indecidable(
      "aucun appel vu, mais on ne sait pas quand cette skill est née : impossible de dire si on a regardé pendant toute sa vie.",
    );
  }
  if (skill.neLe < fenetre.depuis) {
    return indecidable(
      `aucun appel vu, mais elle existait ${enJours(fenetre.depuis - skill.neLe)} jours AVANT le début de l'observation : ce silence-là n'a pas été observé.`,
    );
  }

  // Ici seulement : la fenêtre est assez longue, elle couvre toute la vie de
  // la skill, et rien n'y a été vu. C'est une conclusion, pas une impatience.
  return {
    ...socle,
    etat: "inutilisée",
    archivable: !skill.epinglee,
    pourquoi: skill.epinglee
      ? `aucun appel sur ${enJours(duree)} jours couvrant toute sa vie — mais elle est ÉPINGLÉE, donc on n'y touche pas.`
      : `aucun appel sur ${enJours(duree)} jours couvrant toute sa vie (née le ${jourDe(skill.neLe)}).`,
  };
}

/** Le classement complet, dans l'ordre du disque — stable d'un passage à l'autre. */
export function classerLesSkills(input: {
  readonly surDisque: ReadonlyArray<SkillSurDisque>;
  readonly appels: ReadonlyArray<AppelsDUneSkill>;
  readonly fenetre: Fenetre | null;
}): ReadonlyArray<UsageDUneSkill> {
  const parNom = new Map(input.appels.map((a) => [a.nom, a]));
  return input.surDisque.map((skill) =>
    etatDUneSkill({ skill, appels: parNom.get(skill.nom), fenetre: input.fenetre }),
  );
}

/**
 * La phrase de tête. Elle nomme la fenêtre AVANT les chiffres : sans elle,
 * « 14 inutilisées » se lit comme un fait alors que c'est une observation.
 */
export function resumeDUsage(
  usages: ReadonlyArray<UsageDUneSkill>,
  fenetre: Fenetre | null,
): string {
  const compte = (etat: EtatDeSkill) => usages.filter((u) => u.etat === etat).length;
  const portee =
    fenetre === null
      ? "aucune observation disponible"
      : `observé sur ${enJours(fenetre.jusqu - fenetre.depuis)} jours`;
  return `${portee} — ${usages.length} skill(s) : ${compte("utilisée")} utilisée(s), ${compte("inutilisée")} inutilisée(s), ${compte("indécidable")} indécidable(s).`;
}
