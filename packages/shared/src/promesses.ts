/**
 * Les promesses de l'agent — ce qu'il a dit qu'il ferait, et qui ne l'est pas.
 *
 * Repris d'openclaw (`src/commitments/extraction.ts`), qui distingue les
 * `agent_promise` des `open_loop`. Le besoin est né d'un constat vérifiable
 * sur la session du 29/07 : l'agent a écrit « j'attaque le relais » à la fin
 * de QUATRE réponses successives sans jamais s'y mettre. Rien ne l'a relevé —
 * c'est l'humain qui portait la charge de s'en souvenir.
 *
 * Détection par MOTIFS, pas par modèle. Le choix mérite d'être défendu :
 * openclaw fait tourner un LLM sur chaque tour pour extraire ses engagements.
 * Ici, une promesse a une forme très stable en français — un verbe d'action à
 * la première personne, au présent ou au futur proche, souvent en fin de
 * réponse. Les motifs coûtent zéro appel, zéro latence, et se testent contre
 * de vraies phrases. On passera au modèle le jour où on aura la preuve que les
 * motifs ratent quelque chose qui compte, pas avant.
 *
 * Le module est PUR : il prend un texte, il rend des promesses.
 */

export interface Promesse {
  /** La phrase telle qu'elle a été écrite — jamais reformulée. */
  readonly phrase: string;
  /** Le verbe qui engage, utile pour retrouver la promesse plus tard. */
  readonly action: string;
}

/**
 * Ce qui engage vraiment, en français.
 *
 * Chaque motif est ancré sur un pronom de première personne suivi d'un verbe
 * d'intention. Le futur simple (« je ferai ») et le futur proche (« je vais
 * faire ») disent tous deux un engagement ; le présent d'action (« j'attaque »,
 * « j'enchaîne ») aussi, et c'est la forme que l'agent emploie le plus.
 */
const MOTIFS: ReadonlyArray<RegExp> = [
  // « je vais faire », « on va faire »
  /\b(?:je|on)\s+vais?\s+(\p{L}+(?:er|ir|re))\b/giu,
  // « j'attaque », « j'enchaîne », « je commence », « je passe à »
  /\bj(?:e\s+|')(attaque|enchaîne|enchaine|commence|passe|reprends|termine|finis|lance|construis|écris|ecris|code|branche|corrige|vérifie|verifie|teste)\b/giu,
  // « je ferai », « je corrigerai » — futur simple
  /\bje\s+(\p{L}+(?:erai|irai|rai))\b/giu,
  // « il reste à faire », « reste à brancher »
  /\breste\s+(?:plus\s+)?(?:à|a)\s+(\p{L}+(?:er|ir|re))\b/giu,
];

/**
 * Les tournures qui ANNULENT l'engagement de la phrase où elles se trouvent.
 *
 * Sans ça, « je ne vais pas construire la mémoire » compterait comme une
 * promesse de la construire — l'exact contraire de ce qui a été dit. Une
 * promesse mal détectée est pire qu'une promesse manquée : elle réclame un
 * travail que personne n'a demandé.
 */
const ANNULATIONS: ReadonlyArray<RegExp> = [
  /\bne\s+(?:vais|ferai|compte)\s+(?:pas|plus|jamais)\b/iu,
  /\bje\s+n(?:e\s+|')\p{L}+\s+(?:pas|plus|jamais)\b/iu,
  /\bau\s+lieu\s+de\b/iu,
  /\bplutôt\s+que\s+de\b/iu,
  /\bsi\s+tu\s+(?:veux|préfères|preferes)\b/iu,
];

/** Découpe en phrases : une promesse vit dans UNE phrase, jamais à cheval. */
function phrasesDe(texte: string): ReadonlyArray<string> {
  return texte
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
}

/**
 * Extrait les promesses d'une réponse d'agent.
 *
 * Les blocs de code sont retirés d'abord : « je vais » dans un commentaire de
 * code n'engage personne, et une chaîne de caractères qui ressemble à une
 * promesse en produirait une fantôme.
 */
export function extrairePromesses(reponse: string): ReadonlyArray<Promesse> {
  const sansCode = reponse.replace(/```[\s\S]*?```/gu, " ").replace(/`[^`\n]*`/gu, " ");
  const promesses: Promesse[] = [];
  const vues = new Set<string>();

  for (const phrase of phrasesDe(sansCode)) {
    if (ANNULATIONS.some((motif) => motif.test(phrase))) continue;
    for (const motif of MOTIFS) {
      // Les motifs sont globaux : remettre l'index à zéro avant chaque phrase,
      // sinon la deuxième phrase serait lue à partir du milieu de la première.
      motif.lastIndex = 0;
      let trouve: RegExpExecArray | null = motif.exec(phrase);
      while (trouve !== null) {
        const action = (trouve[1] ?? "").toLowerCase();
        if (action.length > 0 && !vues.has(`${phrase}|${action}`)) {
          vues.add(`${phrase}|${action}`);
          promesses.push({ phrase, action });
        }
        trouve = motif.exec(phrase);
      }
    }
  }
  return promesses;
}

/**
 * Une promesse est-elle tenue par ce qui a suivi ?
 *
 * Le test est volontairement large : on cherche la trace de l'action dans le
 * travail réellement fait (fichiers touchés, commandes lancées, commits). Une
 * promesse qu'on croit tenue à tort se referme en silence — moins grave que
 * l'inverse, qui harcèlerait l'humain avec des rappels déjà réglés.
 */
export function promesseTenue(
  promesse: Promesse,
  tracesDuTravail: ReadonlyArray<string>,
): boolean {
  const racine = promesse.action.slice(0, Math.max(4, promesse.action.length - 2));
  return tracesDuTravail.some((trace) => trace.toLowerCase().includes(racine));
}
