/**
 * LE COMPACTAGE DOIT DIRE CE QU'IL EMPORTE.
 *
 * T3 enregistre déjà chaque compactage avec toutes ses métadonnées — et son
 * résumé affiché est la chaîne plate « Context compacted ». L'événement le
 * plus destructeur du système est le seul qui ne dise rien de ce qu'il fait.
 *
 * ── Ce que la mesure a montré (31/07, base réelle, 9 compactages sur 7 j) ──
 *
 *   quand              avant →  après     jeté    durée
 *   2026-07-25T12:46   1002235 →  24712   97,5 %  2 min 03
 *   2026-07-26T11:31   1002457 →  17730   98,2 %  2 min 15
 *   2026-07-27T01:19   1001299 →  18717   98,1 %  2 min 49
 *   2026-07-27T06:06   1001562 →  16641   98,3 %  2 min 38
 *   2026-07-27T15:14   1001597 →  23254   97,7 %  2 min 29
 *   2026-07-28T07:57   1000154 →  15020   98,5 %  2 min 31
 *   2026-07-29T01:04    998341 →  14223   98,6 %  2 min 14
 *   2026-07-31T07:44   1000018 →  15668   98,4 %  3 min 05
 *   2026-07-31T11:56    998926 →  17453   98,3 %  2 min 24
 *
 * Chaque compactage jette entre 97,5 % et 98,6 % de la fenêtre, et coûte deux
 * à trois minutes d'attente. Vingt-deux minutes mortes sur la semaine. Un fil
 * cumule 5 899 825 tokens jetés.
 *
 * Et `preserved_messages` ne contient que TROIS identifiants : trois messages
 * survivent mot pour mot, tout le reste devient un résumé.
 *
 * A7 : une limite atteignable est une limite qu'on doit VOIR. « Context
 * compacted » ne permet rien ; « 998 926 → 17 453, 98,3 % jeté » permet de
 * comprendre pourquoi la session semble avoir tout oublié, et de décider d'y
 * remédier (moins d'images, moins de lectures, graver plus tôt).
 *
 * Module PUR : on lui donne la charge brute, il rend une phrase.
 */

export interface MetadonneesDeCompactage {
  readonly declencheur: string;
  readonly avant: number;
  readonly apres: number;
  readonly cumulJete: number | null;
  readonly dureeMs: number | null;
  /** Combien de messages survivent MOT POUR MOT. Le reste devient un résumé. */
  readonly messagesPreserves: number | null;
}

/** Un nombre fini et positif, ou `null`. On ne bâtit pas une phrase sur du NaN. */
function nombreOuRien(valeur: unknown): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 ? valeur : null;
}

/**
 * Lit les métadonnées d'une charge de compactage.
 *
 * Rend `null` dès qu'il manque de quoi dire quelque chose de vrai. Une phrase
 * à moitié fausse serait pire que la chaîne plate qu'on remplace.
 */
export function lireMetadonnees(payload: unknown): MetadonneesDeCompactage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return null;
  const meta = (detail as { compact_metadata?: unknown }).compact_metadata;
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as {
    trigger?: unknown;
    pre_tokens?: unknown;
    post_tokens?: unknown;
    cumulative_dropped_tokens?: unknown;
    duration_ms?: unknown;
    preserved_messages?: { uuids?: unknown };
  };
  const avant = nombreOuRien(m.pre_tokens);
  const apres = nombreOuRien(m.post_tokens);
  if (avant === null || apres === null || avant === 0) return null;
  const uuids = m.preserved_messages?.uuids;
  return {
    declencheur: typeof m.trigger === "string" && m.trigger.length > 0 ? m.trigger : "inconnu",
    avant,
    apres,
    cumulJete: nombreOuRien(m.cumulative_dropped_tokens),
    dureeMs: nombreOuRien(m.duration_ms),
    messagesPreserves: Array.isArray(uuids) ? uuids.length : null,
  };
}

/**
 * L'espace fine insécable de la typographie française, NOMMÉE.
 *
 * Elle est invisible dans le source : mes propres tests ont tapé une espace
 * ordinaire et sont tombés au rouge sur une chaîne qui paraissait identique.
 * Un littéral qu'on ne peut ni voir ni grepper est une mine.
 */
export const ESPACE_FINE = "\u202f";

/** `1965823` → `1 965 823`. */
function groupe(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/gu, ESPACE_FINE);
}

/** `143707` → `2 min 24`. Sous la minute, on reste en secondes. */
function duree(ms: number): string {
  const secondes = Math.round(ms / 1000);
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  return `${minutes} min ${String(secondes % 60).padStart(2, "0")}`;
}

/**
 * La phrase affichée. Elle nomme ce qui est parti AVANT ce qui reste :
 * c'est la perte qui explique le comportement d'après, pas le reliquat.
 */
export function resumeDeCompactage(payload: unknown): string {
  const m = lireMetadonnees(payload);
  if (m === null) return "Contexte compacté (détail indisponible)";

  const partPerdue = ((100 * (m.avant - m.apres)) / m.avant).toFixed(1).replace(".", ",");
  const morceaux = [
    `Contexte compacté : ${partPerdue} % jeté (${groupe(m.avant)} → ${groupe(m.apres)} tokens)`,
  ];
  if (m.messagesPreserves !== null) {
    morceaux.push(`${m.messagesPreserves} message(s) gardé(s) mot pour mot, le reste résumé`);
  }
  if (m.dureeMs !== null) morceaux.push(`${duree(m.dureeMs)} d'attente`);
  if (m.cumulJete !== null) morceaux.push(`${groupe(m.cumulJete)} tokens jetés en tout sur ce fil`);
  return `${morceaux.join(" · ")}.`;
}
