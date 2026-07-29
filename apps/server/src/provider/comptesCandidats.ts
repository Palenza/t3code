import type {
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  ServerProviderRateLimits,
} from "@t3tools/contracts";

import type { Candidat, SanteCompte } from "./comptePool.ts";

/**
 * Assemble les comptes éligibles à un relais.
 *
 * Trois sources se rejoignent ici, et chacune reste maîtresse de son domaine :
 * les RÉGLAGES disent quels comptes existent et lesquels sont activés,
 * `rateLimitStore` dit combien chacun a consommé, `compteSanteStore` dit
 * lesquels sont utilisables. Ce module ne fait que la jointure — il ne
 * conserve aucun état propre, donc il ne peut pas se désynchroniser.
 *
 * Les lectures sont INJECTÉES plutôt qu'importées : c'est ce qui rend la
 * jointure testable sans monter de registre ni de runtime.
 */

export function candidatsPourDriver(entree: {
  readonly instances: ProviderInstanceConfigMap;
  /** Le driver du compte qui vient d'échouer — on ne relaie qu'entre pairs. */
  readonly driver: string;
  readonly lireQuotas: (id: ProviderInstanceId) => ServerProviderRateLimits | undefined;
  readonly lireSante: (id: ProviderInstanceId) => SanteCompte;
}): ReadonlyArray<Candidat> {
  const candidats: Candidat[] = [];
  for (const [cle, config] of Object.entries(entree.instances)) {
    if (config.driver !== entree.driver) continue;
    // `enabled` absent vaut activé : c'est la valeur par défaut d'un compte
    // qu'on vient d'ajouter, et l'exclure le rendrait invisible au relais.
    if (config.enabled === false) continue;
    const instanceId = cle as ProviderInstanceId;
    candidats.push({
      instanceId,
      sante: entree.lireSante(instanceId),
      quotas: entree.lireQuotas(instanceId),
    });
  }
  return candidats;
}

/**
 * Le nom lisible d'un compte, pour le message qu'on montre à l'humain.
 * Un identifiant technique dans une notification n'apprend rien à personne.
 */
export function nomDuCompte(
  instances: ProviderInstanceConfigMap,
  instanceId: ProviderInstanceId,
): string {
  const config = instances[instanceId];
  return config?.displayName ?? instanceId;
}
