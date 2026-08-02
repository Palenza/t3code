/**
 * LA GARDE DE FALAISE — l'état survit au compactage parce qu'il est ÉCRIT.
 *
 * La mesure qui justifie ce module vit dans `Compactage.ts` : chaque
 * compactage jette entre 97,5 % et 98,6 % de la fenêtre, et trois messages
 * survivent mot pour mot. Tout le reste devient un résumé qu'on ne contrôle
 * pas — le SDK n'offre aucune prise sur son contenu (vérifié sur 0.3.170 :
 * `PreCompact` n'a pas de sortie spécifique).
 *
 * Puisqu'on ne peut pas choisir ce que le résumé garde, on fait survivre
 * l'état AILLEURS : sur disque, écrit par l'agent lui-même, AVANT la chute.
 * Deux gestes, injectés par le tuyau `UserPromptSubmit.additionalContext` —
 * le même canal texte qu'« ultrathink », employé vers le haut : le shell dit
 * au modèle ce que le modèle ne peut pas savoir.
 *
 *   1. AVANT la falaise (≥ SEUIL_ALERTE_PART) : « écris ton état de reprise
 *      maintenant ». Une fois par franchissement — une bande qui crie à
 *      chaque tour, on apprend à ne plus la lire.
 *   2. APRÈS un compactage : « ton contexte vient d'être remplacé par un
 *      résumé ; relis ton état écrit, re-vérifie sur pièce ». Une fois par
 *      compactage.
 *
 * Module PUR sur les décisions ; le registre par fil est process-local et
 * non persisté, comme la santé des comptes : au redémarrage tout repart à
 * zéro, et au pire on redit une consigne — redire coûte une ligne, se taire
 * coûte une session amnésique.
 */

/**
 * La part de fenêtre au-delà de laquelle on demande l'état de reprise.
 *
 * Reçu (Compactage.ts, 9 compactages mesurés) : l'auto-compactage part vers
 * ~1 000 000 de jetons — la fenêtre pleine. À 80 %, il reste ~200 000 jetons,
 * soit plusieurs tours : assez pour finir le geste en cours ET écrire l'état.
 * À trois tours de la fin (cf. TOURS_AVANT_ALERTE), il est déjà trop tard
 * pour découper proprement.
 */
export const SEUIL_ALERTE_PART = 0.8;

export interface EtatDeFalaise {
  /** Dernière part de fenêtre observée, 0..1, ou `null` avant tout relevé. */
  readonly part: number | null;
  /** La consigne « écris ton état » a déjà été donnée pour CE franchissement. */
  readonly alerteDonnee: boolean;
  /** Un compactage vient d'avoir lieu ; le ré-ancrage n'a pas encore été dit. */
  readonly reAncrageDu: boolean;
}

const VIERGE: EtatDeFalaise = { part: null, alerteDonnee: false, reAncrageDu: false };

const parFil = new Map<string, EtatDeFalaise>();

export function etatDeFalaise(threadId: string): EtatDeFalaise {
  return parFil.get(threadId) ?? VIERGE;
}

/** Vide tout — tests uniquement. */
export function viderFalaises(): void {
  parFil.clear();
}

/**
 * Note un relevé d'usage (l'événement `thread.token-usage.updated`).
 *
 * Redescendre SOUS le seuil réarme l'alerte : un fil compacté retombe vers
 * 2 % de la fenêtre, et le prochain franchissement méritera sa consigne à
 * lui. Sans ce réarmement, la garde ne parlerait qu'une fois par vie de fil.
 */
export function noterUsage(threadId: string, usedTokens: number, maxTokens: number): void {
  if (!Number.isFinite(usedTokens) || !Number.isFinite(maxTokens) || maxTokens <= 0) return;
  const part = Math.max(0, Math.min(1, usedTokens / maxTokens));
  const avant = etatDeFalaise(threadId);
  parFil.set(threadId, {
    ...avant,
    part,
    alerteDonnee: part >= SEUIL_ALERTE_PART ? avant.alerteDonnee : false,
  });
}

/** Note qu'un compactage vient d'avoir lieu sur ce fil. */
export function noterCompactage(threadId: string): void {
  const avant = etatDeFalaise(threadId);
  // L'alerte se réarme aussi : le prochain 80 % est un NOUVEAU franchissement.
  parFil.set(threadId, { ...avant, reAncrageDu: true, alerteDonnee: false });
}

/**
 * La consigne à joindre au prochain message, ou `undefined` s'il n'y a rien
 * à dire — le cas normal, et il doit le rester : chaque phrase injectée ici
 * entre dans le contexte de TOUS les tours suivants.
 *
 * Le ré-ancrage passe AVANT l'alerte de seuil : juste après un compactage,
 * la part est retombée, et la seule chose urgente est de rappeler que la
 * mémoire de travail vient d'être remplacée par un résumé.
 */
export function consignePourLeProchainTour(threadId: string): string | undefined {
  const etat = etatDeFalaise(threadId);

  if (etat.reAncrageDu) {
    parFil.set(threadId, { ...etat, reAncrageDu: false });
    return (
      "⚠️ CONTEXTE COMPACTÉ — ta fenêtre vient d'être remplacée par un résumé " +
      "(~98 % du fil jeté, trois messages gardés mot pour mot). Avant de " +
      "continuer : si tu tenais un état de reprise écrit (fichier de notes, " +
      "TODO, état de session), RELIS-LE maintenant. Re-vérifie sur pièce tout " +
      "fait critique dont tu n'es plus sûr — le résumé raconte, il ne prouve pas."
    );
  }

  if (etat.part !== null && etat.part >= SEUIL_ALERTE_PART && !etat.alerteDonnee) {
    parFil.set(threadId, { ...etat, alerteDonnee: true });
    const pourcent = Math.round(etat.part * 100);
    return (
      `⚠️ CONTEXTE À ${pourcent} % — le compactage approche, et il jettera ~98 % ` +
      "de ce fil. AVANT d'entamer autre chose, écris un état de reprise DURABLE " +
      "(fichier de notes du projet) : décisions prises, fichiers touchés, ce qui " +
      "reste à faire, et les commandes qui prouvent l'état courant. Ce qui est " +
      "écrit survivra ; ce qui est retenu mourra."
    );
  }

  return undefined;
}
