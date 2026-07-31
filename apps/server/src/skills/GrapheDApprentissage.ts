/**
 * EST-CE QUE CE CHANGEMENT A AMÉLIORÉ QUELQUE CHOSE ?
 *
 * Chantier n°3. Leur trio `learning_graph.py` / `learning_mutations.py` /
 * `journey.py` trace les mutations d'une skill et les rend en frise.
 *
 * ── Ce qu'on ne refait pas ───────────────────────────────────────────────
 *
 * La traçabilité des mutations. Elle est DÉJÀ gratuite : 40 commits touchent
 * `.claude/skills/` dans Palenza, sur 24 skills distinctes, chacun avec sa
 * date et son message. Qui a changé quoi et quand, c'est un `git log` —
 * reconstruire ça dans une base serait une deuxième vérité pour la même
 * chose.
 *
 * ── Ce que ce module fait, et que git ne peut pas faire ──────────────────
 *
 * Le chantier s'appelle graphe d'APPRENTISSAGE, pas graphe de modifications.
 * Une frise de commits n'apprend rien : elle montre qu'on a changé des
 * choses. La seule question qui vaut est la CORRÉLATION — est-ce que ce
 * changement-là a amélioré quelque chose ?
 *
 * Y répondre demande de comparer l'usage AVANT et APRÈS. Et comme la réponse
 * la plus fréquente sera longtemps « on ne peut pas savoir », c'est cette
 * réponse-là qu'il faut rendre bien : nommée, chiffrée, et distincte de
 * « aucun effet ». Les deux se ressemblent et ne disent pas du tout la même
 * chose — l'une décrit le monde, l'autre décrit nos preuves (H4).
 *
 * ── Les trois pièges d'une corrélation naïve ─────────────────────────────
 *
 * 1. **Le voisin.** Si la skill est remutée trois jours plus tard, l'« après »
 *    de la première mutation contient l'effet de la seconde. La fenêtre
 *    d'après s'arrête donc à la mutation SUIVANTE, jamais à la fin des
 *    données.
 *
 * 2. **Le petit nombre.** 3 succès sur 3 puis 2 sur 3, c'est −33 points, et
 *    ça ne veut rien dire. D'où le test de robustesse : *si retirer UNE
 *    observation favorable suffit à effacer l'écart, il n'y a pas d'écart.*
 *    Il ne dépend d'aucune constante et s'adapte tout seul à la taille.
 *
 * 3. **La fenêtre encore ouverte.** Une mutation d'hier n'a pas d'après. Ce
 *    n'est pas « pas de preuve », c'est « pas ENCORE » — et la différence
 *    est actionnable : l'une demande d'utiliser la skill, l'autre d'attendre.
 *
 * Module PUR.
 */

/** Une mutation de skill, telle que git la donne. */
export interface Mutation {
  readonly skill: string;
  /** Millisecondes epoch. Fourni par l'appelant — ce module ne lit pas l'heure. */
  readonly quand: number;
  /** Le message de commit, pour que le verdict soit lisible sans git. */
  readonly libelle: string;
}

/** Un usage observé de la skill. */
export interface Observation {
  readonly skill: string;
  readonly quand: number;
  readonly reussi: boolean;
}

export type Verdict =
  | {
      readonly quoi: "amélioration";
      readonly avant: Taux;
      readonly apres: Taux;
      readonly ecart: number;
    }
  | {
      readonly quoi: "régression";
      readonly avant: Taux;
      readonly apres: Taux;
      readonly ecart: number;
    }
  | {
      readonly quoi: "sans-effet-mesurable";
      readonly avant: Taux;
      readonly apres: Taux;
      readonly ecart: number;
    }
  | { readonly quoi: "jamais-observée"; readonly pourquoi: string }
  | { readonly quoi: "trop-récent"; readonly pourquoi: string; readonly manque: number }
  | { readonly quoi: "pas-assez-de-preuves"; readonly pourquoi: string; readonly manque: number };

export interface Taux {
  readonly reussites: number;
  readonly total: number;
  /** Entre 0 et 1. Non défini quand `total` vaut 0 — d'où le `null`. */
  readonly part: number | null;
}

export interface Ligne {
  readonly mutation: Mutation;
  readonly verdict: Verdict;
}

