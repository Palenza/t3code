/**
 * ANNONCER N'EST PAS FAIRE — le premier garde-produit de Raptor.
 *
 * La classe d'erreur : l'agent termine son tour sur « je vais maintenant… »,
 * « j'enchaîne… », « next, I'll… » — et rend la main. Le message se LIT comme
 * du travail en cours ; le tour est fini ; l'humain attend, rien n'avance.
 * C'est une fausse promesse invisible : rien ne casse, aucun rouge, juste du
 * temps humain perdu à attendre un geste qui ne viendra pas.
 *
 * Le remède est mécanique, pas textuel (doctrine du fork : la règle texte est
 * interdite si un hook est possible). Le hook `Stop` du SDK reçoit le dernier
 * message assistant ; si la FIN est une promesse, on refuse l'arrêt avec la
 * raison — et le modèle continue, c'est-à-dire FAIT ce qu'il venait
 * d'annoncer.
 *
 * ── Les trois garde-fous contre le sur-blocage ────────────────────────────
 *
 * Un garde qui crie à tort apprend à être ignoré — pire, ici il brûlerait un
 * tour de quota à chaque faux positif. Donc :
 *
 *   1. `stop_hook_active` → JAMAIS de second blocage (le SDK le lève quand un
 *      hook Stop a déjà refusé une fois) : aucune boucle possible, coût
 *      maximal d'un faux positif = UNE relance.
 *   2. Du travail de fond en vol ou un réveil programmé → silence. « Je
 *      surveille la CI » suivi d'une pause N'EST PAS une fausse promesse —
 *      la session attend d'être réveillée.
 *   3. Une fin en QUESTION → silence. Rendre la main pour demander est un
 *      arrêt légitime, quel que soit le futur employé dans la phrase.
 *
 * Module PUR : il juge un texte, il ne connaît ni le SDK ni les sessions.
 */

/**
 * Les formes de promesse, ancrées sur du FUTUR IMMÉDIAT d'action.
 *
 * Volontairement étroites : « je vais » nu attrape trop (« je vais te
 * l'expliquer » suivi de l'explication) ; on exige la première personne ET un
 * marqueur d'enchaînement. Chaque motif vient d'une occurrence réelle vue en
 * session, pas d'une supposition.
 */
const PROMESSES: ReadonlyArray<RegExp> = [
  /\bj'encha[îi]ne\b/iu,
  /\bje (?:vais|m'apprête à) maintenant\b/iu,
  /\bje m'y mets\b/iu,
  /\bje (?:commence|passe) (?:tout de suite|maintenant)\b/iu,
  /\bprochaine étape\s*:/iu,
  /\bje te (?:reviens|tiens au courant)\b/iu,
  /\b(?:i|we)(?:'|')ll (?:now|start|begin|get started|proceed)\b/iu,
  /\b(?:i|we) will now\b/iu,
  /\blet me now\b/iu,
  /\bnext,? (?:i(?:'|')ll|let(?:'|')s)\b/iu,
  /\bstarting (?:now|on that)\b/iu,
];

/**
 * La DERNIÈRE PHRASE du texte — c'est elle, et elle seule, qu'on juge.
 *
 * Première version : une fenêtre des 240 derniers caractères. Fausse sur les
 * messages courts, où elle avalait une promesse du MILIEU suivie du travail
 * effectivement fait (« Je vais maintenant détailler : … Voilà le détail,
 * terminé. ») — attrapée par le test avant d'atteindre qui que ce soit. La
 * promesse qui ment est celle sur laquelle le message SE TERMINE.
 */
function dernierePhrase(texte: string): string {
  const phrases = texte
    .split(/(?<=[.!…])\s+|\n+/u)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);
  return phrases.at(-1) ?? texte;
}

/**
 * La promesse sur laquelle le texte se termine, ou `null`.
 *
 * `null` est le cas normal et doit le rester : ce garde ne juge que la fin,
 * n'attrape que le futur immédiat, et se tait devant une question.
 */
export function finEnPromesse(texte: string | null | undefined): string | null {
  if (typeof texte !== "string") return null;
  const net = texte.trim();
  if (net.length === 0) return null;
  // Une fin interrogative est un arrêt légitime — l'agent REND la main.
  if (/[?？]\s*$/u.test(net) || /[?？][)\]»"']*\s*$/u.test(net)) return null;

  const fin = dernierePhrase(net);
  for (const motif of PROMESSES) {
    const trouve = fin.match(motif);
    if (trouve?.[0] !== undefined) return trouve[0];
  }
  return null;
}

/** Le refus, adressé au MODÈLE — il doit pouvoir agir dessus (A7). */
export function raisonDuRefus(promesse: string): string {
  return (
    `⛔ ANNONCER N'EST PAS FAIRE — ton message se termine sur « ${promesse} » ` +
    "et tu rends la main : l'humain lira du travail en cours alors que rien " +
    "n'avance. Deux issues : FAIS maintenant ce que tu viens d'annoncer, dans " +
    "ce tour ; ou réécris ta fin sans engagement — dis ce qui est FAIT, et " +
    "pose ta question s'il t'en faut une (une question passe toujours ce garde)."
  );
}
