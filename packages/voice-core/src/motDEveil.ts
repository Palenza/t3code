/**
 * RECONNAÎTRE LE MOT D'ÉVEIL DANS UNE TRANSCRIPTION IMPARFAITE.
 *
 * Chantier n°65. On ne reprend PAS leur pile : leurs trois moteurs ONNX
 * répondent à une contrainte de basse consommation — un détecteur minuscule
 * toujours allumé, pour n'allumer la reconnaissance complète qu'après. T3
 * tourne sur une machine de bureau branchée, avec `voice-core` qui porte déjà
 * la VAD et la transcription en flux. On écoute donc ce qui est déjà
 * transcrit, et il ne reste que la décision.
 *
 * L'invariant reste le leur, et c'est le seul qui compte pour l'humain :
 * **aucun audio ne sort de la machine.** Il est tenu par construction ici,
 * puisque ce module ne voit que du TEXTE déjà produit localement.
 *
 * ── Pourquoi une comparaison exacte ne marche pas ─────────────────────────
 *
 * Une transcription se trompe, surtout sur un mot isolé prononcé sans
 * contexte — le seul moment où le mot d'éveil est prononcé. « Raptor » revient
 * en « raptor », « rapteur », « rap tort », « wraptor ». Exiger l'exactitude
 * rendrait le mot d'éveil inutilisable, et l'humain conclurait que le micro ne
 * marche pas.
 *
 * ── Pourquoi une comparaison LARGE ne marche pas non plus ─────────────────
 *
 * Un seuil trop permissif déclenche sur une conversation ordinaire. Un agent
 * qui se réveille pendant qu'on parle à quelqu'un d'autre est pire qu'un agent
 * qui dort : on finit par couper le micro.
 *
 * D'où les trois bornes : une DISTANCE tolérée qui suit la longueur du mot, la
 * PREMIÈRE LETTRE qui doit correspondre, et une exigence de POSITION — le mot
 * d'éveil ouvre la phrase, il ne s'y cache pas. « Il faudrait un raptor pour
 * ce travail » n'est pas un appel.
 *
 * La première lettre mérite son mot : « captor » et « rapton » sont tous deux
 * à UNE correction de « raptor », et aucune distance ne les sépare. On
 * reconnaît un mot d'éveil à son attaque — c'est ce qu'on entend en premier,
 * et ce que la transcription rate en dernier.
 *
 * Module PUR.
 */

/**
 * La distance d'édition entre deux mots, TRANSPOSITIONS COMPRISES.
 *
 * Damerau et non Levenshtein simple, et ce n'est pas un raffinement : deux
 * lettres inversées sont l'erreur de transcription la PLUS fréquente, et
 * Levenshtein les compte pour deux corrections. « raptro » serait alors aussi
 * loin de « raptor » qu'un mot sans rapport — le mot d'éveil ne répondrait
 * jamais à l'erreur la plus courante.
 */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let avantPrecedente: number[] = [];
  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const courante = [i, ...Array.from({ length: b.length }, () => 0)];
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(
        (courante[j - 1] ?? 0) + 1,
        (precedente[j] ?? 0) + 1,
        (precedente[j - 1] ?? 0) + cout,
      );
      // Transposition : deux lettres inversées coûtent UNE correction.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        courante[j] = Math.min(courante[j] ?? 0, (avantPrecedente[j - 2] ?? 0) + 1);
      }
    }
    avantPrecedente = precedente;
    precedente = courante;
  }
  return precedente[b.length] ?? 0;
}

/**
 * Combien d'erreurs on tolère, selon la longueur du mot.
 *
 * Proportionnel et non constant : une erreur sur « ok » (50 %) est une autre
 * chose qu'une erreur sur « raptor » (17 %). Une tolérance fixe rendrait les
 * mots courts inutilisables ou les mots longs dangereux.
 *
 * Un cinquième, plancher à 1 : « raptor » (6) tolère 1 erreur, « ordinateur »
 * (10) en tolère 2.
 */
export function toleranceDe(mot: string): number {
  return Math.max(1, Math.floor(mot.length / 5));
}

/** Sans accents ni ponctuation : la transcription en pose de façon instable. */
export function nu(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export interface Eveil {
  readonly reveille: true;
  /** Ce qui suit le mot d'éveil — souvent la demande elle-même. */
  readonly demande: string;
}

/**
 * Le mot d'éveil ouvre-t-il cette transcription ?
 *
 * `null` quand non. On regarde les DEUX premiers mots seulement : le mot
 * d'éveil ouvre la phrase. « Il faudrait un raptor pour ce travail » n'est pas
 * un appel, et le laisser passer réveillerait l'agent pendant une conversation
 * qui ne le concerne pas — le genre d'erreur après quoi on coupe le micro.
 *
 * Deux mots et non un : les transcriptions insèrent volontiers un « euh », un
 * « hé », un article avant le mot lui-même.
 */
export function eveilDe(transcription: string, motDEveil: string): Eveil | null {
  const mots = nu(transcription)
    .split(" ")
    .filter((mot) => mot.length > 0);
  if (mots.length === 0) return null;

  const cible = nu(motDEveil);
  const tolere = toleranceDe(cible);

  for (const position of [0, 1]) {
    const candidat = mots[position];
    if (candidat === undefined) break;
    // La PREMIÈRE LETTRE doit correspondre. Sans cette exigence, « captor »
    // réveille autant que « rapton » : les deux sont à une correction de
    // « raptor », et aucune distance ne les sépare. Or on reconnaît un mot
    // d'éveil à son attaque — c'est ce qu'on entend en premier, et c'est ce
    // que la transcription rate en dernier.
    if (candidat[0] !== cible[0]) continue;
    if (distance(candidat, cible) <= tolere) {
      return { reveille: true, demande: mots.slice(position + 1).join(" ") };
    }
  }
  return null;
}

/**
 * Le délai avant qu'un nouvel éveil puisse compter.
 *
 * Sans lui, la fin de la phrase qui a réveillé l'agent le réveille une
 * seconde fois — la transcription en flux rend le même segment plusieurs
 * fois, enrichi. Deux secondes couvrent largement une phrase courte.
 */
export const REPOS_APRES_EVEIL_SECONDES = 2;

export function peutSeReveiller(secondesDepuisLeDernierEveil: number): boolean {
  return secondesDepuisLeDernierEveil >= REPOS_APRES_EVEIL_SECONDES;
}