/**
 * Le plancher par fenêtre.
 *
 * En dessous de 5, une seule observation pèse plus de 20 points — davantage
 * que tout effet qu'on pourrait honnêtement prétendre mesurer.
 *
 * Il ne fait pas double emploi avec le test de robustesse, et le cas qui les
 * sépare est réel : 0 réussite sur 2 avant, 5 sur 5 après. L'écart survit à
 * une observation retournée (+50 points), donc la robustesse le déclare
 * solide — alors que « 2 observations » ne décrit rien. Le plancher l'attrape,
 * la robustesse non.
 */
export const OBSERVATIONS_MINIMUM = 5;

const taux = (observations: ReadonlyArray<Observation>): Taux => {
  const reussites = observations.filter((o) => o.reussi).length;
  return {
    reussites,
    total: observations.length,
    part: observations.length === 0 ? null : reussites / observations.length,
  };
};

/**
 * L'écart survit-il au retrait d'UNE observation favorable ?
 *
 * On applique la pire correction possible d'une seule observation, dans
 * chacune des deux fenêtres, et on garde la plus défavorable. Si l'écart
 * change de signe ou s'annule, il n'y avait pas d'écart : il y avait une
 * observation.
 */
function survitAUneObservation(avant: Taux, apres: Taux): boolean {
  if (avant.part === null || apres.part === null) return false;
  const ecart = apres.part - avant.part;
  if (ecart === 0) return false;
  const sens = Math.sign(ecart);

  // Retourner une observation dans le sens qui RÉDUIT l'écart.
  const avantCorrige =
    sens > 0
      ? Math.min(avant.reussites + 1, avant.total) / avant.total
      : Math.max(avant.reussites - 1, 0) / avant.total;
  const apresCorrige =
    sens > 0
      ? Math.max(apres.reussites - 1, 0) / apres.total
      : Math.min(apres.reussites + 1, apres.total) / apres.total;

  const pire =
    sens > 0
      ? Math.min(apres.part - avantCorrige, apresCorrige - avant.part)
      : Math.max(apres.part - avantCorrige, apresCorrige - avant.part);

  return Math.sign(pire) === sens && pire !== 0;
}

const enPoints = (part: number): string => `${String(Math.round(part * 100))} %`;

/**
 * Le graphe : une ligne par mutation, chacune avec son verdict.
 *
 * `finDesDonnees` borne la fenêtre d'observation — c'est la date de la
 * dernière donnée disponible, pas « maintenant ». La distinction compte :
 * une projection élaguée ne sait rien du présent, et prétendre le contraire
 * transformerait un trou de données en régression.
 */
export function grapheDApprentissage(
  mutations: ReadonlyArray<Mutation>,
  observations: ReadonlyArray<Observation>,
  finDesDonnees: number,
): ReadonlyArray<Ligne> {
  const parSkill = new Map<string, Mutation[]>();
  for (const mutation of mutations) {
    const liste = parSkill.get(mutation.skill) ?? [];
    liste.push(mutation);
    parSkill.set(mutation.skill, liste);
  }

  const lignes: Ligne[] = [];
  for (const [skill, sesMutations] of parSkill) {
    const ordonnees = [...sesMutations].sort((a, b) => a.quand - b.quand);
    const siennes = observations.filter((o) => o.skill === skill);

    for (const [index, mutation] of ordonnees.entries()) {
      // Le voisin : la fenêtre d'avant commence à la mutation précédente, et
      // celle d'après s'arrête à la suivante. Sans ça, l'effet d'une mutation
      // est attribué à celle d'avant.
      const debutAvant = ordonnees[index - 1]?.quand ?? Number.NEGATIVE_INFINITY;
      const finApres = ordonnees[index + 1]?.quand ?? finDesDonnees;

      const avant = taux(siennes.filter((o) => o.quand >= debutAvant && o.quand < mutation.quand));
      const apres = taux(siennes.filter((o) => o.quand >= mutation.quand && o.quand <= finApres));
      lignes.push({ mutation, verdict: juger(avant, apres, mutation, ordonnees[index + 1]) });
    }
  }

  return lignes.sort(
    (a, b) =>
      a.mutation.skill.localeCompare(b.mutation.skill) || a.mutation.quand - b.mutation.quand,
  );
}

