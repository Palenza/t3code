/**
 * La mémoire — ce que l'humain a dit une fois et qui vaut pour toujours.
 *
 * C'est le pendant de `promesses.ts` : celui-là retient ce que l'AGENT s'est
 * engagé à faire, celui-ci retient ce que l'HUMAIN a posé comme règle. Les
 * deux répondent au même défaut, vu des deux côtés — une phrase importante qui
 * se perd dès que la session se ferme.
 *
 * Le principe vient de claude-mem : capturer pendant, réinjecter au démarrage
 * suivant. Réécrit en interne plutôt qu'adopté, sur consigne explicite du
 * fondateur (« on ne passe jamais par d'autres serveurs, tout est internalisé
 * à vie »). Ce qui vaut chez eux est l'ARCHITECTURE — se brancher sur ce qui
 * existe au lieu de modifier l'hôte — pas leurs 601 fichiers.
 *
 * Détection par MOTIFS, sans modèle, pour la même raison que les promesses :
 * une consigne durable a une forme très reconnaissable en français. « Toujours
 * X », « jamais Y », « arrête de Z », « à partir de maintenant ». Zéro appel,
 * zéro latence, et testable contre de vraies phrases — celles de la session du
 * 29/07 sont dans les tests.
 *
 * Module PUR.
 */

export interface Consigne {
  /** La phrase telle qu'elle a été dite — jamais reformulée, jamais résumée. */
  readonly phrase: string;
  /**
   * `interdit` pèse plus lourd qu'`impose` : une règle enfreinte fait des
   * dégâts, une règle non appliquée fait perdre du temps. Les interdictions
   * remontent donc en tête de la mémoire réinjectée.
   */
  readonly nature: "interdit" | "impose";
}

/**
 * Ce qui INTERDIT — la forme la plus coûteuse à oublier.
 *
 * Le « jamais » NU a été retiré après preuve par exécution (audit 29/07) :
 * en français parlé, « on n'a jamais testé sur Safari » et « mieux vaut tard
 * que jamais » sont descriptifs, pas directifs — chaque session de debug
 * fabriquait des interdits éternels. Un interdit exige la négation ADRESSÉE
 * (« ne … jamais ») ou une forme impérative (« arrête de », « plus jamais »).
 */
const MOTIFS_INTERDIT: ReadonlyArray<RegExp> = [
  /\bne\s+(?:me\s+|te\s+|le\s+|la\s+|les\s+)?\p{L}+\s+(?:pas|plus|jamais)\b/iu,
  /\bne\s+(?:jamais|plus)\s+\p{L}+/iu,
  /\bplus\s+jamais\b/iu,
  /\barrête\s+de\b/iu,
  /\bil\s+ne\s+faut\s+(?:pas|plus|jamais)\b/iu,
  /\bje\s+(?:ne\s+)?veux\s+pas\b/iu,
];

/**
 * Ce qui IMPOSE.
 *
 * « toujours » et « par défaut » ne comptent que dans une phrase ADRESSÉE à
 * l'agent (tu/toi ou impératif) : « ça marche toujours pas » et « le thème
 * sombre est activé par défaut » sont des constats, pas des règles — prouvé
 * par exécution sur de vraies phrases de session (audit 29/07).
 */
const MOTIFS_IMPOSE: ReadonlyArray<RegExp> = [
  /\bà\s+partir\s+de\s+maintenant\b/iu,
  /\bdésormais\b/iu,
  /\bje\s+veux\s+que\s+tu\b/iu,
  /\bil\s+faut\s+(?:que\s+tu|absolument)\b/iu,
  /\bsystématiquement\b/iu,
];

/** Marqueurs faibles : ne valent que si la phrase s'adresse à l'agent. */
const MOTIFS_IMPOSE_FAIBLES: ReadonlyArray<RegExp> = [/\btoujours\b/iu, /\bpar\s+défaut\b/iu];
const PHRASE_ADRESSEE =
  /\b(?:tu|toi|te)\b|^(?:fais|vérifie|verifie|utilise|garde|pense|mets|écris|ecris|préfère|prefere)\b/iu;

