/**
 * L'EFFORT AUTO — le boost ultrathink décidé à l'envoi, message par message.
 *
 * L'enquête du 02/08 a fermé la voie « router l'effort par tour » : l'effort
 * du SDK est fixé au DÉMARRAGE de session (`startSession` construit les
 * options une fois, les tours coulent dans la session ouverte). Un « Auto »
 * qui prétendrait le faire serait un réglage cosmétique.
 *
 * La seule couture par-message qui existe vraiment est celle du menu
 * Ultrathink : LE MOT, préfixé au texte sortant (`formatOutgoingPrompt` →
 * `applyClaudePromptEffortPrefix`). « Auto » emprunte exactement ce chemin,
 * conditionnellement : effort de base inchangé (high), et le préfixe
 * « Ultrathink: » posé sur les messages structurellement lourds. Pas de
 * descente possible — seulement le boost, et c'est dit tel quel.
 *
 * ── Pourquoi des signaux STRUCTURELS, pas une lecture du sens ─────────────
 *
 * Classer le SENS d'un message est un métier de juge LLM (règle mémoire du
 * projet), et un juge ajouterait un aller-retour avant chaque envoi. Ici la
 * décision est un pari à panne douce : se tromper ne casse rien — un boost
 * manqué répond quand même (à l'effort de base), un boost de trop coûte
 * quelques secondes de réflexion. On s'autorise donc des signaux de FORME,
 * lisibles et testables, réglés CONSERVATEURS : mieux vaut booster rarement
 * et à raison que souvent et au hasard.
 */

/**
 * Longueur à partir de laquelle un message est réputé lourd.
 *
 * Un CHOIX de conception, pas une mesure (il n'existe pas de « bonne »
 * frontière à mesurer) : ~700 caractères = une demande multi-phrases avec du
 * contexte collé, jamais un « renomme cette variable ». Borné par les tests
 * des deux côtés pour que personne ne le dérive en douce vers « toujours ».
 */
export const SEUIL_LOURD_CARACTERES = 700;

/** Nombre de paragraphes à partir duquel la structure signale du lourd. */
export const SEUIL_PARAGRAPHES = 3;

/** La valeur du menu. Volontairement absente de `promptInjectedValues` :
 * choisir Auto ne réécrit JAMAIS le brouillon — la décision se prend à
 * l'envoi, sur le texte final. */
export const EFFORT_AUTO = "auto";

/**
 * `true` si ce message mérite le boost.
 *
 * Signaux, dans l'ordre où ils coûtent le moins à vérifier :
 * - le mot y est déjà (l'utilisateur l'a tapé) → on ne double pas ;
 * - long (≥ SEUIL_LOURD_CARACTERES) ;
 * - structuré (≥ SEUIL_PARAGRAPHES paragraphes) ET porteur d'une question —
 *   une longue liste collée sans question est souvent du contexte, pas une
 *   demande profonde.
 */
export function meriteLeBoost(texte: string): boolean {
  const net = texte.trim();
  if (net.length === 0) return false;
  if (/\bultrathink\b/iu.test(net)) return false;
  if (net.length >= SEUIL_LOURD_CARACTERES) return true;
  const paragraphes = net.split(/\n\s*\n/u).filter((bloc) => bloc.trim().length > 0);
  return paragraphes.length >= SEUIL_PARAGRAPHES && net.includes("?");
}

/**
 * L'effort à injecter dans le texte sortant pour une sélection donnée, ou
 * `null` s'il n'y a rien à injecter. Ne s'applique qu'aux modèles dont les
 * options déclarent le mot (les rails non-Claude ne connaissent pas
 * « Ultrathink: » — le leur préfixer serait du bruit dans leur prompt).
 */
export function effortInjectePourAuto(input: {
  readonly effort: string | null | undefined;
  readonly texte: string;
  readonly modeleConnaitUltrathink: boolean;
}): "ultrathink" | null {
  if (input.effort !== EFFORT_AUTO) return null;
  if (!input.modeleConnaitUltrathink) return null;
  return meriteLeBoost(input.texte) ? "ultrathink" : null;
}
