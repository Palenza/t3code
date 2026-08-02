/**
 * CE QUI RESTE D'UNE DICTÉE QUAND LE COMPOSEUR DISPARAÎT.
 *
 * Le 01/08 : Enzo dicte, ouvre les Réglages, revient — tout ce qu'il a dit a
 * disparu. Les Réglages sont une route, donc ouvrir cette page démonte
 * `ChatComposer`, donc le hook de dictée, dont le nettoyage jette le texte
 * (`useVoiceDictationSession`, `requestStop({ commit: false })`).
 *
 * Le vrai remède serait de faire SURVIVRE la capture à la navigation, en la
 * sortant du composeur. Il n'est pas fait, et pour une raison précise : aucun
 * des 7 478 tests ne touche le microphone, donc une erreur là-dedans casserait
 * la dictée entièrement au lieu de lui faire perdre du texte. Le mode de panne
 * du remède serait pire que celui du bug.
 *
 * Ce module prend l'autre moitié du problème, celle qui SE VÉRIFIE : la
 * capture s'arrête toujours, mais les MOTS ne se perdent plus. On les dépose
 * ici en partant, le composeur suivant les reprend.
 *
 * Trois règles, chacune pour une panne qu'on aurait sinon :
 *
 *  1. REPRENDRE VIDE. Un brouillon lu deux fois se collerait une seconde fois
 *     dans le composeur — on rendrait le texte en double pour avoir voulu ne
 *     rien perdre.
 *  2. ON NE DÉPOSE QUE DU PLEIN. Écraser un brouillon en attente avec une
 *     chaîne vide, c'est perdre ce qu'on venait de sauver.
 *  3. PAS DE PERSISTANCE. Ça vit le temps d'une navigation, pas d'une session.
 *     Retrouver au matin une phrase dictée la veille serait une surprise, pas
 *     un service.
 */

let brouillon: string | null = null;

/** Met de côté ce qui a été dicté. Une chaîne vide ou blanche ne remplace
 * jamais un brouillon déjà en attente. */
export function deposerBrouillonDeDictee(texte: string): void {
  const propre = texte.trim();
  if (propre.length === 0) return;
  brouillon = propre;
}

/** Rend le brouillon UNE fois, puis oublie. Rendre deux fois collerait le
 * texte en double. */
export function reprendreBrouillonDeDictee(): string | null {
  const garde = brouillon;
  brouillon = null;
  return garde;
}

/** Y a-t-il quelque chose en attente ? Ne consomme rien — sert à décider
 * d'avertir sans voler le brouillon à celui qui le reprendra. */
export function brouillonDeDicteeEnAttente(): boolean {
  return brouillon !== null;
}

/** Pour les tests, et pour un changement de fil : ce qui a été dicté dans une
 * conversation n'a rien à faire dans une autre. */
export function oublierBrouillonDeDictee(): void {
  brouillon = null;
}
