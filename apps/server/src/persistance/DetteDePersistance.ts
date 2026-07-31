/**
 * LA DETTE DE PERSISTANCE — ce qui a été établi et n'existe nulle part.
 *
 * Chantier n°9 (`agent/memory_manager.py`, 1 241 lignes) : « l'agent se
 * rappelle d'écrire ce qu'il apprend ».
 *
 * ── Pourquoi ce module, et pas une règle de texte ─────────────────────────
 *
 * Le 31/07, un catalogue de 85 chantiers a vécu une journée entière dans une
 * seule conversation. Au compactage, il est tombé. Il a fallu rouvrir 71 Mo de
 * transcript brut pour le retrouver ligne 3331.
 *
 * Et la mesure du même jour dit pourquoi ce n'est pas rattrapable après coup :
 * chaque compactage jette 97,5 à 98,6 % de la fenêtre, et TROIS messages
 * seulement survivent mot pour mot. Ce qui n'a pas été écrit AVANT n'existe
 * plus. Aucune archive ne rattrape ça — l'archive garde le texte, pas la
 * conclusion qu'on en avait tirée.
 *
 * T3 capture déjà ce que l'HUMAIN dit (`memoireConsignes`, réinjecté par le
 * CLAUDE.md de l'instance). Rien ne capture ce que l'agent ÉTABLIT. C'est
 * exactement par ce trou que le catalogue est passé.
 *
 * ── Le signal, mesuré, et pourquoi ce n'est pas « aucune écriture » ───────
 *
 * Relevé sur la base réelle (569 tours, 14 fils, 89 séries) :
 *
 *   tours consécutifs SANS aucune écriture de fichier
 *   p50 = 1   p75 = 3   p90 = 6   p95 = 9   p99 = 22   max = 22
 *
 * Travailler 1 à 3 tours sans rien écrire est le cas NORMAL : on lit, on
 * cherche, on mesure. 56 % des tours n'écrivent aucun fichier. Alerter
 * là-dessus serait un voyant qu'on apprend à ignorer en une heure.
 *
 * Les deux séries qui sortent — 22 tours / 106 outils, et 13 tours / 184
 * outils — sont d'une autre nature : beaucoup de travail, zéro trace durable.
 * C'est la signature de la panne du 31/07.
 *
 * Module PUR : on lui donne des tours, il dit s'il y a dette.
 */

/** Un tour de travail, réduit à ce qui compte ici. */
export interface TourObserve {
  readonly outils: number;
  /** Combien d'écritures de fichier ce tour a produites. */
  readonly ecritures: number;
}

export interface DetteDePersistance {
  readonly enDette: boolean;
  readonly tours: number;
  readonly outils: number;
  /** Nommé pour un AGENT (A7) : le fait, ses chiffres, et le geste attendu. */
  readonly quoiFaire: string;
}

/**
 * Le fil-piège : au-delà, plus rien de sain ne passe.
 *
 * REÇU (31/07, `/tmp/dette-mesure.mjs` sur `~/.t3/userdata/state.sqlite`) :
 * p95 = 9 tours, p99 = 22. À 12, la limite ne touche que 2 séries sur 89
 * (2,2 %) — et ce sont précisément les deux qui ont dépensé 106 et 184 outils
 * sans produire un fichier.
 *
 * Posé volontairement AU-DESSUS du p95 : une enquête de neuf tours est un
 * travail normal, pas une dette. Si un cas sain touche cette limite un jour,
 * c'est la limite qui a tort — remesurer, pas assouplir en silence.
 */
export const TOURS_AVANT_DETTE = 12;

/**
 * Un plancher d'EFFORT en plus du nombre de tours.
 *
 * Douze tours minuscules ne sont pas une dette : c'est une conversation. Les
 * deux séries réelles ont dépensé 106 et 184 outils ; le plancher est posé à
 * 40, bien en dessous d'elles et bien au-dessus d'un échange bavard.
 */
export const OUTILS_AVANT_DETTE = 40;

/**
 * Y a-t-il dette, et qu'est-ce qu'on en fait ?
 *
 * `tours` arrive du plus RÉCENT au plus ancien : on remonte jusqu'à la
 * dernière écriture, et on s'arrête là. Ce qui précède a déjà été gravé.
 */
export function detteDePersistance(tours: ReadonlyArray<TourObserve>): DetteDePersistance {
  let depuis = 0;
  let outils = 0;
  for (const tour of tours) {
    if (tour.ecritures > 0) break;
    depuis += 1;
    outils += tour.outils;
  }

  const enDette = depuis >= TOURS_AVANT_DETTE && outils >= OUTILS_AVANT_DETTE;
  if (!enDette) {
    return {
      enDette: false,
      tours: depuis,
      outils,
      quoiFaire:
        depuis === 0
          ? "Rien en dette : le dernier tour a écrit sur disque."
          : `${depuis} tour(s) sans écriture, ${outils} outil(s) dépensé(s) — sous le seuil (${TOURS_AVANT_DETTE} tours ET ${OUTILS_AVANT_DETTE} outils). Enquêter sans écrire est normal.`,
    };
  }

  return {
    enDette: true,
    tours: depuis,
    outils,
    // On ne dit pas « pense à sauvegarder ». On dit ce qui a été dépensé, ce
    // qui va disparaître, et le geste exact — sinon c'est un voyant de plus.
    quoiFaire: `${depuis} tours et ${outils} outils depuis la dernière écriture de fichier. Tout ce qui a été ÉTABLI depuis n'existe que dans le contexte : au prochain compactage, 98 % de la fenêtre part et trois messages seulement survivent mot pour mot. ÉCRIS-LE MAINTENANT — le plan, les chiffres avec leur commande, la décision et sa raison — dans un fichier du dépôt, pas dans un message.`,
  };
}
