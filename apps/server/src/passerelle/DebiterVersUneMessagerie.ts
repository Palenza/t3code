/**
 * FAIRE TENIR UN FLUX D'AGENT DANS UNE MESSAGERIE.
 *
 * Chantier n°38, la décision. Aspiré de `gateway/stream_consumer.py` (2 250 l.).
 *
 * ── Pourquoi ce n'est pas « envoyer le texte » ────────────────────────────
 *
 * L'agent écrit en flux, une messagerie reçoit des MESSAGES. Entre les deux,
 * trois contraintes qui n'existent nulle part ailleurs dans T3 :
 *
 *   · une TAILLE maximale par message — Telegram 4096, Discord 2000 ;
 *   · un RYTHME d'édition limité : éditer à chaque fragment fait refuser
 *     l'API pour inondation ;
 *   · un refus d'inondation n'est pas une panne, c'est une DEMANDE de
 *     ralentir. Y répondre en réessayant aggrave.
 *
 * ── Ce qu'on reprend d'eux, et qui est la vraie trouvaille ───────────────
 *
 * Leur repli adaptatif : sur un refus, on DOUBLE l'intervalle, on plafonne à
 * 10 s, on compte les refus consécutifs, et au bout de trois on renonce aux
 * éditions pour ne garder que la livraison finale.
 *
 * C'est l'inverse du réflexe. Le réflexe réessaie ; ici réessayer au même
 * rythme garantit le refus suivant. Une limite qu'on touche n'est pas une
 * constante à contourner, c'est un signal à écouter.
 *
 * ── L'invariant qui prime sur tout le reste ──────────────────────────────
 *
 * **La réponse finale part TOUJOURS.** Les éditions sont un confort — voir la
 * réponse s'écrire. Si le rythme les a fait abandonner, l'humain doit quand
 * même recevoir le texte complet. Un flux dégradé reste une réponse ; un flux
 * abandonné est un silence.
 *
 * Module PUR : il décide, il n'envoie pas.
 */

/** Ce qu'une plateforme accepte. Les valeurs sont les leurs, vérifiées. */
export interface LimitesDePlateforme {
  /** Caractères par message. Telegram 4096, Discord 2000. */
  readonly tailleMax: number;
  /** Secondes minimales entre deux éditions du même message. */
  readonly intervalleDEdition: number;
}

export const TELEGRAM: LimitesDePlateforme = { tailleMax: 4096, intervalleDEdition: 1 };
export const DISCORD: LimitesDePlateforme = { tailleMax: 2000, intervalleDEdition: 1 };

/**
 * Au-delà, on cesse d'éditer et on garde la livraison finale.
 *
 * Trois, comme chez eux. Deux serait nerveux — un refus isolé arrive sur un
 * hoquet réseau. Au troisième consécutif, la plateforme ne dit plus « pas
 * maintenant » mais « pas comme ça ».
 */
export const REFUS_AVANT_DE_RENONCER = 3;

/** L'intervalle ne monte pas indéfiniment : au-delà, éditer n'a plus de sens. */
export const INTERVALLE_MAX = 10;

export interface EtatDuDebit {
  /** Secondes écoulées depuis la dernière édition réussie. */
  readonly depuisDerniereEdition: number;
  /** L'intervalle courant, qui a pu doubler sur refus. */
  readonly intervalleCourant: number;
  /** Refus d'inondation consécutifs. */
  readonly refusDAffilee: number;
  /** Le flux est-il terminé ? */
  readonly termine: boolean;
}

export type Geste =
  /** Éditer le message en cours avec ce texte. */
  | { readonly quoi: "editer"; readonly texte: string }
  /** Envoyer un NOUVEAU message : le précédent est plein. */
  | { readonly quoi: "envoyer"; readonly texte: string; readonly reste: string }
  /** Ne rien faire maintenant — trop tôt, ou on a renoncé aux éditions. */
  | { readonly quoi: "attendre"; readonly pourquoi: string };

