import type { ServerProvider, ServerProviderRotation } from "@t3tools/contracts";

import { etatA, type SanteCompte } from "./comptePool.ts";
import { santeDe } from "./compteSanteStore.ts";

/**
 * Joint l'état de ROTATION d'un compte à son instantané, à la frontière client.
 *
 * Le pool de comptes savait déjà tout : qui est écarté, pourquoi, jusqu'à
 * quand. Rien n'en sortait. La rotation automatique — la raison d'être de
 * Raptor — était donc invisible dans ses propres réglages : un compte pouvait
 * être mis de côté depuis une heure sans qu'aucun écran ne le dise, et
 * l'utilisateur voyait seulement que « ça ne répond plus ».
 *
 * Même patron que `withCurrentRateLimits`, et pour les mêmes raisons : une
 * jointure AU BORD plutôt qu'une par driver. La santé d'un compte vit dans un
 * magasin de processus qui se vide au redémarrage — c'est voulu, un « mort »
 * ne doit pas survivre à un relancement — donc la graver dans un instantané
 * mis en cache sur disque ressusciterait un verdict périmé.
 *
 * L'ABSENCE RESTE L'ABSENCE. Un compte dont on ne sait rien n'obtient pas de
 * clé. « Rien à signaler » et « tout va bien » sont deux affirmations
 * différentes, et l'interface doit pouvoir les distinguer.
 */

/** Le vocabulaire du moteur est en français ; celui du contrat ne l'est pas. */
function etatPourLeClient(etat: ReturnType<typeof etatA>): ServerProviderRotation["state"] {
  switch (etat) {
    case "refroidissement":
      return "cooling";
    case "mort":
      return "dead";
    case "ok":
      return "ok";
  }
}

/**
 * Ce qu'on envoie pour un compte, ou `undefined` s'il n'y a rien à dire.
 *
 * Un compte sain, jamais tombé, ne porte rien : inutile d'envoyer « ok » à
 * chaque instantané pour tous les comptes qui vont bien. Mais un compte qui
 * VIENT de se remettre — échecs comptés, refroidissement expiré — porte son
 * « ok » ET son compteur, parce que « il est reparti après trois hoquets »
 * n'est pas la même chose que « il n'a jamais bronché ».
 */
export function rotationPour(
  sante: SanteCompte,
  maintenant: number,
): ServerProviderRotation | undefined {
  const etat = etatPourLeClient(etatA(sante, maintenant));
  const echecs = sante.echecsDAffilee ?? 0;

  if (etat === "ok" && echecs === 0) {
    return undefined;
  }

  return {
    state: etat,
    ...(sante.raison !== undefined && etat !== "ok" ? { reason: sante.raison } : {}),
    // La date de reprise n'a de sens que pendant le refroidissement. Une fois
    // expirée, la porter reviendrait à annoncer une attente déjà finie.
    ...(sante.repriseA !== undefined && etat === "cooling" ? { resumesAt: sante.repriseA } : {}),
    ...(echecs > 0 ? { consecutiveFailures: echecs } : {}),
  };
}

/**
 * `maintenant` est FOURNI, jamais lu ici.
 *
 * Un refroidissement se juge par rapport à une horloge, et ce dépôt lit
 * l'heure par le `Clock` d'Effect — c'est ce qui rend le temps injectable
 * dans les tests. Un `Date.now()` planqué au fond d'une projection rendrait
 * cette fonction impossible à éprouver sur une frontière de reprise.
 */
export const withRotationState = (
  providers: ReadonlyArray<ServerProvider>,
  maintenant: number,
): ReadonlyArray<ServerProvider> =>
  providers.map((provider) => {
    const rotation = rotationPour(santeDe(provider.instanceId), maintenant);
    if (rotation !== undefined) {
      return { ...provider, rotation };
    }
    if (provider.rotation === undefined) {
      return provider;
    }
    // Arrivé d'ailleurs que du magasin vivant — un cache disque réhydraté, le
    // plus probable. On le jette : un vieux verdict rendu comme actuel est
    // exactement la panne que ce chemin existe pour empêcher.
    const { rotation: _perime, ...sansRotation } = provider;
    return sansRotation;
  });
