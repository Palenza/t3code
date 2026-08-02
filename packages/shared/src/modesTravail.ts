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
 * Deux vérités de la doc officielle gouvernent cette traduction, toutes deux
 * apprises à la dure (audit 29/07 — la première version rendait le mode
 * Documentation incapable d'écrire QUOI QUE CE SOIT) :
 *
 * 1. « A broad deny rule blocks every matching call, including calls that
 *    also match a narrower allow rule — a deny rule can't carry allowlist
 *    exceptions. » Donc JAMAIS de deny(*) + allow(périmètre) : le deny gagne
 *    et le périmètre est mort.
 * 2. Une famille fermée se refuse par le NOM NU de l'outil (« Edit », pas
 *    « Edit(*) ») : le nom nu retire l'outil du contexte entièrement — c'est
 *    le seul refus qui tient dans TOUS les modes d'exécution. Et seules les
 *    règles Edit(chemin) sont matchées par les contrôles de fichiers — un
 *    Write(chemin) est accepté puis ignoré avec un avertissement.
 *
 * Le périmètre d'écriture devient donc : allow Edit(motif) — ces écritures
 * passent sans approbation — et TOUT LE RESTE retombe sur l'approbation
 * normale de la CLI. C'est un périmètre de confort, pas un mur ; le mur,
 * c'est le mode Revue (noms nus). La différence est dite dans l'UI.
 */
export function reglesPour(mode: ModeTravail): ReglesPermission {
  const deny: string[] = [];
  const allow: string[] = [];

  for (const famille of TOUTES_FAMILLES) {
    const outils = OUTILS_PAR_FAMILLE[famille];
    if (!mode.outils.includes(famille)) {
      // Nom NU : retire l'outil du contexte — le seul refus total qui tient.
      for (const outil of outils) deny.push(outil);
      continue;
    }
    if (famille === "ecriture" && (mode.perimetreEcriture?.length ?? 0) > 0) {
      // Les contrôles de fichiers ne matchent QUE Edit(chemin) — « Edit rules
      // cover all file-editing tools » : un seul allow par motif suffit.
      for (const motif of mode.perimetreEcriture ?? []) {
        allow.push(`Edit(${motif})`);
      }
    }
  }
  return { deny, allow };
}

/**
 * Les entrées de permission qu'un mode peut POSER — donc les SEULES qu'on ait
 * le droit de retirer.
 *
 * ── Pourquoi cette liste existe (03/08) ───────────────────────────────────
 *
 * Poser un mode écrasait `permissions.deny` et `permissions.allow` en entier,
 * et le mode Atelier — qui ne restreint rien, donc ne produit aucune règle —
 * tombait dans la branche « rien à restreindre » et SUPPRIMAIT le bloc
 * `permissions` complet. Un utilisateur qui avait écrit ses propres refus
 * (`Bash(rm:*)`, un `defaultMode`, des `additionalDirectories`) les perdait
 * en cliquant sur le mode qui promet de ne rien restreindre.
 *
 * La règle qui referme ça tient en une phrase : ON NE RETIRE QUE CE QU'ON A
 * POSÉ. Et pour l'appliquer sans inventer de marqueur — un marqueur mentirait
 * dès que l'utilisateur édite son fichier à la main — il suffit que le
 * vocabulaire de nos règles soit CLOS et connu :
 *
 *   · les refus sont toujours des NOMS NUS d'outils, tirés de la table des
 *     familles. Neuf valeurs possibles, quel que soit le mode ;
 *   · les autorisations sont toujours des `Edit(motif)`, où le motif vient
 *     d'un périmètre déclaré par un mode du catalogue.
 *
 * Tout le reste appartient à l'utilisateur, et se recopie intact.
 *
 * Zone d'ombre assumée : si quelqu'un écrit à la main EXACTEMENT une de nos
 * entrées, on la lui retirera en levant un mode. C'est indiscernable par
 * construction, et le sens de l'erreur est le bon — retirer un refus ne
 * détruit rien d'autre que la ligne, et retirer une autorisation rend la
 * CLI PLUS prudente, pas moins.
 */
export function entreesPosablesParUnMode(modes: ReadonlyArray<ModeTravail>): {
  readonly deny: ReadonlySet<string>;
  readonly allow: ReadonlySet<string>;
} {
  const deny = new Set<string>();
  for (const famille of TOUTES_FAMILLES) {
    for (const outil of OUTILS_PAR_FAMILLE[famille]) deny.add(outil);
  }
  const allow = new Set<string>();
  for (const mode of modes) {
    for (const motif of mode.perimetreEcriture ?? []) allow.add(`Edit(${motif})`);
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
      `Ton périmètre d'écriture est : ${perimetre.join(", ")}. Toute écriture en dehors devra être approuvée par l'humain — reste dedans.`,
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
