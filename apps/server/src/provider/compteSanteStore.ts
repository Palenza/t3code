import type { ProviderInstanceId } from "@t3tools/contracts";

import { appliquerEchec, etatA, type SanteCompte, type Verdict } from "./comptePool.ts";

/**
 * La santé des comptes — qui est utilisable, qui refroidit, qui est mort.
 *
 * Volontairement séparé de `rateLimitStore`, et la frontière est la raison
 * d'être des deux modules : `rateLimitStore` dit COMBIEN un compte a consommé
 * (une mesure venue du fournisseur), ce store dit S'IL PEUT SERVIR (un verdict
 * venu de nos échecs). Mélanger les deux donnerait un seul objet dont la
 * moitié des champs sont mesurés et l'autre déduits — impossible à raisonner
 * quand ils se contredisent.
 *
 * Process-local et NON persisté, exactement comme `rateLimitStore`. Ce n'est
 * pas de la paresse : un `mort` écrit sur disque survivrait à la
 * ré-authentification qui le guérit, et condamnerait un compte redevenu bon.
 * Au redémarrage, tout repart « ok » — au pire un tour part sur un compte
 * encore à sec, et le premier échec le réécarte aussitôt. L'oubli est moins
 * cher que le faux souvenir.
 */

const parInstance = new Map<ProviderInstanceId, SanteCompte>();

/**
 * Prévenus quand une santé change vraiment.
 *
 * Un tic nu, sans charge : les abonnés relisent le store eux-mêmes, donc une
 * rafale d'échecs ne peut pas leur être livrée dans un ordre différent de
 * celui où elle s'est produite.
 */
const abonnes = new Set<() => void>();

export const surChangementDeSante = (abonne: () => void): (() => void) => {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
};

const prevenir = (): void => {
  for (const abonne of abonnes) {
    abonne();
  }
};

/** La santé connue d'un compte ; « ok » tant que rien n'a échoué. */
export function santeDe(instanceId: ProviderInstanceId): SanteCompte {
  return parInstance.get(instanceId) ?? { instanceId, etat: "ok" };
}

export function toutesLesSantes(): ReadonlyArray<SanteCompte> {
  return [...parInstance.values()];
}

/**
 * Enregistre un échec sur un compte et renvoie sa nouvelle santé.
 *
 * Ne prévient les abonnés que si l'état a bougé : un compte qui échoue trois
 * fois de suite pendant son refroidissement ne doit pas repeindre l'interface
 * trois fois.
 */
export function noterEchec(
  instanceId: ProviderInstanceId,
  verdict: Verdict,
  raison: string,
): SanteCompte {
  const avant = santeDe(instanceId);
  const apres = appliquerEchec(avant, verdict, raison);
  if (apres.etat === avant.etat && apres.repriseA === avant.repriseA) {
    return avant;
  }
  parInstance.set(instanceId, apres);
  prevenir();
  return apres;
}

/**
 * Un tour a réussi sur ce compte : il est sain, quoi qu'on ait cru.
 *
 * C'est la seule preuve qui vaut. Un compte marqué mort par erreur — un
 * message d'erreur mal formulé, une cause mortelle détectée à tort — se
 * répare ici, tout seul, à la première réussite.
 */
export function noterSucces(instanceId: ProviderInstanceId): void {
  if (!parInstance.has(instanceId)) return;
  parInstance.delete(instanceId);
  prevenir();
}

/** Ressuscite un compte : à appeler après une ré-authentification réussie. */
export function reveiller(instanceId: ProviderInstanceId): void {
  noterSucces(instanceId);
}

/** Les comptes utilisables à cet instant, refroidissements expirés inclus. */
export function comptesUtilisables(
  instanceIds: ReadonlyArray<ProviderInstanceId>,
  maintenant: number,
): ReadonlyArray<ProviderInstanceId> {
  return instanceIds.filter((id) => etatA(santeDe(id), maintenant) === "ok");
}

/** Remet tout à zéro — tests uniquement. */
export function viderSantes(): void {
  parInstance.clear();
}