/**
 * Où couper un texte trop long.
 *
 * On préfère une frontière de PARAGRAPHE, puis de ligne, puis d'espace — et
 * jamais au milieu d'un bloc de code, parce qu'une clôture ``` orpheline
 * casse le rendu de la messagerie pour tout le reste du message.
 */
export function ouCouper(texte: string, tailleMax: number): number {
  if (texte.length <= tailleMax) return texte.length;
  const debut = texte.slice(0, tailleMax);

  // Un nombre IMPAIR de clôtures signifie qu'on couperait à l'intérieur d'un
  // bloc. On recule alors avant son ouverture — mieux vaut un message plus
  // court qu'un rendu cassé jusqu'à la fin.
  const clotures = (debut.match(/```/gu) ?? []).length;
  if (clotures % 2 === 1) {
    const derniereOuverture = debut.lastIndexOf("```");
    if (derniereOuverture > 0) return derniereOuverture;
  }

  for (const frontiere of ["\n\n", "\n", " "]) {
    const coupe = debut.lastIndexOf(frontiere);
    // Pas trop en arrière : couper à 10 % du message pour trouver un saut de
    // ligne gaspillerait 90 % de la place disponible.
    if (coupe > tailleMax * 0.5) return coupe + frontiere.length;
  }
  return tailleMax;
}

/**
 * Que faire, maintenant, de ce qu'on a accumulé ?
 *
 * `dejaEnvoye` est ce que le message en cours affiche déjà ; `accumule` est le
 * texte complet voulu. La différence est ce qui reste à montrer.
 */
export function prochainGeste(
  accumule: string,
  dejaEnvoye: string,
  limites: LimitesDePlateforme,
  etat: EtatDuDebit,
): Geste {
  if (accumule === dejaEnvoye && !etat.termine) {
    return { quoi: "attendre", pourquoi: "rien de neuf à montrer" };
  }

  // Le message en cours est plein : on coupe et on ouvre le suivant. Ça prime
  // sur le rythme — un débordement ne se résout pas en attendant.
  if (accumule.length > limites.tailleMax) {
    const coupe = ouCouper(accumule, limites.tailleMax);
    return {
      quoi: "envoyer",
      texte: accumule.slice(0, coupe).trimEnd(),
      reste: accumule.slice(coupe),
    };
  }

  // LA RÈGLE QUI PRIME : la réponse finale part toujours, même si le rythme
  // nous a fait renoncer aux éditions. Un flux dégradé reste une réponse ; un
  // flux abandonné est un silence.
  if (etat.termine) {
    return { quoi: "editer", texte: accumule };
  }

  if (etat.refusDAffilee >= REFUS_AVANT_DE_RENONCER) {
    return {
      quoi: "attendre",
      pourquoi: `${String(etat.refusDAffilee)} refus d'inondation d'affilée : on cesse d'éditer et on garde la livraison finale. La plateforme ne dit plus « pas maintenant » mais « pas comme ça ».`,
    };
  }

  if (etat.depuisDerniereEdition < etat.intervalleCourant) {
    return {
      quoi: "attendre",
      pourquoi: `dernière édition il y a ${String(etat.depuisDerniereEdition)} s, intervalle courant ${String(etat.intervalleCourant)} s`,
    };
  }

  return { quoi: "editer", texte: accumule };
}

/**
 * L'intervalle après un refus d'inondation.
 *
 * On DOUBLE, on plafonne. Réessayer au même rythme garantit le refus suivant :
 * une limite qu'on touche est un signal, pas un obstacle à forcer.
 */
export function apresUnRefus(intervalleCourant: number): number {
  return Math.min(intervalleCourant * 2, INTERVALLE_MAX);
}

/**
 * L'intervalle après une édition RÉUSSIE.
 *
 * On revient au rythme nominal d'un coup, sans décroissance progressive : la
 * plateforme vient de dire oui, il n'y a rien à ménager. Une décroissance lente
 * ferait traîner la dégradation longtemps après sa cause.
 */
export function apresUneReussite(nominal: number): number {
  return nominal;
}
