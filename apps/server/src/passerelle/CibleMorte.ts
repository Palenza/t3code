/**
 * UNE CIBLE QUI N'EXISTE PLUS NE SE RÉESSAIE PAS INDÉFINIMENT.
 *
 * Chantier n°39, la décision. Aspiré de `gateway/dead_targets.py` et
 * `delivery.py`.
 *
 * ── Pourquoi ça compte, et pas seulement pour l'élégance ──────────────────
 *
 * Un groupe supprimé, un bot expulsé, un compte désactivé : la cible est
 * définitivement injoignable. Réessayer à chaque tour brûle une tentative
 * dans l'enveloppe de contrôle d'inondation de la plateforme — celle-là même
 * que `DebiterVersUneMessagerie.ts` ménage. Autrement dit, une cible morte
 * non détectée dégrade la livraison vers les cibles VIVANTES.
 *
 * ── La portée, délibérément ÉTROITE ──────────────────────────────────────
 *
 * On ne retient qu'une mort de CANAL ENTIER : « interdit » et « canal
 * introuvable ». Un fil ou un sujet supprimé n'est PAS une cible morte —
 * l'adaptateur s'en remet en réessayant sans référence au message parent, et
 * un sujet effacé ne dit rien du groupe qui le contient.
 *
 * C'est une distinction qu'on ne devine pas : les deux erreurs se ressemblent
 * (« not found »), et confondre les deux ferait déclarer mort un groupe
 * parfaitement vivant dont on a juste effacé un sujet.
 *
 * ── AUTO-GUÉRISON — la moitié qu'on oublie ───────────────────────────────
 *
 * Toute livraison RÉUSSIE efface la marque. Quelqu'un qui remet le bot dans
 * son groupe repart sans rien nettoyer à la main. Sans ça, la protection
 * devient une punition définitive pour une panne temporaire, et il faut un
 * geste d'administration que personne ne connaît.
 *
 * Module PUR.
 */

/**
 * Ce que la plateforme a répondu, ramené à ce qui change notre conduite.
 *
 * Même doctrine que `classerEchec` pour les comptes : on pilote sur la NATURE
 * de l'échec, jamais sur « ça a raté ». Sans ce tri, un hoquet réseau
 * condamnerait une cible pour toujours.
 */
export type NatureDEchec =
  /** Le canal entier est injoignable : bot expulsé, groupe supprimé. */
  | "canal-mort"
  /** Le FIL visé n'existe plus, mais le canal va bien. Réessayer sans lui. */
  | "fil-disparu"
  /** Contrôle d'inondation : ralentir, surtout pas réessayer tout de suite. */
  | "trop-vite"
  /** Hoquet réseau ou 5xx : réessayer. */
  | "transitoire"
  /** Message malformé : réessayer à l'identique échouera pareil. */
  | "notre-faute";

/** Les formes d'erreur qui disent une mort de canal, et RIEN d'autre. */
const CANAL_MORT = [
  "forbidden",
  "bot was blocked",
  "bot was kicked",
  "chat not found",
  "group chat was deleted",
  "user is deactivated",
  "channel_not_found",
  "account_inactive",
];

/** Un fil ou un sujet disparu. Le canal, lui, est vivant. */
const FIL_DISPARU = [
  "message thread not found",
  "message to reply not found",
  "topic_deleted",
  "thread_not_found",
];

const TROP_VITE = ["too many requests", "flood", "retry after", "rate_limited", "ratelimited"];

const NOTRE_FAUTE = ["bad request", "message is too long", "invalid", "can't parse"];

const contient = (texte: string, motifs: ReadonlyArray<string>): boolean =>
  motifs.some((motif) => texte.includes(motif));

/**
 * De quelle nature est cet échec ?
 *
 * L'ordre compte : `fil-disparu` est cherché AVANT `canal-mort`, parce que
 * « message thread not found » contient « not found ». Chercher la mort du
 * canal en premier condamnerait un groupe vivant dont on a effacé un sujet.
 */
