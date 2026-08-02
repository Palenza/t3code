/**
 * RÉCUPÉRATION PARTIELLE DES RÉGLAGES — une clé cassée ne doit pas tout jeter.
 *
 * Chantier n°32 (`hermes_cli/config_migrations.py`), et surtout : correction
 * d'un chemin de PERTE DE DONNÉES trouvé dans `serverSettings.ts`.
 *
 * ── Le défaut, et sa chaîne complète ──────────────────────────────────────
 *
 * Aujourd'hui, si `settings.json` ne décode pas, le serveur journalise un
 * avertissement et rend `DEFAULT_SERVER_SETTINGS`. En mémoire, tous les
 * réglages sont donc revenus aux défauts — `providerInstances` compris, qui
 * porte les comptes. À la première modification de réglage,
 * `writeSettingsAtomically` réécrit le fichier depuis cet état : les comptes
 * DISPARAISSENT du disque.
 *
 * Une seule clé malformée — une édition à la main, une écriture interrompue,
 * une dérive de version — et tout est perdu. Silencieusement : un
 * avertissement dans un journal que personne ne lit au moment où ça compte.
 *
 * Le disque du fondateur en porte la trace : `settings.json.bak-20260725`,
 * `settings.json.bak2-101831`, `client-settings.json.bak-20260725`. Des
 * sauvegardes faites À LA MAIN, c'est-à-dire par quelqu'un qui avait déjà
 * perdu quelque chose.
 *
 * ── Ce qu'on fait à la place ──────────────────────────────────────────────
 *
 * Un fichier de réglages ne casse presque jamais en entier : c'est UNE clé
 * qui a une valeur inattendue. On garde donc le plus grand sous-ensemble qui
 * décode, on ne remet aux défauts QUE ce qui est cassé, et on DIT lesquelles.
 *
 * Module PUR : on lui passe une fonction qui tente un décodage, il ne connaît
 * ni schéma ni fichier.
 */

export interface Perte {
  readonly cle: string;
  readonly pourquoi: string;
}

export interface Recuperation {
  /** Le plus grand sous-ensemble qui décode. */
  readonly garde: Record<string, unknown>;
  /** Ce qui a dû être écarté — jamais tu. */
  readonly perdues: ReadonlyArray<Perte>;
  /** `true` quand rien n'a été écarté. */
  readonly intact: boolean;
}

/**
 * Garde tout ce qui décode, écarte le reste, et le dit.
 *
 * `tenter` rend `true` quand l'objet proposé décode. On ne lui demande rien
 * d'autre : ce module ne doit connaître ni Effect, ni Schema, ni le disque.
 *
 * L'algorithme est volontairement bête et borné : on essaie l'objet entier ;
 * s'il ne passe pas, on repart du VIDE et on n'ajoute que les clés qui ne
 * cassent rien. Un fichier de réglages a une vingtaine de clés — chercher
 * plus malin coûterait de la lisibilité pour un gain qu'on ne mesurerait
 * jamais.
 */
export function recuperationPartielle(
  objet: Record<string, unknown>,
  tenter: (candidat: Record<string, unknown>) => boolean,
): Recuperation {
  if (tenter(objet)) {
    return { garde: { ...objet }, perdues: [], intact: true };
  }

  // ON CONSTRUIT, on ne démolit pas.
  //
  // Ma première version retirait les clés une à une dans l'ordre du fichier
  // et ne remettait JAMAIS les innocentes : `providerInstances` — les
  // comptes — tombait avant qu'on atteigne la clé coupable. Le remède
  // détruisait ce qu'il venait sauver.
  //
  // On repart donc du vide et on n'ajoute que ce qui ne casse rien. Une clé
  // écartée l'est parce qu'elle a été ESSAYÉE et refusée, jamais parce
  // qu'elle passait par là.
  if (!tenter({})) {
    return {
      garde: {},
      perdues: Object.keys(objet).map((cle) => ({
        cle,
        pourquoi: "aucun sous-ensemble ne décodait — tout a été écarté",
      })),
      intact: false,
    };
  }

  const garde: Record<string, unknown> = {};
  const perdues: Perte[] = [];

  // Ordre stable : celui des clés du fichier. Deux lancements sur le même
  // fichier abîmé rendent le même résultat — un rétablissement qui varie d'un
  // démarrage à l'autre est impossible à diagnostiquer.
  for (const cle of Object.keys(objet)) {
    const candidat = { ...garde, [cle]: objet[cle] };
    if (tenter(candidat)) {
      garde[cle] = objet[cle];
      continue;
    }
    perdues.push({
      cle,
      pourquoi: `valeur refusée par le schéma — remise au défaut (reçu : ${apercu(objet[cle])})`,
    });
  }

  return { garde, perdues, intact: perdues.length === 0 };
}

/** Un aperçu court et sûr d'une valeur, pour le message d'erreur. */
function apercu(valeur: unknown): string {
  if (valeur === null) return "null";
  if (valeur === undefined) return "absent";
  const texte = typeof valeur === "string" ? valeur : JSON.stringify(valeur);
  const propre = texte ?? String(valeur);
  return propre.length > 60 ? `${propre.slice(0, 60)}…` : propre;
}

/**
 * Le nom du fichier de mise à l'abri.
 *
 * ON NE RÉÉCRIT JAMAIS PAR-DESSUS un fichier qu'on n'a pas su lire. Le
 * mettre de côté sous un nom daté coûte quelques kilo-octets et sauve la
 * seule copie des comptes. C'est exactement ce que le fondateur faisait à la
 * main — `settings.json.bak-20260725` — parce que le logiciel ne le faisait
 * pas pour lui.
 */
export function nomDeMiseALAbri(chemin: string, quand: string): string {
  const horodatage = quand.replaceAll(/[:.]/gu, "-");
  return `${chemin}.illisible-${horodatage}`;
}

/**
 * La phrase qu'on journalise. Elle nomme le fichier, le nombre de clés
 * sauvées, celles qui sont tombées, et où trouver l'original (A7).
 */
export function messageDeRecuperation(
  chemin: string,
  recuperation: Recuperation,
  copie: string,
): string {
  const sauvees = Object.keys(recuperation.garde).length;
  const listeCles = recuperation.perdues.map((perte) => perte.cle).join(", ");
  return `${chemin} ne décodait pas. ${sauvees} réglage(s) récupéré(s), ${recuperation.perdues.length} remis au défaut : ${listeCles}. L'original est conservé ici : ${copie}`;
}
