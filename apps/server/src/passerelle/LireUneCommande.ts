/**
 * UNE COMMANDE, UN MESSAGE, OU RIEN QUI NOUS CONCERNE.
 *
 * Chantiers n°44 et n°45. Avant qu'un message atteigne l'agent, il faut savoir
 * si c'en est un — ou si c'est une commande de passerelle, ou si ce n'est même
 * pas pour nous.
 *
 * ── Le piège des groupes, et il est spécifique aux messageries ────────────
 *
 * Dans un salon partagé, plusieurs bots écoutent. Telegram le sait et suffixe
 * les commandes : `/start@monbot`. Un bot qui ignore le suffixe répond aux
 * commandes de ses voisins — deux agents qui parlent en même temps, et
 * l'humain ne comprend pas lequel lui a répondu.
 *
 * L'inverse mord aussi : `/aide` SANS suffixe, dans un salon privé, est bien
 * pour nous. Exiger le suffixe partout rendrait le bot muet en tête-à-tête.
 *
 * ── Ce qui n'est PAS une commande ─────────────────────────────────────────
 *
 * Un message qui commence par une barre oblique sans être une commande
 * connue : `/usr/local/bin`, `/home/enzo`, une expression régulière. Les
 * traiter comme des commandes inconnues ferait répondre « commande inconnue »
 * à quelqu'un qui collait un chemin — le genre de réponse qui apprend à ne
 * plus rien coller.
 *
 * Module PUR.
 */

/** Les commandes que la passerelle traite ELLE-MÊME, sans réveiller l'agent. */
export const COMMANDES = ["platforms", "handoff", "sethome", "clarify", "aide"] as const;
export type NomDeCommande = (typeof COMMANDES)[number];

export type Lecture =
  /** Une commande de passerelle, avec ce qui la suit. */
  | { readonly quoi: "commande"; readonly nom: NomDeCommande; readonly reste: string }
  /** Un message ordinaire, à donner à l'agent tel quel. */
  | { readonly quoi: "message"; readonly texte: string }
  /** Adressée à un autre bot du salon. On ne répond RIEN. */
  | { readonly quoi: "pas-pour-nous"; readonly destinataire: string };

const estConnue = (mot: string): mot is NomDeCommande =>
  (COMMANDES as ReadonlyArray<string>).includes(mot);

/**
 * Que faut-il faire de ce message ?
 *
 * `notreNom` est le nom du bot sur cette plateforme, sans arobase. Il sert
 * uniquement à trancher les commandes suffixées d'un salon partagé.
 */
export function lireUneCommande(texte: string, notreNom: string): Lecture {
  const propre = texte.trim();
  if (!propre.startsWith("/")) return { quoi: "message", texte: propre };

  const espace = propre.search(/\s/u);
  const premier = espace === -1 ? propre.slice(1) : propre.slice(1, espace);
  const reste = espace === -1 ? "" : propre.slice(espace + 1).trim();

  const arobase = premier.indexOf("@");
  const nom = (arobase === -1 ? premier : premier.slice(0, arobase)).toLowerCase();
  const vise = arobase === -1 ? null : premier.slice(arobase + 1);

  // Suffixée à quelqu'un d'autre : on se tait. Répondre ici ferait parler deux
  // agents en même temps, et l'humain ne saurait pas lequel lui a répondu.
  if (vise !== null && vise.toLowerCase() !== notreNom.toLowerCase()) {
    return { quoi: "pas-pour-nous", destinataire: vise };
  }

  // Une barre oblique ne fait pas une commande. `/usr/local/bin` collé dans un
  // salon est un chemin, pas une demande — répondre « commande inconnue »
  // apprendrait à ne plus rien coller.
  if (!estConnue(nom)) return { quoi: "message", texte: propre };

  return { quoi: "commande", nom, reste };
}

/**
 * Ce que `/aide` répond.
 *
 * Écrit ici et pas dans l'adaptateur : la liste doit être la même sur toutes
 * les plateformes, et une aide qui diverge d'une messagerie à l'autre est
 * pire qu'une aide absente — elle apprend des commandes qui n'existent pas
 * ailleurs.
 */
export const AIDE = [
  "/platforms — les plateformes connectées et leur état",
  "/handoff — reprendre cette conversation depuis une autre surface",
  "/sethome — choisir le dossier de travail par défaut",
  "/clarify — répondre à une question que l'agent a posée",
  "/aide — ceci",
].join("\n");
