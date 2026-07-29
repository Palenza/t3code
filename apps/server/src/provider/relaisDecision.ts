import type { ModelSelection, ProviderInstanceId } from "@t3tools/contracts";

import { choisir, classerEchec, type Candidat, type Strategie } from "./comptePool.ts";

/**
 * Le relais — que faire d'un tour qui vient de mourir.
 *
 * Ce module DÉCIDE, il n'agit pas. Il prend un échec et l'état des comptes, il
 * rend une décision ; c'est l'appelant qui émet les commandes. La séparation
 * n'est pas de la cérémonie : elle rend testable, sans monter d'orchestration,
 * la partie où les erreurs coûtent cher — celle qui choisit de rejouer un tour
 * sur un autre compte, donc de dépenser du quota.
 *
 * La bascule emprunte le chemin du changement de compte MANUEL : un
 * `thread.meta.update` qui remplace l'`instanceId` du `modelSelection` en
 * gardant le modèle identique. Aucun circuit parallèle à maintenir, et un fil
 * relayé se comporte ensuite exactement comme un fil qu'on aurait basculé à la
 * main — il RESTE sur son nouveau compte, sans effet ping-pong.
 */

export type DecisionRelais =
  /** Ne rien faire — et la raison est dite, jamais avalée. */
  | { readonly type: "laisser"; readonly raison: string }
  /** Rejouer le tour sur un autre compte. */
  | {
      readonly type: "basculer";
      readonly vers: ProviderInstanceId;
      readonly modelSelection: ModelSelection;
      readonly raison: string;
    }
  /** Plus aucun compte disponible — à DIRE fort, jamais à masquer. */
  | { readonly type: "epuise"; readonly raison: string };

export interface EntreeRelais {
  /** Le compte sur lequel le tour vient de mourir. */
  readonly compteMort: ProviderInstanceId;
  /** La sélection du fil au moment de l'échec — le modèle en est repris tel quel. */
  readonly selectionActuelle: ModelSelection;
  readonly code?: number | undefined;
  readonly message?: string | undefined;
  /** `resetAt` / `Retry-After` du fournisseur, s'il en a donné un. */
  readonly repriseAnnoncee?: string | undefined;
  /** Tous les comptes du même driver, avec leur santé et leurs quotas. */
  readonly candidats: ReadonlyArray<Candidat>;
  /** Comptes déjà essayés POUR CE TOUR — un seul essai chacun. */
  readonly dejaTentes: ReadonlySet<ProviderInstanceId>;
  readonly strategie: Strategie;
  readonly maintenant: number;
}

/**
 * Décide du sort d'un tour mort.
 *
 * L'ordre des refus compte. On écarte d'abord les échecs qui ne regardent
 * aucun compte (`notre-faute`) : rejouer une requête invalide ailleurs
 * produirait la même erreur en brûlant un second compte. Ensuite seulement on
 * cherche un remplaçant.
 */
export function deciderRelais(entree: EntreeRelais): DecisionRelais {
  const verdict = classerEchec({
    code: entree.code,
    message: entree.message,
    repriseAnnoncee: entree.repriseAnnoncee,
    maintenant: entree.maintenant,
  });

  if (verdict.nature === "notre-faute") {
    return {
      type: "laisser",
      raison: "La requête elle-même est invalide — la rejouer ailleurs donnerait la même erreur.",
    };
  }

  const remplacant = choisir({
    candidats: entree.candidats,
    strategie: entree.strategie,
    // Le compte qui vient de mourir est exclu même si l'appelant a oublié de
    // le mettre dans `dejaTentes` : le rejouer sur lui-même est une boucle.
    dejaTentes: new Set([...entree.dejaTentes, entree.compteMort]),
    maintenant: entree.maintenant,
  });

  if (remplacant === null) {
    return {
      type: "epuise",
      raison:
        verdict.nature === "authentification-morte"
          ? "Ce compte n'est plus authentifié et aucun autre n'est disponible."
          : "Tous les comptes sont à sec ou en attente de reprise.",
    };
  }

  return {
    type: "basculer",
    vers: remplacant.instanceId,
    // Le MODÈLE ne bouge pas : on change de compte, pas de cerveau. Un tour
    // relancé sur un modèle différent ne serait plus le tour demandé.
    modelSelection: { ...entree.selectionActuelle, instanceId: remplacant.instanceId },
    raison:
      verdict.nature === "authentification-morte"
        ? "Compte non authentifié — repris ailleurs."
        : "Quota atteint — repris ailleurs.",
  };
}
