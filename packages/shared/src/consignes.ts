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
  // « ne … plus/jamais » : ces deux-là portent la DURÉE dans le mot. « on ne
  // passe jamais par d'autres serveurs » est une règle, peu importe le sujet.
  /\bne\s+\p{L}+\s+(?:plus|jamais)\b/iu,
  /\bne\s+(?:me|te|nous|le|la|les|lui|leur|y|en)\s+\p{L}+\s+(?:plus|jamais)\b/iu,
  /\bne\s+(?:jamais|plus)\s+\p{L}+/iu,
  /\bplus\s+jamais\b/iu,
  /\barrête\s+de\b/iu,
  // Impersonnel normatif et volitif : « pas » y est directif malgré tout.
  /\bil\s+ne\s+faut\s+(?:pas|plus|jamais)\b/iu,
  /\bje\s+(?:ne\s+)?veux\s+pas\b/iu,
];

/**
 * « ne … pas » NU — le motif qui a fabriqué 4 des 5 fausses consignes du
 * 31/07, réinjectées dans toutes les sessions de tous les comptes :
 *
 *   « les points ne sont pas à distance égale »   → un CONSTAT
 *   « je ne peux pas rajouter trois points »      → une PLAINTE
 *   « Ça ne rajoute pas de la granularité »       → un CONSTAT
 *   « Je ne peux pas lire proprement »            → un CONSTAT
 *
 * C'est la même leçon que le module avait déjà tirée pour le « jamais » nu,
 * et qu'il n'avait pas appliquée à « pas ». La différence est dans le mot :
 * « jamais » dit TOUJOURS, « pas » dit MAINTENANT. Une négation en « pas »
 * décrit un état ; elle ne devient une règle que si elle est ADRESSÉE.
 *
 * Et l'adresse doit être LOCALE À LA NÉGATION, pas quelque part dans la
 * phrase : « tu peux voir que les points ne sont pas à distance égale »
 * contient « tu », et reste un constat. On exige donc soit un impératif en
 * tête de phrase (« ne me demande pas… »), soit un « tu ne … pas » explicite.
 */
