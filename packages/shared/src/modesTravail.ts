/**
 * Les modes de travail — un rôle, et un périmètre que l'agent ne peut PAS
 * franchir.
 *
 * Repris de Roo Code, dont les modes sont de la DONNÉE et non du code : nom,
 * définition de rôle, quand l'utiliser, instructions, et surtout un périmètre
 * de fichiers par groupe d'outils. Chez nous, `ProviderInteractionMode` valait
 * `["default", "plan"]` — deux modes figés dans le code, qu'un utilisateur ne
 * peut ni compléter ni restreindre.
 *
 * Ce que ça change, et c'est la seule raison de construire ça : aujourd'hui
 * les garde-fous sont des PHRASES dans un fichier de règles, que l'agent peut
 * enfreindre par distraction ou par mauvaise interprétation. Un périmètre
 * traduit en permissions de la CLI devient un REFUS mécanique. La différence
 * entre « ne touche pas à la prod » écrit quelque part, et l'impossibilité
 * d'écrire dans ce dossier.
 *
 * Module PUR : il traduit des modes en règles. L'écriture sur disque est
 * ailleurs, pour que la traduction se teste sans toucher au système.
 */

/**
 * Les familles d'outils qu'un mode peut ouvrir ou fermer.
 *
 * Volontairement grossier : quatre familles qu'un humain comprend sans
 * documentation, plutôt que la liste exhaustive des outils d'une CLI qui
 * changera au prochain nightly.
 */
export type FamilleOutils = "lecture" | "ecriture" | "commandes" | "reseau";

export interface ModeTravail {
  /** Identifiant stable : minuscules, chiffres et tirets. */
  readonly slug: string;
  readonly nom: string;
  /** Ce que l'agent EST dans ce mode — entre en tête du prompt système. */
  readonly role: string;
  /** Quand s'en servir, pour que le choix du mode ne soit pas un devinette. */
  readonly quandUtiliser?: string;
  /** Consignes supplémentaires, ajoutées au prompt. */
  readonly instructions?: string;
  /** Les familles autorisées. Une famille absente est REFUSÉE. */
  readonly outils: ReadonlyArray<FamilleOutils>;
  /**
   * Le périmètre d'écriture, en motifs de chemin (`docs/**`, `**\/*.md`).
   * Vide = tout le dépôt. N'a de sens que si « ecriture » est autorisée.
   */
  readonly perimetreEcriture?: ReadonlyArray<string>;
}

/** Les outils de la CLI Claude, groupés par famille. */
const OUTILS_PAR_FAMILLE: Record<FamilleOutils, ReadonlyArray<string>> = {
  lecture: ["Read", "Glob", "Grep"],
  ecriture: ["Edit", "Write", "NotebookEdit"],
  commandes: ["Bash"],
  reseau: ["WebFetch", "WebSearch"],
};

const TOUTES_FAMILLES: ReadonlyArray<FamilleOutils> = [
  "lecture",
  "ecriture",
  "commandes",
  "reseau",
];

export interface ReglesPermission {
  readonly deny: ReadonlyArray<string>;
  readonly allow: ReadonlyArray<string>;
}

/**
 * Traduit un mode en règles de permission pour la CLI.
 *
 * Le sens de la traduction compte : on REFUSE explicitement ce qui n'est pas
 * accordé, au lieu de n'autoriser que le permis. Une CLI qui gagne un nouvel
 * outil au prochain nightly serait sinon autorisée par défaut — et un
 * périmètre qui s'ouvre tout seul n'est pas un périmètre.
 */
export function reglesPour(mode: ModeTravail): ReglesPermission {
  const deny: string[] = [];
  const allow: string[] = [];

  for (const famille of TOUTES_FAMILLES) {
    const outils = OUTILS_PAR_FAMILLE[famille];
    if (!mode.outils.includes(famille)) {
      for (const outil of outils) deny.push(`${outil}(*)`);
      continue;
    }
    // Famille accordée mais périmètre restreint : on refuse tout ce qui sort
    // du périmètre, plutôt que d'énumérer ce qui y entre — l'énumération
    // laisserait passer tout ce qu'on aurait oublié de nommer.
    if (famille === "ecriture" && (mode.perimetreEcriture?.length ?? 0) > 0) {
      for (const outil of outils) {
        for (const motif of mode.perimetreEcriture ?? []) {
          allow.push(`${outil}(${motif})`);
        }
        deny.push(`${outil}(*)`);
      }
    }
  }
  return { deny, allow };
}

/** Le fragment de prompt système qu'un mode ajoute. */
export function promptDuMode(mode: ModeTravail): string {
  const morceaux = [mode.role.trim()];
  if (mode.instructions !== undefined && mode.instructions.trim().length > 0) {
    morceaux.push(mode.instructions.trim());
  }
  const perimetre = mode.perimetreEcriture ?? [];
  if (perimetre.length > 0) {
    // Dit AUSSI dans le prompt, alors que la permission suffirait : un refus
    // qui surprend fait perdre un tour à tout le monde. L'agent doit savoir
    // où il a le droit d'écrire AVANT d'essayer.
    morceaux.push(
      `Tu ne peux écrire que dans : ${perimetre.join(", ")}. Toute autre écriture sera refusée.`,
    );
  }
  return morceaux.join("\n\n");
}

const SLUG_VALIDE = /^[a-z0-9-]+$/u;

/** Ce qui empêche un mode d'être enregistré, ou une liste vide s'il est bon. */
export function defautsDuMode(mode: ModeTravail): ReadonlyArray<string> {
  const defauts: string[] = [];
  if (!SLUG_VALIDE.test(mode.slug)) {
    defauts.push("L'identifiant ne prend que des minuscules, des chiffres et des tirets.");
  }
  if (mode.nom.trim().length === 0) defauts.push("Il faut un nom.");
  if (mode.role.trim().length === 0) defauts.push("Il faut dire ce que l'agent est dans ce mode.");
  if (mode.outils.length === 0) {
    // Un mode sans aucun outil ne peut rien faire : mieux vaut le refuser à
    // la création que laisser quelqu'un découvrir un agent muet.
    defauts.push("Il faut au moins une famille d'outils, sinon l'agent ne peut rien faire.");
  }
  if ((mode.perimetreEcriture?.length ?? 0) > 0 && !mode.outils.includes("ecriture")) {
    defauts.push("Un périmètre d'écriture n'a pas de sens sans l'écriture autorisée.");
  }
  return defauts;
}

/**
 * Les modes livrés d'origine.
 *
 * Trois, pas douze : chacun répond à un usage qu'on a réellement, et un
 * catalogue qu'on ne lit pas ne sert personne.
 */
export const MODES_LIVRES: ReadonlyArray<ModeTravail> = [
  {
    slug: "revue",
    nom: "Revue",
    role: "Tu relis le code et tu signales. Tu ne corriges rien toi-même.",
    quandUtiliser: "Pour un avis sur du code sans risquer qu'il soit modifié.",
    outils: ["lecture"],
  },
  {
    slug: "documentation",
    nom: "Documentation",
    role: "Tu écris et corriges la documentation.",
    quandUtiliser: "Pour toucher aux docs sans risquer une ligne de code.",
    outils: ["lecture", "ecriture"],
    perimetreEcriture: ["**/*.md", "docs/**"],
  },
  {
    slug: "atelier",
    nom: "Atelier",
    role: "Tu construis, tu testes, tu corriges.",
    quandUtiliser: "Le mode de travail ordinaire, sans restriction.",
    outils: ["lecture", "ecriture", "commandes", "reseau"],
  },
];