/**
 * Ce qui disqualifie une phrase malgré un marqueur.
 *
 * Une consigne parle de la MANIÈRE de travailler, pas du travail en cours.
 * « Il faut que tu corriges ce bouton » porte « il faut que tu » mais ne vaut
 * que pour aujourd'hui — le retenir pour toujours polluerait la mémoire de
 * tâches périmées, et une mémoire pleine de bruit finit ignorée.
 */
const PORTEE_PONCTUELLE: ReadonlyArray<RegExp> = [
  /\b(?:ce|cet|cette|ces)\s+\p{L}+\b/iu,
  /\bici\b/iu,
  /\bmaintenant\s*[,.]?\s*(?:corrige|fais|lance|répare)/iu,
  /\bd'abord\b/iu,
  /\btout\s+de\s+suite\b/iu,
];

/** Une consigne tient en une phrase — jamais à cheval sur deux. */
function phrasesDe(texte: string): ReadonlyArray<string> {
  return texte
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
}

/**
 * Extrait les consignes durables d'un message humain.
 *
 * Le code est retiré d'abord : un « jamais » dans un commentaire ou une chaîne
 * n'est pas une règle de travail.
 */
export function extraireConsignes(message: string): ReadonlyArray<Consigne> {
  const sansCode = message.replace(/```[\s\S]*?```/gu, " ").replace(/`[^`\n]*`/gu, " ");
  const consignes: Consigne[] = [];
  const vues = new Set<string>();

  for (const phrase of phrasesDe(sansCode)) {
    // Trop court pour porter une règle, trop long pour être une consigne :
    // un paragraphe entier retenu tel quel noierait la mémoire.
    if (phrase.length < 12 || phrase.length > 400) continue;
    // Une question n'est jamais une règle — « tu as toujours accès ? » posait
    // une consigne éternelle avant ce garde (audit 29/07).
    if (phrase.endsWith("?")) continue;

    const interdit = MOTIFS_INTERDIT.some((motif) => motif.test(phrase));
    const imposeFort = !interdit && MOTIFS_IMPOSE.some((motif) => motif.test(phrase));
    const imposeFaible =
      !interdit &&
      !imposeFort &&
      PHRASE_ADRESSEE.test(phrase) &&
      MOTIFS_IMPOSE_FAIBLES.some((motif) => motif.test(phrase));
    const impose = imposeFort || imposeFaible;
    if (!interdit && !impose) continue;
    // Le filtre de portée s'applique aux OBLIGATIONS (« il faut que tu
    // corriges ce bouton » = tâche du jour), jamais aux interdictions : une
    // vraie interdiction (« ne fais jamais ça ») gagne toujours sur lui —
    // sinon un simple démonstratif désarmait la consigne fondatrice.
    if (!interdit && PORTEE_PONCTUELLE.some((motif) => motif.test(phrase))) continue;
    if (vues.has(phrase)) continue;
    vues.add(phrase);
    consignes.push({ phrase, nature: interdit ? "interdit" : "impose" });
  }
  return consignes;
}

/**
 * Compose le texte réinjecté au démarrage de la session suivante.
 *
 * Les interdictions d'abord, et le plafond est délibéré : une mémoire qui
 * grossit sans fin finit par coûter plus de contexte qu'elle n'en fait gagner,
 * et c'est le piège exact des systèmes de mémoire automatique. Vingt lignes se
 * lisent ; deux cents se sautent.
 */
export const MAX_CONSIGNES_REINJECTEES = 20;

export function memoireAReinjecter(consignes: ReadonlyArray<Consigne>): string {
  if (consignes.length === 0) return "";
  const triees = [...consignes].sort((gauche, droite) =>
    gauche.nature === droite.nature ? 0 : gauche.nature === "interdit" ? -1 : 1,
  );
  const lignes = triees
    .slice(0, MAX_CONSIGNES_REINJECTEES)
    .map((consigne) => `- ${consigne.phrase}`);
  return [
    "# Ce qui a été dit une fois et vaut toujours",
    "",
    "Consignes posées par l'humain lors de sessions précédentes. Elles priment",
    "sur les habitudes ; en cas de doute, c'est la ligne ci-dessous qui gagne.",
    "",
    ...lignes,
    "",
  ].join("\n");
}