const MOTIFS_INTERDIT_ADRESSES: ReadonlyArray<RegExp> = [
  /^\s*ne\s+(?:me|te|nous|le|la|les|lui|leur|y|en)?\s*\p{L}+\s+pas\b/iu,
  /\btu\s+ne\s+(?:me|te|le|la|les|lui|leur|y|en)?\s*\p{L}+\s+pas\b/iu,
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
/**
 * Une phrase qui s'adresse à l'agent. Quatre formes, et la quatrième s'est
 * fait oublier : l'IMPÉRATIF NÉGATIF — et la cinquième aussi,
 * l'impersonnel normatif « il (ne) faut ».
 *
 * « Ne fais jamais ça », « Ne me demande pas de copier la console » sont les
 * ordres les plus directs qui existent, et ils ne contiennent ni « tu » ni un
 * impératif en tête — ils commencent par la négation. Cinq tests sont passés
 * au rouge quand j'ai exigé l'adresse pour toutes les natures ; ils avaient
 * raison, pas moi. Deux autres ont suivi pour « Il faut absolument que… »
 * et « Il ne faut pas déployer sans mon accord » : en français, l'impersonnel
 * normatif EST une adresse. Ses motifs sont déjà étroits (« il faut que tu »,
 * « il faut absolument », « il ne faut pas/plus/jamais »), donc l'ouvrir ici
 * ne rouvre pas la porte au texte collé. Idem pour le volitif « je (ne)
 * veux » — l'humain qui énonce sa volonté s'adresse bien à quelqu'un.
 *
 * Ce que ce motif teste, au fond, n'est pas « y a-t-il un pronom de deuxième
 * personne » mais « cette phrase exprime-t-elle une VOLONTÉ portant sur le
 * travail ». Sept rouges ont été nécessaires pour en faire le tour ; chacun
 * a ajouté une forme réelle du français, aucune n'a été devinée.
 */
const PHRASE_ADRESSEE =
  /\b(?:tu|toi|te|ton|ta|tes)\b|^(?:fais|vérifie|verifie|utilise|garde|pense|mets|écris|ecris|préfère|prefere)\b|^n[e']\s*(?:me|nous|le|la|les|lui|leur|y|en)?\s*\p{L}+|\bon\s+(?:ne\s+\p{L}+\s+(?:plus|jamais)|doit)\b|\bil\s+(?:ne\s+)?faut\b|\bje\s+(?:ne\s+)?veux\b/iu;

/**
 * LE VOUVOIEMENT DISQUALIFIE — ce n'est pas la voix de l'humain.
 *
 * Il tutoie, toujours ; c'est même une de ses consignes permanentes. Une
 * phrase qui vouvoie vient donc forcément d'AILLEURS : un article collé, une
 * réponse d'un autre assistant, une doc.
 *
 * Le 31/07, coller une conversation entière a fait entrer « Donc au lieu de
 * lutter contre la compaction, exploitez-la » dans les consignes permanentes
 * de TOUS les projets. Le mineur tourne sur le message envoyé en entier — il
 * ne distinguait pas ce que l'humain DIT de ce qu'il COLLE.
 *
 * `assez` et `chez` sont écartés : ce sont les deux mots courants en -ez qui
 * ne sont pas des verbes. Un nom propre en -ez passerait encore, et c'est
 * acceptable — ce motif ne fait que DISQUALIFIER. Rater une consigne coûte
 * une phrase à redire ; en inventer une fausse la grave dans tous les projets
 * et personne ne vient la relire. Le gate se trompe du côté qui n'écrit rien.
 */
const VOUVOIEMENT = /\b(?:vous|votre|vos)\b|\b(?!assez\b|chez\b)\p{L}{3,}ez\b/iu;

/**
 * Ce qui est CITÉ n'est pas ce qui est demandé.
 *
 * « Les règles critiques (« ne jamais pousser sur main », « toujours lancer
 * make lint ») vont dans le CLAUDE.md racine » est devenue une consigne
 * permanente le 31/07 : le « jamais » CITÉ EN EXEMPLE a suffi. Même leçon que
 * pour les promesses le même jour — et on ne touche PAS aux apostrophes, qui
 * portent l'élision française.
 */
function sansCitations(phrase: string): string {
  return phrase.replace(/«[^»]*»/gu, " ").replace(/"[^"\n]*"/gu, " ");
}

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

    // Ce que l'humain COLLE n'est pas ce qu'il DEMANDE. Le mineur reçoit le
    // message entier ; sans ces deux gardes, un article, une doc ou la
    // réponse d'un autre assistant deviennent loi permanente dans tous les
    // projets — constaté le 31/07 sur cinq lignes d'un coup.
    if (VOUVOIEMENT.test(phrase)) continue;
    const jugee = sansCitations(phrase).trim();

    const interdit =
      MOTIFS_INTERDIT.some((motif) => motif.test(jugee)) ||
      MOTIFS_INTERDIT_ADRESSES.some((motif) => motif.test(jugee));
    const imposeFort = !interdit && MOTIFS_IMPOSE.some((motif) => motif.test(jugee));
    const imposeFaible =
      !interdit && !imposeFort && MOTIFS_IMPOSE_FAIBLES.some((motif) => motif.test(jugee));
    const impose = imposeFort || imposeFaible;
    if (!interdit && !impose) continue;
    // L'ADRESSE EST EXIGÉE POUR TOUTES LES NATURES, plus seulement pour les
    // marqueurs faibles. C'était la porte d'entrée du texte tiers : « L'état
    // ne dépend plus du résumé » et « À utiliser systématiquement pour :
    // exploration de codebase » portent un marqueur fort et ne s'adressent à
    // personne. Une consigne parle À l'agent ; une phrase qui n'adresse
    // personne décrit un monde, elle ne demande rien.
    if (!PHRASE_ADRESSEE.test(jugee)) continue;
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
  // La PROVENANCE et les LIMITES sont dites dans le bloc lui-même.
  //
  // Ce fichier est relu au démarrage de chaque session de chaque compte — donc
  // aussi par les sessions qui travaillent sur un AUTRE projet que celui où la
  // phrase a été prononcée. Le texte revendiquait la primauté sans dire d'où il
  // venait : une règle lâchée en déboguant l'interface du cockpit s'annonçait
  // gagnante face aux règles écrites et versionnées d'un projet qui n'a rien à
  // voir. C'est la seule collision entre les deux mondes, et elle se répare par
  // une phrase, pas par une machinerie.
  //
  // La hiérarchie tenue : les habitudes cèdent devant ce que l'humain a dit ;
  // ce que l'humain a dit ici cède devant les règles écrites du projet courant,
  // qui sont délibérées, versionnées et relues. Et une contradiction se DIT au
  // lieu de se trancher en silence — c'est le seul cas où l'on ne peut pas
  // deviner juste.
  return [
    "# Ce qui a été dit une fois et vaut toujours",
    "",
    "Consignes posées par l'humain dans T3 Code lors de sessions précédentes,",
    "TOUS PROJETS CONFONDUS : certaines ont pu être dites en travaillant sur un",
    "autre projet que celui-ci.",
    "",
    "Elles priment sur tes habitudes. Elles ne priment PAS sur les règles écrites",
    "du projet où tu travailles (son CLAUDE.md) : celles-là sont délibérées et",
    "versionnées. Si l'une de ces lignes contredit une règle du projet, DIS-LE au",
    "lieu de trancher en silence.",
    "",
    ...lignes,
    "",
  ].join("\n");
}
