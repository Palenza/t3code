/**
 * DÉCOUPER UN FLUX DE TEXTE EN UNITÉS PRONONÇABLES.
 *
 * Chantier n°66, la moitié qui compte. Aspiré de leur TTS en streaming — mais
 * pas leur pile : T3 est Electron, donc Chromium, donc `speechSynthesis` est
 * déjà là. Zéro dépendance, zéro modèle à télécharger, et les voix système de
 * macOS sont excellentes. Ce qu'il fallait écrire n'est pas le moteur, c'est
 * ce qu'on lui donne à dire.
 *
 * ── Pourquoi le découpage est TOUT le problème ────────────────────────────
 *
 * L'agent écrit en flux. Attendre la fin du message pour parler ferait perdre
 * l'intérêt du streaming : on entendrait la réponse une fois qu'on a fini de
 * la lire. Parler à chaque fragment donnerait un hachis — le moteur redémarre
 * sa prosodie à chaque appel, et « il faut. corriger. le. bug. » n'est pas une
 * phrase, c'est une liste.
 *
 * Il faut donc rendre une unité DÈS qu'elle est complète, et jamais avant.
 * Tout est là.
 *
 * ── Ce qui casse une détection naïve de fin de phrase ─────────────────────
 *
 * Un point ne termine pas une phrase quand il est dans :
 *   · une abréviation — « M. Dupont », « etc. », « cf. », « p. ex. » ;
 *   · un nombre — « 3.14 », « v0.0.51 » ;
 *   · un nom de fichier — « config.ts », « README.md » ;
 *   · une adresse — « api.osv.dev ».
 * Et à l'inverse, un saut de ligne double termine un paragraphe même sans
 * ponctuation — un titre, un élément de liste.
 *
 * ── Ce qu'on ne prononce PAS ──────────────────────────────────────────────
 *
 * Un bloc de code lu à voix haute est inaudible : « accolade ouvrante retour
 * chariot const espace... ». On le remplace par une mention de sa taille, ce
 * qui est l'information utile à l'oreille. Même chose pour les URL longues.
 *
 * Module PUR : il ne parle pas, il découpe. Le moteur est appelé ailleurs, et
 * c'est ce qui rend ce découpage testable sans carte son.
 */

/** Ce qui termine une phrase, quand ce n'est pas une abréviation. */
const FIN_DE_PHRASE = /[.!?…](?:["»)\]]*)(?=\s|$)/u;

/**
 * Les abréviations où le point ne termine rien.
 *
 * Liste FERMÉE et française d'abord : une règle générique (« un point suivi
 * d'une minuscule ») se tromperait sur « fin. Ensuite » autant que sur
 * « M. dupont », et une liste courte qu'on relit vaut mieux qu'une heuristique
 * qu'on subit.
 */
const ABREVIATIONS = [
  "m.",
  "mm.",
  "mme.",
  "mlle.",
  "dr.",
  "pr.",
  "st.",
  "etc.",
  "cf.",
  "ex.",
  "p. ex.",
  "c.-à-d.",
  "env.",
  "cad.",
  "vs.",
  "no.",
  "n°.",
  "fig.",
  "art.",
  "al.",
];

/** Un point entre deux chiffres, ou dans un nom qui ressemble à un fichier. */
const POINT_TECHNIQUE = /(?:\d\.\d)|(?:\w\.(?:ts|tsx|js|json|md|py|sh|toml|yml|yaml|lock)\b)/iu;

/** Un bloc de code délimité. On ne le prononce pas, on le résume. */
const BLOC_DE_CODE = /```[\s\S]*?```/gu;

/** Une URL longue. « h t t p s deux-points slash slash » n'apprend rien. */
const URL = /https?:\/\/\S+/gu;

export interface Decoupe {
  /** Les unités prêtes à prononcer, dans l'ordre. */
  readonly prets: ReadonlyArray<string>;
  /** Ce qui reste en attente — incomplet, on n'y touche pas encore. */
  readonly reste: string;
}

/**
 * Remplace ce qui ne se prononce pas par ce qu'on veut entendre à la place.
 *
 * On dit la TAILLE d'un bloc de code plutôt que son contenu : c'est ce qu'une
 * oreille peut faire de l'information. « Un bloc de douze lignes » se
 * comprend ; le bloc lu à voix haute, non.
 */
export function pourLOreille(texte: string): string {
  return texte
    .replace(BLOC_DE_CODE, (bloc) => {
      const lignes = bloc.split("\n").length - 2;
      return lignes <= 1 ? " un extrait de code. " : ` un bloc de ${String(lignes)} lignes. `;
    })
    .replace(URL, " un lien. ")
    .replace(/[*_`#>]/gu, "")
    .replace(/[ \t]+/gu, " ")
    .trim();
}

/** Le texte finit-il par une abréviation ? Alors le point ne termine rien. */
function finitParUneAbreviation(texte: string): boolean {
  const bas = texte.toLowerCase();
  return ABREVIATIONS.some((abbr) => bas.endsWith(abbr));
}

/**
 * Découpe ce qui est PRÊT, garde le reste.
 *
 * Appelée à chaque fragment reçu : on lui redonne le reste précédent collé au
 * nouveau fragment, et elle rend ce qui peut partir. Une unité n'est jamais
 * rendue deux fois, et jamais rendue à moitié.
 */
export function decouper(texte: string): Decoupe {
  const prets: string[] = [];
  let reste = texte;

  // Un paragraphe se termine sur une ligne vide, même sans ponctuation : un
  // titre ou un élément de liste n'a pas de point, et attendre le sien
  // laisserait la voix muette jusqu'au paragraphe suivant.
  for (;;) {
    const paragraphe = reste.indexOf("\n\n");
    if (paragraphe === -1) break;
    const unite = reste.slice(0, paragraphe).trim();
    if (unite.length > 0) prets.push(unite);
    reste = reste.slice(paragraphe + 2);
  }

  // On avance un DÉCALAGE de recherche au lieu de découper puis recoller : une
  // abréviation fait simplement chercher la fin de phrase plus loin, sans que
  // le texte soit jamais coupé ni réassemblé. La première version recollait
  // `candidat.trim() + suite`, ce qui soudait « etc. » à « puis » — un espace
  // perdu, et la phrase prononcée devenait « etc.puis ».
  let depuis = 0;
  for (;;) {
    const trouve = FIN_DE_PHRASE.exec(reste.slice(depuis));
    if (trouve === null) break;
    const coupe = depuis + trouve.index + trouve[0].length;
    const candidat = reste.slice(0, coupe);

    // Le point ne termine rien ici : on cherche la prochaine fin plus loin,
    // plutôt que de couper au milieu d'un « M. Dupont » ou d'un « config.ts ».
    if (finitParUneAbreviation(candidat.trimEnd()) || POINT_TECHNIQUE.test(candidat.slice(-12))) {
      depuis = coupe;
      continue;
    }

    const unite = candidat.trim();
    if (unite.length > 0) prets.push(unite);
    reste = reste.slice(coupe);
    depuis = 0;
  }

  return { prets, reste };
}

/**
 * Ce qu'il reste à dire quand le flux se termine.
 *
 * Sans ça, une réponse qui finit sans ponctuation — un titre, un bout de
 * liste — resterait muette pour toujours. La fin du flux VAUT une fin de
 * phrase : c'est le seul moment où on en est sûr.
 */
export function vider(reste: string): ReadonlyArray<string> {
  const dernier = reste.trim();
  return dernier.length > 0 ? [dernier] : [];
}