export function natureDeLEchec(erreur: string): NatureDEchec {
  const bas = erreur.toLowerCase();
  if (contient(bas, FIL_DISPARU)) return "fil-disparu";
  if (contient(bas, CANAL_MORT)) return "canal-mort";
  if (contient(bas, TROP_VITE)) return "trop-vite";
  if (contient(bas, NOTRE_FAUTE)) return "notre-faute";
  return "transitoire";
}

export type Suite =
  /** Renvoyer tel quel, après l'attente indiquée. */
  | { readonly quoi: "reessayer"; readonly dansSecondes: number; readonly pourquoi: string }
  /** Renvoyer SANS la référence au fil : c'est elle qui manquait. */
  | { readonly quoi: "reessayer-sans-le-fil"; readonly pourquoi: string }
  /** Marquer la cible morte et cesser. */
  | { readonly quoi: "abandonner-la-cible"; readonly pourquoi: string }
  /** Cesser sans condamner la cible : c'est notre message qui est mauvais. */
  | { readonly quoi: "abandonner-le-message"; readonly pourquoi: string };

/** Au-delà, un « transitoire » qui persiste n'est plus transitoire. */
export const ESSAIS_MAX = 4;

/**
 * Que faire après cet échec ?
 *
 * `essaisFaits` compte les tentatives DÉJÀ faites pour ce message.
 */
export function apresUnEchec(erreur: string, essaisFaits: number): Suite {
  const nature = natureDeLEchec(erreur);

  if (nature === "canal-mort") {
    return {
      quoi: "abandonner-la-cible",
      pourquoi:
        "le canal entier est injoignable — bot expulsé, groupe supprimé ou compte désactivé. Réessayer à chaque tour brûlerait des tentatives dans l'enveloppe d'inondation de la plateforme, au détriment des cibles vivantes. La marque s'effacera d'elle-même à la première livraison réussie.",
    };
  }

  if (nature === "fil-disparu") {
    return {
      quoi: "reessayer-sans-le-fil",
      pourquoi:
        "le fil visé n'existe plus, mais le canal va bien. Un sujet effacé ne dit RIEN du groupe qui le contient — condamner la cible ici serait la punir pour une suppression qui ne la concerne pas.",
    };
  }

  if (nature === "notre-faute") {
    return {
      quoi: "abandonner-le-message",
      pourquoi:
        "le message est refusé pour sa forme — trop long, mal échappé. Le renvoyer à l'identique échouera pareil, et la cible n'y est pour rien : elle reste vivante.",
    };
  }

  if (essaisFaits >= ESSAIS_MAX) {
    return {
      quoi: "abandonner-le-message",
      pourquoi: `${String(essaisFaits)} tentatives sans succès (max ${String(ESSAIS_MAX)}). Un « transitoire » qui persiste n'est plus transitoire, et la cible n'est pas condamnée pour autant.`,
    };
  }

  // Contrôle d'inondation : on attend PLUS longtemps qu'un hoquet ordinaire,
  // parce que la plateforme a explicitement demandé de ralentir.
  const attente = nature === "trop-vite" ? 5 * 2 ** essaisFaits : Math.min(2 ** essaisFaits, 30);
  return {
    quoi: "reessayer",
    dansSecondes: attente,
    pourquoi:
      nature === "trop-vite"
        ? `contrôle d'inondation : on attend ${String(attente)} s, parce que la plateforme a demandé de ralentir et que réessayer vite garantirait le refus suivant`
        : `échec transitoire, tentative ${String(essaisFaits + 1)}/${String(ESSAIS_MAX)} dans ${String(attente)} s`,
  };
}

/**
 * Une livraison réussie efface la marque de mort. TOUJOURS.
 *
 * C'est la moitié qu'on oublie. Sans elle, quelqu'un qui remet le bot dans
 * son groupe reste bloqué jusqu'à un geste d'administration que personne ne
 * connaît — et la protection devient une punition définitive pour une panne
 * temporaire.
 */
export function apresUneReussite(mortes: ReadonlySet<string>, cible: string): ReadonlySet<string> {
  if (!mortes.has(cible)) return mortes;
  const vivantes = new Set(mortes);
  vivantes.delete(cible);
  return vivantes;
}
