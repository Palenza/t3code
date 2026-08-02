import { useEffect, useRef } from "react";

/**
 * PRÉVENIR QUAND LA FENÊTRE N'EST PAS REGARDÉE — et seulement là.
 *
 * Le manque qui a coûté une journée entière le 01/08 : Enzo est resté bloqué
 * des heures sur des demandes d'approbation, fenêtre en arrière-plan, sans que
 * rien ne le prévienne. L'agent attendait, lui attendait l'agent.
 *
 * La taxonomie n'est PAS inventée ici : `packages/contracts/src/relay.ts` la
 * porte déjà (`notifyOnApproval`, `notifyOnInput`, `notifyOnCompletion`,
 * `notifyOnFailure`) — mais elle ne servait qu'au relais push mobile. On câble
 * la même sur la surface de BUREAU plutôt que d'en créer une seconde : deux
 * taxonomies pour la même chose divergent en silence.
 */

export type EtatDAttente = {
  readonly approbationsEnAttente: number;
  readonly saisiesEnAttente: number;
  /** Un tour est en train de tourner. Sa RETOMBÉE (vrai → faux) est ce qui
   * signale « réponse prête » — pas le fait d'être à l'arrêt, sinon on
   * notifierait au repos. */
  readonly tourEnCours: boolean;
  /** L'erreur du fil, s'il y en a une. C'est son APPARITION qui alerte. */
  readonly erreur: string | null;
};

export type AvisDeBureau = {
  readonly titre: string;
  readonly corps: string;
};

/**
 * LA DÉCISION, isolée du React pour être testable sans monter de composant —
 * comme `session-logic.ts` et `composer-logic.ts`. Ce qui compte ici n'est pas
 * « ça notifie » mais « ça se TAIT » : une notification de trop apprend à
 * ignorer le canal, et le jour où elle compte, personne ne regarde plus.
 *
 * Trois silences, chacun délibéré :
 *  · fenêtre regardée → l'interface montre DÉJÀ la demande, doubler est du bruit ;
 *  · pas de montée du compte → un re-rendu ne crée aucune attente nouvelle ;
 *  · permission non accordée → on ne la redemande JAMAIS de force, une
 *    demande surgie en plein travail est l'interruption qu'on veut supprimer.
 */
export function aviserOuSeTaire(input: {
  readonly avant: EtatDAttente;
  readonly apres: EtatDAttente;
  readonly fenetreRegardee: boolean;
  readonly permissionAccordee: boolean;
}): AvisDeBureau | null {
  if (input.fenetreRegardee || !input.permissionAccordee) return null;
  // L'ORDRE EST UN CHOIX, pas un hasard : ce qui BLOQUE l'agent passe devant ce
  // qui informe. Un tour qui attend ton feu vert ne repartira jamais seul ; un
  // tour fini, lui, a déjà rendu son travail. Et jamais deux avis d'un coup —
  // deux notifications simultanées, c'est la moitié qui ne sera pas lue.
  if (input.apres.approbationsEnAttente > input.avant.approbationsEnAttente) {
    return { titre: "Approbation attendue", corps: "Raptor attend ton feu vert pour continuer." };
  }
  if (input.apres.saisiesEnAttente > input.avant.saisiesEnAttente) {
    return { titre: "Saisie attendue", corps: "Raptor a besoin d'une réponse de ta part." };
  }
  // APPARITION de l'erreur, pas sa présence : sans ça, une erreur affichée
  // re-sonnerait à chaque re-rendu tant qu'elle reste à l'écran.
  if (input.avant.erreur === null && input.apres.erreur !== null) {
    return { titre: "Tour en échec", corps: input.apres.erreur };
  }
  // RETOMBÉE du tour, pas son arrêt : au repos, `tourEnCours` est faux en
  // permanence — notifier là-dessus sonnerait sans fin.
  if (input.avant.tourEnCours && !input.apres.tourEnCours) {
    return { titre: "Réponse prête", corps: "Raptor a fini de travailler." };
  }
  return null;
}

/** `document.hidden` couvre la fenêtre masquée ; `hasFocus()` couvre celle qui
 * est visible mais DERRIÈRE une autre app — le cas réel d'Enzo, qui travaille
 * dans le navigateur pendant que l'agent tourne. */
const fenetreRegardee = (): boolean => !document.hidden && document.hasFocus();

const permissionAccordee = (): boolean =>
  typeof Notification !== "undefined" && Notification.permission === "granted";

export function useNotificationsDeBureau(etat: EtatDAttente): void {
  const precedent = useRef<EtatDAttente>(etat);

  useEffect(() => {
    const avis = aviserOuSeTaire({
      avant: precedent.current,
      apres: etat,
      fenetreRegardee: fenetreRegardee(),
      permissionAccordee: permissionAccordee(),
    });
    precedent.current = etat;
    if (avis === null) return;
    try {
      new Notification(avis.titre, { body: avis.corps, tag: "t3code-attente" });
    } catch {
      // Une notification qui échoue ne doit JAMAIS casser la session : c'est
      // un confort, pas un chemin critique.
    }
  }, [etat]);
}
