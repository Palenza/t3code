/**
 * LES SUGGESTIONS — l'agent propose, l'humain dispose, et le refus TIENT.
 *
 * Absorption d'Hermès (`cron/suggestions.py`), chantier n°49. Deux principes
 * repris tels quels, et ce sont eux qui font toute la valeur :
 *
 *   · CONSENTEMENT D'ABORD. Une suggestion ne crée JAMAIS d'automatisation.
 *     L'acceptation est explicite, toujours. Un outil qui programme des
 *     choses tout seul finit par être coupé en entier.
 *   · LE REFUS SE VERROUILLE, par une clé stable. Reproposer ce qui a été
 *     refusé transforme le suggéreur en bruit, et un bruit s'apprend à
 *     ignorer — y compris quand il a enfin raison.
 *
 * Module PUR : il observe et propose. Il n'écrit rien, ne planifie rien.
 *
 * ── Ce qu'on détecte ──────────────────────────────────────────────────────
 *
 * Une habitude, pas une répétition. Lancer quarante fois `git status` dans
 * une session n'est pas un rituel quotidien ; le lancer chaque matin pendant
 * trois jours en est un. On compte donc des JOURS DISTINCTS, jamais des
 * occurrences — c'est la seule mesure qui sépare l'habitude du martèlement.
 */

export interface Observation {
  /** Ce qui a été fait — une commande, une demande. */
  readonly quoi: string;
  /** Horodatage ISO. */
  readonly quand: string;
}

export interface Candidat {
  readonly quoi: string;
  /** Nombre de jours DISTINCTS où la chose a été refaite. */
  readonly jours: number;
  /** Heure la plus fréquente, au format HH, ou `null` si c'est éparpillé. */
  readonly heureHabituelle: string | null;
  /** Clé stable : c'est elle qui fait tenir un refus. */
  readonly cle: string;
}

/**
 * Combien de jours distincts avant de proposer.
 *
 * Trois. Deux pourrait être une coïncidence — le même geste refait le
 * lendemain parce que la veille avait échoué. Trois jours, c'est un rituel,
 * et proposer trop tôt use le crédit du suggéreur : on refuse une fois, on
 * n'écoute plus jamais.
 */
export const JOURS_AVANT_PROPOSITION = 3;

/**
 * La part d'occurrences qu'une heure doit rassembler pour être « habituelle ».
 *
 * En-dessous, c'est éparpillé et proposer une heure serait inventer. On rend
 * alors `null` plutôt qu'une moyenne : la moyenne de 8 h et 20 h est 14 h, une
 * heure à laquelle la chose n'a JAMAIS été faite.
 */
const PART_HEURE_DOMINANTE = 0.5;

/**
 * CE QUI N'EST PAS UNE INTENTION.
 *
 * Passé sur 4 702 commandes réelles, le détecteur proposait d'automatiser
 * `cd /tmp`, `sleep 45` et `node -e "` — de la navigation, de l'attente et un
 * fragment. Pendant ce temps, le vrai rituel (« vérifier les quatre lanes du
 * VPS ») était noyé dedans.
 *
 * Une habitude automatisable FAIT quelque chose. Se déplacer, lister, dormir,
 * afficher : ce sont des gestes de passage, refaits cent fois par jour par
 * construction. Les proposer noie les vraies trouvailles sous du bruit — et
 * un suggéreur bruyant se fait couper avant d'avoir eu raison une fois.
 */
const GESTES_DE_PASSAGE = new Set([
  "cd",
  "ls",
  "pwd",
  "echo",
  "cat",
  "sleep",
  "export",
  "which",
  "printf",
  "head",
  "tail",
  "wc",
  "chmod",
  "mkdir",
  "touch",
  "true",
  "clear",
]);

/**
 * L'INTENTION d'une ligne de shell — ou `null` si elle n'en porte pas.
 *
 * On saute les gestes de passage jusqu'à trouver ce qui agit. `cd X && lancer`
 * a pour intention `lancer`, pas `cd X` : prendre le premier segment revenait
 * à proposer d'automatiser un déplacement de dossier.
 */
