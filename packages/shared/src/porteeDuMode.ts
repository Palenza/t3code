/**
 * LA PORTÉE D'UN MODE — ce qui a été posé, ce qui a été sauté, ce qui a raté.
 *
 * ── Pourquoi ce module existe (03/08) ─────────────────────────────────────
 *
 * L'écran annonçait « N comptes sur N — tous restreints » en comptant les
 * APPELS, pas les écritures. Côté serveur, poser le périmètre était typé
 * `Effect<void, never>` : un settings.json abîmé et un disque en lecture
 * seule tombaient tous deux dans un `catch` qui journalisait et rendait
 * `void`. L'appelant faisait `appliques += 1` sans condition, parce qu'il
 * n'avait rien d'autre à regarder.
 *
 * Ce n'était pas une erreur d'affichage. La bannière ambre dit à l'utilisateur
 * que ses agents ne peuvent NI écrire NI lancer de commande. S'il la croit
 * alors que rien n'a été écrit, il lance un agent en le pensant bridé. Le mode
 * de panne d'un garde de sécurité, c'est de PROMETTRE une protection absente —
 * pire que pas de garde du tout, parce qu'un garde absent ne rassure personne.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 * SAUTÉ et ÉCHOUÉ sont deux états distincts, et les confondre est ce qui
 * rendait l'écran menteur :
 *
 *   SAUTÉ  · le compte n'a pas de dossier de configuration propre, donc il
 *            partage le `~/.claude` de l'humain — y écrire un refus toucherait
 *            sa CLI personnelle. Attendu, rien à faire ; mais il faut le DIRE,
 *            sinon « 3 comptes » se lit « partout ».
 *   ÉCHOUÉ · le compte devait recevoir le périmètre et ne l'a pas reçu. Lui
 *            seul appelle une action, et lui seul interdit d'écrire
 *            « appliqué ».
 *
 * ── Pourquoi le compte ET la phrase sont ICI ──────────────────────────────
 *
 * Parce que c'est UN seul concept, et que le bug est né de sa dispersion : le
 * serveur comptait dans une route HTTP (donc intestable), le client
 * reformulait dans un composant React (donc intestable aussi), et les deux
 * moitiés ne se rencontraient qu'en production. Réunies, elles se prouvent
 * l'une contre l'autre et ne peuvent plus dériver.
 *
 * Module PUR, sans dépendance.
 */

/** Ce que la pose a VRAIMENT donné sur un compte. */
export type PoseDeMode =
  /** Le périmètre est écrit sur le disque. */
  | "applique"
  /** Le settings.json est abîmé : on renonce plutôt qu'écraser ses réglages. */
  | "settings-illisible"
  /** Le disque a refusé l'écriture. */
  | "ecriture-refusee";

/** Un compte qu'on n'a même pas tenté : pas de dossier propre. */
export type SautDeMode = "saute";

export interface PorteeDeMode {
  /** Comptes où le périmètre a été ÉCRIT. Jamais le nombre d'appels. */
  readonly comptes?: number;
  /** Comptes visés au total. */
  readonly comptesTotal?: number;
  /** Comptes sans dossier propre — attendu, on n'y touche pas. */
  readonly comptesSautes?: number;
  /** Comptes qui devaient recevoir le périmètre et ne l'ont pas reçu. */
  readonly comptesEnEchec?: number;
}

/**
 * Compte les issues. La seule addition autorisée sur cette portée.
 *
 * Elle prend les RÉSULTATS, jamais les tentatives : c'est toute la différence
 * entre « on a appelé trois fois » et « trois comptes sont restreints ».
 */
export function compterLaPortee(
  resultats: ReadonlyArray<PoseDeMode | SautDeMode>,
): Required<PorteeDeMode> {
  let comptes = 0;
  let comptesSautes = 0;
  let comptesEnEchec = 0;
  for (const resultat of resultats) {
    if (resultat === "applique") comptes += 1;
    else if (resultat === "saute") comptesSautes += 1;
    else comptesEnEchec += 1;
  }
  return { comptes, comptesTotal: resultats.length, comptesSautes, comptesEnEchec };
}

const pluriel = (n: number) => (n > 1 ? "s" : "");

/**
 * La phrase qui décrit EXACTEMENT ce qui a été posé.
 *
 * L'ordre des cas est l'ordre de gravité : un échec se dit avant un saut,
 * parce qu'un échec demande une action et qu'un saut n'en demande aucune.
 */
export function decrirePortee(portee: PorteeDeMode): string {
  const poses = portee.comptes ?? 0;
  const total = portee.comptesTotal ?? poses;
  const sautes = portee.comptesSautes ?? 0;
  const echecs = portee.comptesEnEchec ?? 0;

  if (poses === 0 && echecs === 0) {
    return "Aucun compte n'a de dossier de configuration propre — rien n'a été restreint.";
  }

  const tete = `${poses} compte${pluriel(poses)} sur ${total}`;

  if (echecs > 0) {
    // Le mot « ÉCHEC » est dit en toutes lettres, et le nombre aussi : un
    // agent — ou l'utilisateur — doit pouvoir agir sur cette phrase seule,
    // sans aller ouvrir un journal.
    const reste = sautes > 0 ? `, ${sautes} sans dossier propre` : "";
    return `${tete} — ÉCHEC sur ${echecs}${reste}. ${echecs} compte${pluriel(echecs)} n'${
      echecs > 1 ? "ont" : "a"
    } PAS été restreint${pluriel(echecs)} : tes agents y écrivent encore.`;
  }

  if (sautes > 0) {
    return `${tete} — ${sautes} sans dossier propre n'${
      sautes > 1 ? "ont" : "a"
    } PAS été restreint${pluriel(sautes)}.`;
  }

  return `${tete} — tous restreints.`;
}
