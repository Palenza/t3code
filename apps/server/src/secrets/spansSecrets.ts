/**
 * LES BORNES D'UN SECRET — repérer, puis découper. Jamais reconstruire.
 *
 * ── Pourquoi ce module existe (03/08) ─────────────────────────────────────
 *
 * L'ancien caviardage RECONSTRUISAIT la zone trouvée : il capturait
 * `clé: valeur` en entier et rendait une chaîne réassemblée. Tout ce qui
 * n'était pas la valeur — les espaces, la ponctuation, les retours à la ligne
 * happés par un `\s` trop large — était donc réécrit de mémoire. Mesuré sur le
 * dépôt lui-même, qui ne contient AUCUN secret : 800 fichiers sur 15 255
 * altérés, 459 lignes PERDUES, 9 509 modifiées.
 *
 * La cure n'est pas une expression régulière plus fine. C'est un changement de
 * forme : on ne rend plus du texte reconstruit, on rend une LISTE DE BORNES.
 * Le découpage final ne touche qu'aux intervalles listés et recopie le reste à
 * l'octet près. La corruption devient alors impossible par construction, pas
 * par vigilance — et c'est la seule garantie qui tienne dans six mois.
 *
 * Trois pièges fermés du même coup :
 *   · un remplacement passé en CHAÎNE laisse `$&` se ré-injecter — ici la
 *     valeur de remplacement n'est jamais interprétée ;
 *   · deux motifs qui se chevauchent masquaient deux fois — les bornes sont
 *     fusionnées avant découpe ;
 *   · le second passage retouchait le premier — un texte déjà découpé n'a plus
 *     de bornes à trouver, donc l'opération est idempotente.
 *
 * Module PUR.
 */

export interface BorneSecrete {
  readonly debut: number;
  readonly fin: number;
}

/**
 * Fusionne les bornes qui se touchent ou se chevauchent, et les trie.
 *
 * Sans ça, deux motifs qui attrapent la même zone la masquent deux fois et le
 * texte se décale — le mode de panne exact qu'on vient de refermer.
 */
export function fusionner(bornes: ReadonlyArray<BorneSecrete>): BorneSecrete[] {
  const triees = [...bornes]
    .filter((b) => b.fin > b.debut)
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin);
  const sortie: BorneSecrete[] = [];
  for (const borne of triees) {
    const derniere = sortie.at(-1);
    if (derniere !== undefined && borne.debut <= derniere.fin) {
      if (borne.fin > derniere.fin)
        sortie[sortie.length - 1] = { debut: derniere.debut, fin: borne.fin };
      continue;
    }
    sortie.push(borne);
  }
  return sortie;
}

/**
 * Découpe : le texte, moins les bornes, plus leur masque.
 *
 * `masquer` reçoit le texte EXACT de la borne et rend ce qui prend sa place.
 * Aucune interpolation, aucun `$` interprété : c'est un appel de fonction, pas
 * un patron de remplacement.
 */
export function decouper(
  texte: string,
  bornes: ReadonlyArray<BorneSecrete>,
  masquer: (valeur: string) => string,
): string {
  const propres = fusionner(bornes);
  if (propres.length === 0) return texte;
  let sortie = "";
  let position = 0;
  for (const borne of propres) {
    // Le texte hors bornes est recopié À L'OCTET PRÈS. C'est l'invariant du
    // module, et le banc du dépôt entier le vérifie.
    sortie += texte.slice(position, borne.debut);
    sortie += masquer(texte.slice(borne.debut, borne.fin));
    position = borne.fin;
  }
  return sortie + texte.slice(position);
}

/**
 * Les bornes de TOUS les groupes d'un motif, pour un groupe de capture donné.
 *
 * Utilise `indices` (le drapeau `d`) plutôt qu'un calcul de position à la main :
 * chercher la valeur dans la zone trouvée avec `indexOf` retombe sur la
 * première occurrence, qui n'est pas forcément la bonne — un nom de clé qui
 * réapparaît dans sa propre valeur suffit à décaler la borne.
 */
export function bornesDuGroupe(
  texte: string,
  motif: RegExp,
  groupe: number,
  accepte: (valeur: string, entier: RegExpExecArray) => boolean,
): BorneSecrete[] {
  const avecIndices = new RegExp(
    motif.source,
    motif.flags.includes("d") ? motif.flags : `${motif.flags}d`,
  );
  const bornes: BorneSecrete[] = [];
  for (const trouve of texte.matchAll(avecIndices)) {
    const indices = (trouve as RegExpExecArray & { indices?: Array<[number, number] | undefined> })
      .indices;
    const paire = indices?.[groupe];
    const valeur = trouve[groupe];
    if (paire === undefined || valeur === undefined) continue;
    if (!accepte(valeur, trouve as RegExpExecArray)) continue;
    bornes.push({ debut: paire[0], fin: paire[1] });
  }
  return bornes;
}
