/**
 * UNE AUTOMATISATION NE DOIT PAS POUVOIR TUER CE QUI LA LANCE.
 *
 * Chantier n°47, chaîne D. Aspiré de `cron/lifecycle_guard.py` (141 l.), qui
 * n'est pas un ordonnanceur mais le garde SANS LEQUEL un ordonnanceur est
 * dangereux — c'est pour ça qu'il arrive avant lui.
 *
 * ── Le piège, en une phrase ───────────────────────────────────────────────
 *
 * Un job planifié qui redémarre son propre exécuteur ne s'arrête jamais. Le
 * superviseur relance le processus, la reprise automatique ramasse la session
 * fautive, le tour repris rejoue la même logique, et ça recommence toutes les
 * dix secondes jusqu'à ce qu'un humain le casse à la main. Chez eux c'était
 * `hermes gateway restart` depuis l'intérieur de la passerelle.
 *
 * ── Pourquoi ça nous concerne, alors qu'on n'a pas de passerelle ──────────
 *
 * La même forme existe ici, et elle est écrite noir sur blanc dans notre
 * propre code : « tuer le backend de bureau est futile, l'app le supervise et
 * le respawne » (`DesktopUpdates.ts`). Ajoute la mise à jour par RPC, qui
 * remplace le serveur en cours d'exécution, et le service systemd du mode
 * cloud : trois façons pour un job de faire redémarrer ce qui le fait tourner.
 *
 * ── La décision de conception qu'on reprend TELLE QUELLE ──────────────────
 *
 * Le motif s'ancre sur une FORME DE COMMANDE, jamais sur de la prose. Leur
 * note le dit mieux que je ne le ferais : une consigne d'automatisation part
 * vers un modèle, pas vers un shell — donc une correspondance large sur de
 * l'anglais (« le comportement de redémarrage de la passerelle Kong ») ferait
 * un taux de faux positifs élevé sans empêcher le vrai piège, qui exige une
 * vraie forme de commande.
 *
 * C'est exactement la leçon que ce dépôt a payée le 31/07 sur son propre
 * garde de commandes : lire une LIGNE de shell comme si c'était une COMMANDE.
 * Deux équipes, deux fois le même mur, la même sortie.
 *
 * ── Ce qu'on ne bloque PAS, et pourquoi ───────────────────────────────────
 *
 * `start` est volontairement absent. Démarrer un serveur depuis un serveur
 * déjà démarré est bénin — au pire un « déjà en cours » — et une
 * automatisation légitime peut vouloir lever un service voisin. Bloquer large
 * ici coûterait des refus injustes sans rien empêcher.
 *
 * Module PUR.
 */

/**
 * Les formes de commande qui font redémarrer ce qui exécute l'automatisation.
 *
 * Chaque branche exige un identifiant CONCRET de notre service. Sans cette
 * exigence, `systemctl restart` seul bloquerait un job parfaitement légitime
 * qui redémarre nginx.
 */
const CYCLE_DE_VIE =
  /(?:t3\s+(?:serve\s+)?(?:restart|stop))|(?:launchctl\s+(?:kickstart|unload|load|stop|restart)\b[^\n]*\bt3[.-]?code)|(?:systemctl\s+(?:--\S+\s+)*(?:restart|stop)\b[^\n]*\bt3[.-]?code)|(?:p?kill\b[^\n]*\bt3[.-]?code\b)|(?:p?kill\b[^\n]*\bclaude[.-]?agent\b)/iu;

/**
 * La mise à jour de serveur par RPC, qui remplace le processus en cours.
 *
 * Elle mérite sa propre branche parce qu'elle ne RESSEMBLE pas à un
 * redémarrage : rien dans « mets à jour le serveur vers 0.0.31 » n'évoque un
 * arrêt. C'est pourtant le même piège — la version s'installe, le processus
 * est remplacé, la session reprend, le job se rejoue.
 */
const REMPLACE_LE_SERVEUR = /(?:t3\s+(?:self-?update|update)\b)|(?:server[_-]?self[_-]?update)/iu;

export interface RefusDeCycleDeVie {
  /** Ce qui a été reconnu, en clair — jamais « motif interne n°3 » (A7). */
  readonly pourquoi: string;
}

/**
 * Cette consigne ferait-elle redémarrer son propre exécuteur ?
 *
 * Rend `null` quand tout va bien : c'est le cas de l'écrasante majorité, et
 * le garde doit être invisible pour lui.
 */
export function refusDeCycleDeVie(texte: string): RefusDeCycleDeVie | null {
  if (CYCLE_DE_VIE.test(texte)) {
    return {
      pourquoi:
        "Cette automatisation contient une commande qui ARRÊTE ou REDÉMARRE T3 — c'est-à-dire ce qui l'exécutera. Le superviseur relancerait le processus, la session reprendrait, le job se rejouerait : une boucle qui ne s'arrête pas toute seule. Si tu veux vraiment redémarrer, fais-le à la main, pas depuis une automatisation.",
    };
  }
  if (REMPLACE_LE_SERVEUR.test(texte)) {
    return {
      pourquoi:
        "Cette automatisation déclenche une MISE À JOUR du serveur. Ça n'en a pas l'air, mais c'est le même piège qu'un redémarrage : la nouvelle version remplace le processus en cours, la session reprend, et le job se rejoue à l'identique. Une mise à jour se décide, elle ne se planifie pas.",
    };
  }
  return null;
}
