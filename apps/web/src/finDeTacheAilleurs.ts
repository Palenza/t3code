/**
 * « Une tâche vient de finir DANS UN AUTRE ESPACE » — et le chemin du retour.
 *
 * Le besoin, mot pour mot : je lance une tâche dans l'espace Design, je pars
 * travailler ailleurs, la tâche finit — il faut que je le voie, que le clic me
 * pose dans le bon espace ET le bon fil, et que je puisse REVENIR d'où je
 * venais.
 *
 * Le retour est la moitié qui manque partout ailleurs. Une notification qui
 * te déplace sans te ramener est un aller simple : elle règle la visibilité et
 * crée une perte. Ici, le point de départ est mémorisé À L'INSTANT du saut,
 * pas reconstruit après coup — c'est la seule façon qu'il soit juste.
 *
 * Module PUR : il compare deux photos d'états et rend des évènements. Aucune
 * navigation, aucun toast, aucun store — pour que la règle se teste sans app.
 */

/** L'état d'un fil, réduit à ce qui décide d'une notification. */
export interface EtatFil {
  readonly threadKey: string;
  /** `true` tant que l'agent travaille sur ce fil. */
  readonly travaille: boolean;
}

/** Où l'on était — ou bien où l'on va. */
export interface Emplacement {
  readonly spaceId: string | null;
  readonly threadKey: string;
}

export interface FinDeTache {
  readonly threadKey: string;
  /** L'espace du fil qui vient de finir, `null` s'il n'est rangé nulle part. */
  readonly spaceId: string | null;
}

/**
 * Les fils qui viennent de PASSER de « travaille » à « fini », et qu'on ne
 * regarde pas.
 *
 * Trois gardes, et chacun répond à une façon précise de fabriquer du bruit :
 *
 *  · la BASCULE, pas l'état : sans elle, chaque rafraîchissement renotifierait
 *    tous les fils déjà terminés ;
 *  · le fil ACTIF est exclu : tu vois déjà la réponse arriver sous tes yeux,
 *    une notification pour ça n'apprend rien ;
 *  · le PREMIER passage ne notifie rien : au démarrage, tous les fils
 *    apparaissent d'un coup à l'état « fini » — sans ce garde, ouvrir l'app
 *    déclencherait une notification par fil terminé de la semaine.
 */
export function finsDeTache(input: {
  readonly precedent: ReadonlyMap<string, boolean> | null;
  readonly courant: ReadonlyArray<EtatFil>;
  readonly threadKeyActif: string | null;
  readonly espaceDuFil: (threadKey: string) => string | null;
}): FinDeTache[] {
  // Premier passage : on prend la photo, on ne notifie rien.
  if (input.precedent === null) return [];
  const fins: FinDeTache[] = [];
  for (const fil of input.courant) {
    if (fil.travaille) continue;
    if (fil.threadKey === input.threadKeyActif) continue;
    // Inconnu au tour précédent = fil qui vient d'apparaître, pas une fin.
    const travaillaitAvant = input.precedent.get(fil.threadKey);
    if (travaillaitAvant !== true) continue;
    fins.push({ threadKey: fil.threadKey, spaceId: input.espaceDuFil(fil.threadKey) });
  }
  return fins;
}

/** La photo à garder pour le tour suivant. */
export function photographier(courant: ReadonlyArray<EtatFil>): ReadonlyMap<string, boolean> {
  return new Map(courant.map((fil) => [fil.threadKey, fil.travaille]));
}

/**
 * Faut-il proposer un retour, et vers où ?
 *
 * On ne propose rien quand le saut ne DÉPLACE pas : cliquer une notification
 * du fil qu'on regarde déjà ne mérite pas un bouton « revenir ici ».
 */
export function retourApresSaut(input: {
  readonly depart: Emplacement;
  readonly arrivee: Emplacement;
}): Emplacement | null {
  const memeFil = input.depart.threadKey === input.arrivee.threadKey;
  const memeEspace = input.depart.spaceId === input.arrivee.spaceId;
  if (memeFil && memeEspace) return null;
  return input.depart;
}

/**
 * Le retour a-t-il encore un sens ?
 *
 * Il s'efface dès que tu es revenu par tes propres moyens — sinon le bouton
 * survivrait à sa raison d'être et proposerait d'aller là où tu es déjà.
 */
export function retourEncoreUtile(
  retour: Emplacement | null,
  position: Emplacement,
): Emplacement | null {
  if (retour === null) return null;
  if (retour.threadKey === position.threadKey && retour.spaceId === position.spaceId) return null;
  return retour;
}
