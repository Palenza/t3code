/**
 * CE QU'UNE GÉNÉRATION A LE DROIT DE COÛTER.
 *
 * Chantier n°69. Le garde AVANT le moteur, comme le garde anti-zombie avant
 * l'ordonnanceur et l'autorisation avant l'adaptateur de passerelle.
 *
 * ── Pourquoi celui-ci n'est pas facultatif ────────────────────────────────
 *
 * Générer une image coûte de l'argent RÉEL à chaque appel. Un agent qui peut
 * en générer peut aussi en générer en boucle — un essai qui ne plaît pas, un
 * réessai, une variante, et la facture court sans que personne regarde. Ce
 * n'est pas une panne : chaque appel réussit, chaque appel est facturé, et
 * rien ne dépasse jusqu'au relevé.
 *
 * C'est la forme la plus coûteuse de nos modes de panne habituels : celui qui
 * ne laisse ni rouge, ni exception, ni trace.
 *
 * ── La règle : pas de budget, pas de dépense ─────────────────────────────
 *
 * Sans budget explicitement posé, on refuse. Toujours. Un budget absent n'est
 * pas « illimité », c'est « personne n'a décidé » — et personne n'a décidé
 * veut dire non.
 *
 * ── Ce qu'on refuse AUSSI, et qui surprend ───────────────────────────────
 *
 * Une génération identique à une précédente. Le même prompt rendra la même
 * image, à la variation aléatoire près ; la refaire coûte deux fois pour
 * obtenir la même chose. Un agent qui n'aime pas un résultat doit CHANGER sa
 * demande, pas la répéter.
 *
 * Module PUR : il décide, il ne dépense pas.
 */

/** Ce qu'on sait avant de dépenser. Tout en centimes — jamais de flottant. */
export interface Etat {
  /** Le plafond posé par l'humain, en centimes. `null` = personne n'a décidé. */
  readonly budgetCentimes: number | null;
  /** Ce qui a déjà été dépensé sur la période. */
  readonly dejaDepenseCentimes: number;
  /** Ce que cet appel coûtera, annoncé par le fournisseur. */
  readonly coutCentimes: number;
  /** Les demandes déjà servies, pour ne pas payer deux fois la même. */
  readonly dejaDemande: ReadonlySet<string>;
}

export type Verdict =
  | { readonly depense: true; readonly resteApres: number }
  | { readonly depense: false; readonly pourquoi: string; readonly quoiFaire: string };

/**
 * Une empreinte de la demande, pour reconnaître un doublon.
 *
 * Sur le texte NORMALISÉ : « un chat roux » et « Un chat roux. » sont la même
 * demande, et la seconde ne mérite pas d'être payée. Sans normalisation, le
 * garde se contournerait par une majuscule.
 */
export function empreinteDeDemande(demande: string): string {
  return demande
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Le montant, en euros, pour un humain. Les centimes sont pour la machine. */
const enEuros = (centimes: number): string => `${(centimes / 100).toFixed(2)} €`;

/**
 * Peut-on dépenser ?
 *
 * L'ordre est celui du refus le plus sûr : d'abord l'absence de décision,
 * puis le doublon (qui ne coûte rien à refuser), puis le dépassement.
 */
export function peutOnDepenser(etat: Etat, demande: string): Verdict {
  if (etat.budgetCentimes === null) {
    return {
      depense: false,
      pourquoi:
        "aucun budget n'a été posé pour la génération d'images. Un budget absent ne veut pas dire « illimité » : il veut dire que personne n'a décidé, et personne n'a décidé veut dire non.",
      quoiFaire:
        "Pose un plafond explicite avant d'autoriser la première génération. Chaque appel est facturé et chacun réussit — rien ne dépassera jusqu'au relevé.",
    };
  }

  const empreinte = empreinteDeDemande(demande);
  if (etat.dejaDemande.has(empreinte)) {
    return {
      depense: false,
      pourquoi:
        "cette demande a déjà été servie. Le même texte rendra la même image, à la variation aléatoire près : la refaire coûte deux fois pour obtenir la même chose.",
      quoiFaire:
        "Change la demande plutôt que de la répéter. Si le résultat ne convenait pas, c'est la description qu'il faut reprendre — pas le tirage.",
    };
  }

  const apres = etat.dejaDepenseCentimes + etat.coutCentimes;
  if (apres > etat.budgetCentimes) {
    return {
      depense: false,
      // A7 : la limite, sa valeur ET la demande. Un agent répare « max 5 €,
      // demandé 5,40 € » ; il ne peut rien faire d'un « refusé ».
      pourquoi: `budget dépassé : ${enEuros(etat.dejaDepenseCentimes)} déjà dépensés, ${enEuros(etat.coutCentimes)} demandés, plafond ${enEuros(etat.budgetCentimes)}.`,
      quoiFaire: `Il reste ${enEuros(Math.max(0, etat.budgetCentimes - etat.dejaDepenseCentimes))}. Attends la période suivante, ou demande à Enzo de relever le plafond — ne contourne pas.`,
    };
  }

  return { depense: true, resteApres: etat.budgetCentimes - apres };
}

/**
 * Le seuil à partir duquel on PRÉVIENT, avant de refuser.
 *
 * 80 % : à 100 % il est déjà trop tard, la génération suivante est refusée au
 * milieu d'un travail. Même raison que le seuil de quota des comptes — un
 * fil-piège posé AVANT la panne, pas un constat de décès.
 */
export const SEUIL_ALERTE = 0.8;

export function alerteDeBudget(etat: Etat): string | null {
  if (etat.budgetCentimes === null || etat.budgetCentimes === 0) return null;
  const part = etat.dejaDepenseCentimes / etat.budgetCentimes;
  if (part < SEUIL_ALERTE) return null;
  return `Budget d'images à ${String(Math.round(part * 100))} % (${enEuros(etat.dejaDepenseCentimes)} sur ${enEuros(etat.budgetCentimes)}). Les prochaines générations seront refusées au plafond.`;
}