export function intentionDe(commande: string): string | null {
  // LA PREMIÈRE LIGNE SEULEMENT. Découper sur les retours à la ligne coupait
  // À L'INTÉRIEUR des heredocs : le corps du script devenait des « segments »,
  // et le détecteur proposait d'automatiser « import json » ou « /** ».
  const premiereLigne = commande.split("\n")[0] ?? "";

  // UNE CHARGE EN LIGNE N'EST PAS UNE INTENTION RÉUTILISABLE. `python3 - <<PY`
  // et `node -e '…'` ne veulent rien dire sans le script qui suit : c'est LUI
  // qui porte le sens, et il change à chaque fois. Proposer d'automatiser
  // l'enveloppe reviendrait à programmer « lance un script », sans le script.
  if (/<<-?\s*['"]?\w/u.test(premiereLigne)) return null;

  for (const segment of premiereLigne.split(/&&|\|\||;/u)) {
    const nu = segment.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/u, "");
    if (nu.length === 0) continue;
    // Une affectation NUE n'est pas une intention : `t=0` posait une variable
    // pour la ligne suivante. Le préfixe d'environnement retiré plus haut ne
    // couvre que les noms en MAJUSCULES ; celui-ci passait au travers.
    if (/^[A-Za-z_][A-Za-z0-9_]*=\S*$/u.test(nu)) continue;
    const tete = nu.split(/\s/u)[0] ?? "";
    if (GESTES_DE_PASSAGE.has(tete)) continue;
    // Un fragment : la ligne a été coupée au milieu d'une chaîne. L'automatiser
    // rejouerait un morceau de commande. On regarde les DEUX sortes de
    // guillemets — `node -e '` n'en a qu'une seule et passait au travers.
    if ((nu.match(/"/gu) ?? []).length % 2 !== 0) continue;
    // Les apostrophes ne comptent PAS comme des guillemets déséquilibrés :
    // « relever l'usine » en porte une, et c'est du français, pas un
    // fragment. Même piège que dans le module des promesses ce matin. Les
    // charges en ligne se détectent par leur DRAPEAU, pas par comptage.
    if (/\s-(?:e|c)\b|\s--eval\b/u.test(nu)) continue;
    return nu;
  }
  return null;
}

/** Le jour d'un horodatage, sans l'heure. */
const jourDe = (quand: string) => quand.slice(0, 10);
const heureDe = (quand: string) => quand.slice(11, 13);

/**
 * La clé de dédoublonnage.
 *
 * Elle doit survivre à tout ce qui change sans changer la nature de la
 * proposition : la casse, les espaces multiples, l'heure. Sinon le même refus
 * se contourne tout seul à la variation près, et la suggestion revient sous
 * un déguisement.
 */
export function cleDeDedoublonnage(quoi: string): string {
  return quoi.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

/**
 * Les candidats à l'automatisation, du plus installé au moins installé.
 */
export function detecterRecurrences(
  observations: ReadonlyArray<Observation>,
  jourMinimum = JOURS_AVANT_PROPOSITION,
): Candidat[] {
  const parCle = new Map<string, { quoi: string; jours: Set<string>; heures: string[] }>();

  for (const observation of observations) {
    const quoi = intentionDe(observation.quoi) ?? "";
    if (quoi.length === 0) continue;
    const cle = cleDeDedoublonnage(quoi);
    const groupe = parCle.get(cle) ?? { quoi, jours: new Set<string>(), heures: [] };
    groupe.jours.add(jourDe(observation.quand));
    groupe.heures.push(heureDe(observation.quand));
    parCle.set(cle, groupe);
  }

  const candidats: Candidat[] = [];
  for (const [cle, groupe] of parCle) {
    if (groupe.jours.size < Math.max(1, jourMinimum)) continue;
    candidats.push({
      quoi: groupe.quoi,
      jours: groupe.jours.size,
      heureHabituelle: heureDominante(groupe.heures),
      cle,
    });
  }
  return candidats.sort((a, b) => b.jours - a.jours);
}

function heureDominante(heures: ReadonlyArray<string>): string | null {
  if (heures.length === 0) return null;
  const compte = new Map<string, number>();
  for (const heure of heures) compte.set(heure, (compte.get(heure) ?? 0) + 1);
  let meilleure: string | null = null;
  let combien = 0;
  for (const [heure, n] of compte) {
    if (n > combien) {
      combien = n;
      meilleure = heure;
    }
  }
  // Éparpillé : on ne propose pas d'heure plutôt que d'en inventer une.
  return combien / heures.length >= PART_HEURE_DOMINANTE ? meilleure : null;
}

/**
 * Écarte ce qui a DÉJÀ été refusé, et ce qui est déjà automatisé.
 *
 * Le verrou du refus est ce qui distingue un suggéreur d'un harceleur. On ne
 * repropose jamais — pas « moins souvent », jamais.
 */
export function aProposer(
  candidats: ReadonlyArray<Candidat>,
  refusees: ReadonlyArray<string>,
  dejaAutomatisees: ReadonlyArray<string> = [],
): Candidat[] {
  const bloquees = new Set([
    ...refusees.map(cleDeDedoublonnage),
    ...dejaAutomatisees.map(cleDeDedoublonnage),
  ]);
  return candidats.filter((candidat) => !bloquees.has(candidat.cle));
}

/**
 * La phrase qu'on montre à l'humain.
 *
 * Elle porte l'OBSERVATION avant la proposition : « tu as fait ça trois jours
 * de suite » se vérifie ; « tu devrais automatiser ça » se discute. On donne
 * la raison d'abord pour que le refus soit informé, pas réflexe.
 */
export function phraseDeProposition(candidat: Candidat): string {
  const quand =
    candidat.heureHabituelle === null
      ? ""
      : ` — presque toujours vers ${candidat.heureHabituelle} h`;
  return `Tu as fait « ${candidat.quoi} » ${candidat.jours} jours différents${quand}. On l'automatise ?`;
}