function juger(
  avant: Taux,
  apres: Taux,
  mutation: Mutation,
  suivante: Mutation | undefined,
): Verdict {
  if (avant.total === 0 && apres.total === 0) {
    return {
      quoi: "jamais-observée",
      pourquoi: `« ${mutation.skill} » n'a été utilisée ni avant ni après cette mutation. Ce n'est pas un manque de preuves sur le changement : c'est un fait sur la skill, et il vaut par lui-même.`,
    };
  }

  const plusPetite = Math.min(avant.total, apres.total);
  if (plusPetite < OBSERVATIONS_MINIMUM) {
    const manque = OBSERVATIONS_MINIMUM - plusPetite;
    // La fenêtre d'après est encore ouverte : attendre suffira. C'est un
    // conseil différent de « fais-la servir », d'où deux verdicts.
    const encoreOuverte = suivante === undefined && apres.total < OBSERVATIONS_MINIMUM;
    const chiffres = `${String(avant.total)} observation(s) avant, ${String(apres.total)} après ; il en faut ${String(OBSERVATIONS_MINIMUM)} de chaque côté`;
    return encoreOuverte
      ? {
          quoi: "trop-récent",
          pourquoi: `${chiffres}. La fenêtre d'après est encore ouverte : aucune mutation ne l'a refermée. Il manque ${String(manque)} utilisation(s) — attendre suffit.`,
          manque,
        }
      : {
          quoi: "pas-assez-de-preuves",
          pourquoi: `${chiffres}. La fenêtre est fermée et n'en contient pas assez : ce verdict ne viendra pas tout seul.`,
          manque,
        };
  }

  const ecart = (apres.part ?? 0) - (avant.part ?? 0);
  if (!survitAUneObservation(avant, apres)) {
    return { quoi: "sans-effet-mesurable", avant, apres, ecart };
  }
  return { quoi: ecart > 0 ? "amélioration" : "régression", avant, apres, ecart };
}

/**
 * Le graphe en texte, pour un agent.
 *
 * Le compte-rendu commence par ce qu'on NE SAIT PAS. C'est délibéré : sur une
 * fenêtre courte, les lignes sans verdict sont la majorité, et les enterrer
 * sous deux corrélations ferait lire « on a mesuré » là où la vérité est
 * « on a mesuré deux choses sur quarante ».
 */
export function raconterLeGraphe(lignes: ReadonlyArray<Ligne>): string {
  if (lignes.length === 0) {
    return "Aucune mutation de skill sur la fenêtre. Rien à corréler — et rien à en conclure sur la qualité des skills.";
  }

  const compte = (quoi: Verdict["quoi"]): number =>
    lignes.filter((l) => l.verdict.quoi === quoi).length;
  const juges = compte("amélioration") + compte("régression") + compte("sans-effet-mesurable");

  const entete = `${String(lignes.length)} mutation(s) examinée(s), ${String(juges)} jugeable(s). ${
    juges === 0
      ? "Aucune corrélation n'est établie : la fenêtre d'observation ne couvre pas encore la vie des skills mutées. Ce n'est pas « les changements n'ont rien donné », c'est « on ne peut pas encore le dire »."
      : `${String(compte("amélioration"))} amélioration(s), ${String(compte("régression"))} régression(s), ${String(compte("sans-effet-mesurable"))} sans effet mesurable.`
  }`;

  const detail = lignes.map((ligne) => {
    const { verdict, mutation } = ligne;
    const tete = `· ${mutation.skill} — ${mutation.libelle}`;
    if (verdict.quoi === "amélioration" || verdict.quoi === "régression") {
      return `${tete}\n  ${verdict.quoi.toUpperCase()} : ${enPoints(verdict.avant.part ?? 0)} → ${enPoints(verdict.apres.part ?? 0)} (${String(verdict.avant.total)} puis ${String(verdict.apres.total)} usages).`;
    }
    if (verdict.quoi === "sans-effet-mesurable") {
      return `${tete}\n  sans effet mesurable : ${enPoints(verdict.avant.part ?? 0)} → ${enPoints(verdict.apres.part ?? 0)}, un écart qu'une seule observation retournée efface.`;
    }
    return `${tete}\n  ${verdict.quoi} : ${verdict.pourquoi}`;
  });

  return [entete, "", ...detail].join("\n");
}
