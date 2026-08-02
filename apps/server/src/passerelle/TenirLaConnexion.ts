/**
 * TENIR LA CONNEXION — et savoir quand elle est morte sans le dire.
 *
 * Chantier n°43. Dernière décision de la passerelle avant l'adaptateur réel.
 *
 * ── Les deux façons dont une connexion échoue ─────────────────────────────
 *
 * · **Elle tombe.** C'est le cas facile : on le voit, on reconnecte.
 * · **Elle reste ouverte et ne dit plus rien.** Un mandataire l'a coupée sans
 *   fermer la socket, le réseau a changé sous nos pieds. La socket paraît
 *   vivante, aucune erreur n'arrive, et le bot est muet pendant des heures
 *   sans que rien ne l'indique.
 *
 * Le second cas est celui qui coûte, et il ne se détecte QUE par le silence :
 * une connexion saine reçoit quelque chose régulièrement — un message, un
 * accusé, une réponse vide de long-poll. Un silence trop long est le seul
 * signal disponible.
 *
 * ── Ce qui ne doit JAMAIS se réessayer en boucle ──────────────────────────
 *
 * Un jeton invalide ou révoqué. Réessayer ne le rendra pas valide, et la
 * plateforme finit par limiter voire bannir le bot pour ses tentatives. C'est
 * la même distinction que partout ailleurs dans ce dépôt : on pilote sur la
 * NATURE de l'échec, jamais sur « ça a raté ».
 *
 * ── Le décalage aléatoire, et pourquoi il n'est pas cosmétique ────────────
 *
 * Si plusieurs instances redémarrent ensemble — une machine qui reboote, une
 * coupure réseau générale — un repli purement exponentiel les fait toutes
 * réessayer à la même seconde. On ajoute donc un décalage, et il vient de
 * l'appelant : ce module reste PUR, et une horloge cachée le rendrait
 * intestable.
 *
 * Module PUR.
 */

/** Ce qui a interrompu la connexion, réduit à ce qui change notre conduite. */
export type Rupture =
  /** Jeton refusé, bot supprimé. Réessayer ne changera rien. */
  | "jeton-mort"
  /** La plateforme dit de ralentir. */
  | "trop-vite"
  /** Coupure, 5xx, socket fermée. On reconnecte. */
  | "transitoire"
  /** Rien ne casse, mais rien n'arrive non plus. */
  | "silence";

const JETON_MORT = ["unauthorized", "401", "invalid token", "bot was deleted", "token_revoked"];
const TROP_VITE = ["429", "too many requests", "flood", "rate_limited"];

/**
 * Au-delà de ce silence, on considère la connexion morte et on reconnecte.
 *
 * Reçu : Telegram répond à un long-poll au plus tard au bout de son propre
 * délai (50 s par défaut). Un silence de 90 s ne peut donc pas être normal —
 * c'est un fil-piège posé bien au-delà du sain, pas une supposition.
 */
export const SILENCE_SUSPECT_SECONDES = 90;

export function natureDeLaRupture(erreur: string): Rupture {
  const bas = erreur.toLowerCase();
  if (JETON_MORT.some((motif) => bas.includes(motif))) return "jeton-mort";
  if (TROP_VITE.some((motif) => bas.includes(motif))) return "trop-vite";
  return "transitoire";
}

export type Conduite =
  | { readonly quoi: "reconnecter"; readonly dansSecondes: number; readonly pourquoi: string }
  /** Cesser, et le DIRE. La passerelle est hors service jusqu'à intervention. */
  | { readonly quoi: "renoncer"; readonly pourquoi: string; readonly quoiFaire: string };

/** Le repli plafonne : au-delà, attendre plus longtemps n'apprend rien. */
export const ATTENTE_MAX = 300;

/**
 * Que faire après une rupture ?
 *
 * `decalage` est un nombre entre 0 et 1 fourni par l'appelant — c'est lui qui
 * porte l'aléatoire, pour que ce module reste pur et testable. Il évite que
 * plusieurs instances reconnectées ensemble frappent à la même seconde.
 */
export function apresUneRupture(rupture: Rupture, tentatives: number, decalage = 0): Conduite {
  if (rupture === "jeton-mort") {
    return {
      quoi: "renoncer",
      pourquoi:
        "le jeton est refusé — invalide, révoqué, ou le bot a été supprimé. Reconnecter ne le rendra pas valide, et s'acharner fait limiter puis bannir le bot par la plateforme.",
      // A7 : un refus se répare, donc il dit par où.
      quoiFaire:
        "Vérifie le jeton du bot et remets-le en configuration. La passerelle restera hors service jusque-là — délibérément, plutôt que de tourner en boucle en silence.",
    };
  }

  const base = rupture === "trop-vite" ? 30 : 2;
  const attente = Math.min(base * 2 ** tentatives, ATTENTE_MAX);
  // Le décalage est une FRACTION de l'attente, pas une constante : à 2 s il
  // faut disperser sur 2 s, à 300 s sur 300 s.
  const avecDecalage = Math.round(attente * (1 + decalage * 0.5));

  return {
    quoi: "reconnecter",
    dansSecondes: avecDecalage,
    pourquoi:
      rupture === "silence"
        ? `aucune nouvelle depuis plus de ${String(SILENCE_SUSPECT_SECONDES)} s : la connexion paraît ouverte mais ne dit plus rien. C'est la panne qui ne se voit pas — un mandataire l'a coupée sans fermer la socket.`
        : rupture === "trop-vite"
          ? `la plateforme demande de ralentir : on attend ${String(avecDecalage)} s avant de revenir`
          : `rupture transitoire, reconnexion ${String(tentatives + 1)} dans ${String(avecDecalage)} s`,
  };
}

/**
 * La connexion est-elle silencieusement morte ?
 *
 * Le seul signal disponible pour le cas qui coûte : une connexion saine reçoit
 * quelque chose régulièrement. Le silence est la panne.
 */
export function estSilencieusementMorte(secondesDepuisLaDerniereNouvelle: number): boolean {
  return secondesDepuisLaDerniereNouvelle > SILENCE_SUSPECT_SECONDES;
}
