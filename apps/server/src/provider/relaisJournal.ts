import type { ProviderInstanceId, ThreadId } from "@t3tools/contracts";

/**
 * La mémoire des relais en cours — ce qui empêche un tour d'être rejoué deux
 * fois, et un fil de rebondir indéfiniment de compte en compte.
 *
 * C'est la pièce qui rend le rejeu SÛR, et elle mérite d'exister seule. Un
 * relais dépense du quota : le seul défaut inacceptable ici n'est pas de rater
 * une bascule, c'est d'en faire une de trop. Deux surfaces différentes
 * annoncent la même mort d'un tour — l'erreur de runtime puis le tour marqué
 * échoué — et sans ce journal, les deux déclencheraient chacune un rejeu : le
 * même message partirait deux fois, sur deux comptes, et l'humain verrait deux
 * réponses à une seule question.
 *
 * Process-local, comme le registre de santé. Un relais ne survit pas au
 * redémarrage du serveur, et c'est très bien : le tour est mort avec lui.
 */

interface RelaisEnCours {
  /** Comptes déjà essayés pour ce tour — chacun n'a droit qu'à une chance. */
  readonly tentes: Set<ProviderInstanceId>;
  /** Nombre de bascules déjà faites pour ce tour. */
  bascules: number;
}

/**
 * Plafond de bascules pour un même tour.
 *
 * Trois comptes, trois essais : au-delà, ce n'est plus un problème de compte,
 * c'est la demande elle-même qui échoue, et continuer à la relancer brûlerait
 * du quota sur tous les comptes pour la même raison. C'est l'anti-boucle de
 * Hermes — deux échecs et on bloque — appliquée au relais.
 */
export const MAX_BASCULES_PAR_TOUR = 3;

/** Clé d'un tour : le fil suffit tant qu'un fil n'a qu'un tour actif. */
const parFil = new Map<ThreadId, RelaisEnCours>();

/** Les morts déjà traitées — la garde exactement-une-fois. */
const mortsTraitees = new Set<string>();

const cleMort = (threadId: ThreadId, turnId: string | undefined): string =>
  `${threadId}:${turnId ?? "sans-tour"}`;

/**
 * Réclame le droit de traiter cette mort. Renvoie `false` si une autre surface
 * l'a déjà réclamée — l'appelant s'arrête alors sans rien faire.
 *
 * Le nom est délibéré : ce n'est pas une question (« a-t-on déjà vu ? ») mais
 * une PRISE. Demander puis agir laisserait une fenêtre entre les deux ; ici la
 * décision et la marque sont le même geste.
 */
export function reclamerMort(threadId: ThreadId, turnId: string | undefined): boolean {
  const cle = cleMort(threadId, turnId);
  if (mortsTraitees.has(cle)) return false;
  mortsTraitees.add(cle);
  // Sans tour identifié, on ne peut pas distinguer deux morts successives :
  // la marque est levée aussitôt pour ne pas condamner le fil au silence.
  if (turnId === undefined) {
    mortsTraitees.delete(cle);
  }
  return true;
}

/** Les comptes déjà tentés pour le tour courant de ce fil. */
export function dejaTentes(threadId: ThreadId): ReadonlySet<ProviderInstanceId> {
  return parFil.get(threadId)?.tentes ?? new Set<ProviderInstanceId>();
}

/** Reste-t-il des bascules autorisées pour ce fil ? */
export function peutEncoreBasculer(threadId: ThreadId): boolean {
  return (parFil.get(threadId)?.bascules ?? 0) < MAX_BASCULES_PAR_TOUR;
}

/** Enregistre une bascule : le compte mort et le compte visé sont tous deux tentés. */
export function noterBascule(
  threadId: ThreadId,
  depuis: ProviderInstanceId,
  vers: ProviderInstanceId,
): void {
  const courant = parFil.get(threadId) ?? { tentes: new Set<ProviderInstanceId>(), bascules: 0 };
  courant.tentes.add(depuis);
  courant.tentes.add(vers);
  courant.bascules += 1;
  parFil.set(threadId, courant);
}

/**
 * Le fil a repris sa route : on oublie tout.
 *
 * À appeler sur une réussite ET sur un nouveau tour lancé par l'humain — sinon
 * les comptes tentés hier interdiraient les bascules d'aujourd'hui.
 */
export function oublierFil(threadId: ThreadId): void {
  parFil.delete(threadId);
}

/** Remet tout à zéro — tests uniquement. */
export function viderJournal(): void {
  parFil.clear();
  mortsTraitees.clear();
}
