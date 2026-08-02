/**
 * LIRE UNE MISE À JOUR TELEGRAM — la partie où sont les bugs.
 *
 * Chantier n°42, premier adaptateur. Le reste de l'adaptateur est deux appels
 * HTTP ; c'est ICI que tout se joue, parce que « une mise à jour Telegram »
 * n'est pas une forme mais huit.
 *
 * ── Les formes, et pourquoi elles comptent ────────────────────────────────
 *
 * · `message` — le cas courant, avec `from` ;
 * · `channel_post` — une diffusion de canal : il n'y a PAS de `from`. Un
 *   canal n'a pas d'expéditeur, il a un émetteur ;
 * · `sender_chat` — un administrateur anonyme d'un groupe : `from` est absent
 *   et l'identité est celle du GROUPE, pas d'une personne ;
 * · `edited_message` — un message corrigé. On le lit comme un message neuf :
 *   quelqu'un qui corrige sa demande veut que la correction compte ;
 * · `message_thread_id` — le sujet dans un forum. Ce n'est PAS le canal : le
 *   n°39 en dépend, un sujet supprimé ne tue pas le groupe.
 *
 * Les trois premiers cas donnent tous un message SANS expéditeur, et c'est
 * exactement pourquoi `QuiPeutParler.ts` autorise par CANAL avant d'autoriser
 * par personne. Les deux modules ont été écrits dans cet ordre pour ça.
 *
 * ── Ce qu'on ne lit PAS ───────────────────────────────────────────────────
 *
 * Tout le reste : réactions, votes, membres qui entrent ou sortent, requêtes
 * en ligne. Rendre `null` est la bonne réponse — un événement qu'on ne
 * comprend pas ne doit pas devenir un message vide adressé à l'agent.
 *
 * Module PUR.
 */

import type { MessageEntrant } from "../Plateforme.ts";

const NOM = "telegram";

/** Lit un champ d'un objet inconnu sans jamais lever. */
const dans = (valeur: unknown, cle: string): unknown =>
  typeof valeur === "object" && valeur !== null
    ? (valeur as Record<string, unknown>)[cle]
    : undefined;

const enTexte = (valeur: unknown): string | null =>
  typeof valeur === "string" && valeur.length > 0 ? valeur : null;

/**
 * Un identifiant Telegram arrive en NOMBRE, et les identifiants de groupe
 * sont négatifs et longs (`-1001234567890`). On le rend en chaîne parce que
 * c'est ainsi qu'il sert de clé d'autorisation, et parce qu'un `number` en
 * JavaScript perdrait de la précision au-delà de 2^53 — ce que Telegram
 * approche déjà pour certains canaux.
 */
const enIdentifiant = (valeur: unknown): string | null => {
  if (typeof valeur === "string" && valeur.length > 0) return valeur;
  if (typeof valeur === "number" && Number.isFinite(valeur)) return String(valeur);
  return null;
};

/**
 * Normalise une mise à jour, ou rend `null`.
 *
 * `null` couvre tout ce qui n'est pas un message adressé à l'agent : une
 * réaction, un membre qui part, une forme qu'on ne connaît pas. C'est la
 * bonne réponse — un événement incompris ne doit jamais devenir un message
 * vide.
 */
export function lireUneMiseAJour(brut: unknown): MessageEntrant | null {
  // `edited_message` est lu comme un message neuf : quelqu'un qui corrige sa
  // demande veut que la correction compte, pas qu'elle soit ignorée.
  const message =
    dans(brut, "message") ??
    dans(brut, "edited_message") ??
    dans(brut, "channel_post") ??
    dans(brut, "edited_channel_post");
  if (message === undefined) return null;

  const texte = enTexte(dans(message, "text")) ?? enTexte(dans(message, "caption"));
  if (texte === null) return null;

  const canal = enIdentifiant(dans(dans(message, "chat"), "id"));
  if (canal === null) return null;

  // L'expéditeur peut manquer de trois façons distinctes, et toutes sont
  // légitimes. On ne se rabat PAS sur l'identifiant du groupe : ce serait
  // faire passer « le groupe » pour une personne, et une autorisation par
  // personne accordée au groupe ouvrirait le groupe entier.
  const expediteur = enIdentifiant(dans(dans(message, "from"), "id"));

  const fil = enIdentifiant(dans(message, "message_thread_id"));

  return {
    provenance: { plateforme: NOM, canal, expediteur },
    texte,
    ...(fil === null ? {} : { fil }),
  };
}
