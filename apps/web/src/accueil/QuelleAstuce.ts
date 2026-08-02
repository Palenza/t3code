/**
 * QUELLE ASTUCE MONTRER — celle qui parle de ce qu'on n'a pas trouvé.
 *
 * Chantier n°79. Le TEXTE des astuces appartient à Enzo — c'est le ton de la
 * marque, et je ne l'invente pas. Ce module-ci décide LAQUELLE montrer, et
 * cette décision n'est pas du goût : elle se mesure.
 *
 * ── Pourquoi une astuce au hasard ne vaut rien ────────────────────────────
 *
 * Le tirage au sort répète. Sur une liste de dix, on revoit la même trois
 * fois avant d'en découvrir la moitié — et une astuce déjà lue apprend à ne
 * plus lire les astuces.
 *
 * L'ordre fixe ne vaut pas mieux : il montre la première à quelqu'un qui la
 * connaît déjà par cœur, et enterre la dixième que personne n'atteint.
 *
 * ── La règle : parler de ce qu'ON N'A PAS FAIT ────────────────────────────
 *
 * Chaque astuce nomme une capacité — un raccourci, une commande, un outil. On
 * montre celle dont la capacité n'a JAMAIS servi. C'est la seule qui puisse
 * apprendre quelque chose ; les autres décrivent ce que l'humain fait déjà.
 *
 * Et quand tout a servi, on se TAIT. Une bannière qui parle encore une fois
 * la découverte finie devient du bruit — et le jour où on aura vraiment
 * quelque chose à dire, personne ne regardera plus cet endroit.
 *
 * Module PUR.
 */

export interface Astuce {
  readonly id: string;
  /**
   * La capacité dont elle parle, telle qu'elle apparaît dans l'usage : un nom
   * d'outil, une commande, un raccourci. C'est la CLÉ qui décide si l'astuce
   * a encore quelque chose à apprendre.
   */
  readonly capacite: string;
  /** Le texte montré. Rédaction d'Enzo — ceux d'ici sont des brouillons. */
  readonly texte: string;
}

/**
 * Les astuces, en BROUILLON.
 *
 * Chacune dit un fait vérifiable sur T3, pas une promesse. Le ton est à
 * réécrire par Enzo ; le contenu, lui, est du constat — et une astuce qui
 * décrit une capacité inexistante est pire qu'aucune astuce, parce qu'elle
 * envoie chercher quelque chose qui n'est pas là.
 */
export const ASTUCES: ReadonlyArray<Astuce> = [
  {
    id: "projet",
    capacite: "selecteur-de-projet",
    texte: "⌘P ouvre le sélecteur de projet. ⇧⌘F cherche dans le contenu des fils.",
  },
  {
    id: "checkpoint",
    capacite: "checkpoint",
    texte:
      "Chaque tour pose un point de reprise : un chantier qui tourne mal se rembobine sans perdre le fil.",
  },
  {
    id: "comptes",
    capacite: "rotation-de-compte",
    texte:
      "Plusieurs comptes peuvent se relayer. Quand l'un arrive à sa limite, le suivant prend la main sans interrompre le travail.",
  },
  {
    id: "skills",
    capacite: "Skill",
    texte:
      "Un dossier `.claude/skills` dans ton dépôt ajoute des compétences à l'agent, et elles se rechargent à chaud quand tu les édites.",
  },
  {
    id: "rappel",
    capacite: "rappel",
    texte:
      "L'agent peut retrouver ce qui s'est dit dans un ancien fil — la recherche ne coûte aucun appel de modèle.",
  },
  {
    id: "preuve",
    capacite: "preuve",
    texte:
      "Avant de conclure « c'est bon », l'agent peut relire ce qui a RÉELLEMENT tourné : quels tests, sur quelle étendue, avec quel verdict.",
  },
];

/**
 * L'astuce à montrer, ou `null` quand il n'y a plus rien à apprendre.
 *
 * `dejaFait` est l'ensemble des capacités que l'humain a déjà utilisées —
 * mesuré depuis l'usage réel, jamais deviné. `dejaVues` évite de reproposer
 * ce qu'on vient de montrer, même si la capacité n'a pas encore servi : une
 * astuce répétée en boucle est un reproche.
 */
export function quelleAstuce(
  dejaFait: ReadonlySet<string>,
  dejaVues: ReadonlySet<string>,
): Astuce | null {
  const utiles = ASTUCES.filter((astuce) => !dejaFait.has(astuce.capacite));
  // Toutes vues mais pas toutes essayées : on repart de la première utile
  // plutôt que de se taire. L'humain n'a pas encore essayé, l'astuce a encore
  // quelque chose à apprendre.
  return utiles.find((astuce) => !dejaVues.has(astuce.id)) ?? utiles[0] ?? null;
}

/**
 * Faut-il encore montrer quoi que ce soit ?
 *
 * Séparé de `quelleAstuce` parce que la question est différente : l'interface
 * doit pouvoir décider de ne RIEN afficher — pas d'espace réservé, pas de
 * cadre vide — sans avoir à interpréter un `null`.
 */
export function ilResteAApprendre(dejaFait: ReadonlySet<string>): boolean {
  return ASTUCES.some((astuce) => !dejaFait.has(astuce.capacite));
}
