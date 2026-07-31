/**
 * REPRENDRE LÀ OÙ ON A QUITTÉ.
 *
 * Ordre fondateur, mot pour mot : « Ça doit toujours se redémarrer là où tu
 * as quitté. » L'application ouvrait un fil NEUF à chaque lancement — aucun
 * mécanisme de reprise n'existait nulle part dans le code.
 *
 * Le signal qu'on lit est `lastOpenedThreadKey`, écrit à l'ouverture d'un
 * fil. On aurait pu croire que `threadLastVisitedAtById` suffisait : il n'est
 * écrit que lorsqu'un fil porte du NOUVEAU, pour barrer le non-lu. Un fil
 * rouvert sans qu'il ait bougé n'y laisse aucune trace. Le détourner aurait
 * marché la plupart du temps, et rouvert le mauvais fil le reste du temps —
 * la pire des pannes, celle qui a l'air de marcher.
 *
 * Le garde-fou qui fait toute la valeur de cette fonction : on ne rouvre
 * QUE des fils qui existent ENCORE. Une clé survit à la suppression de son
 * fil ; reprendre sur un fantôme ouvrirait une page morte au lancement —
 * pire que le fil neuf qu'on remplace.
 */

export interface FilConnu {
  readonly environmentId: string;
  readonly id: string;
}

export interface CibleDeReprise {
  readonly environmentId: string;
  readonly threadId: string;
}

/**
 * Le fil à rouvrir, ou `null` — auquel cas l'appelant garde son comportement
 * d'origine (ouvrir un brouillon neuf).
 */
export function cibleDeReprise(
  derniereCle: string | null | undefined,
  filsConnus: ReadonlyArray<FilConnu>,
): CibleDeReprise | null {
  if (typeof derniereCle !== "string" || derniereCle.length === 0) return null;

  // On coupe au PREMIER deux-points seulement : un identifiant de fil peut
  // légitimement en contenir, et `split(":")` le découperait en morceaux.
  const coupure = derniereCle.indexOf(":");
  if (coupure <= 0) return null;
  const environmentId = derniereCle.slice(0, coupure);
  const threadId = derniereCle.slice(coupure + 1);
  if (threadId.length === 0) return null;

  const existeEncore = filsConnus.some(
    (fil) => fil.environmentId === environmentId && fil.id === threadId,
  );
  if (!existeEncore) return null;

  return { environmentId, threadId };
}
