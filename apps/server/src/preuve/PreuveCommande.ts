/**
 * LE REGISTRE DE PREUVE — ce que l'agent a RÉELLEMENT prouvé.
 *
 * Absorption d'Hermès (`agent/verification_evidence.py`,
 * `verification_stop.py`), chantier n°22. Leur phrase fondatrice, qu'on
 * reprend telle quelle : le registre est *délibérément passif* — il ne lance
 * jamais rien, il ne bloque jamais rien, et surtout **il ne transforme jamais
 * une vérification CIBLÉE en « tout est vert »**.
 *
 * Chez nous il est encore moins intrusif que chez eux : T3 enregistre déjà
 * chaque `tool.completed` avec la commande et sa sortie. On LIT ce qui existe,
 * on n'instrumente rien.
 *
 * Module PUR : aucune base, aucun effet.
 *
 * ── Pourquoi ça compte ici ─────────────────────────────────────────────────
 *
 * La LOI du projet dit « pas de reçu, pas de chiffre » (A2) et « pas de diff,
 * pas de fix » (D3). Ce module donne le reçu : quand quelqu'un dit « c'est
 * vert », on peut répondre CE QUI a été lancé, SUR QUOI, et avec quel verdict.
 */

/** Ce qu'une commande cherche à prouver. */
export type NaturePreuve = "tests" | "types" | "lint" | "build" | "aucune";

/**
 * Les natures qui VÉRIFIENT quelque chose — « aucune » exclue.
 *
 * Le type le dit pour que l'appelant n'ait pas à s'en souvenir : un état de
 * preuve ne porte jamais sur « aucune », et un rendu qui prétendrait le
 * contraire ne compilerait pas.
 */
export type NatureVerifiee = Exclude<NaturePreuve, "aucune">;

export const NATURES_VERIFIEES: ReadonlyArray<NatureVerifiee> = ["tests", "types", "lint", "build"];

/**
 * L'ÉTENDUE de ce qui a été prouvé — la distinction qui fait tout.
 *
 * `vitest src/rappel/x.test.ts` prouve CE FICHIER. Il ne prouve pas que le
 * dépôt est vert, et le présenter ainsi est un mensonge écrit. C'est la faute
 * la plus fréquente et la plus coûteuse : on croit avoir un filet, on n'a
 * qu'un fil.
 */
export type EtenduePreuve = "ciblee" | "complete";

export type VerdictPreuve = "reussi" | "echoue" | "indetermine";

export interface Preuve {
  readonly nature: NaturePreuve;
  readonly etendue: EtenduePreuve;
  readonly verdict: VerdictPreuve;
  /** Pourquoi ce verdict — pour que l'humain n'ait pas à deviner. */
  readonly raison: string;
}

/**
 * Ce qui ANNULE toute valeur de preuve, quelle que soit la commande.
 *
 * Chacun de ces motifs fabrique un vert qui ne prouve rien :
 *
 *   · `|| true`, `; true`, `|| :`  — le code de sortie est écrasé
 *   · `--watch`, `--ui`            — la commande ne rend jamais de verdict
 *   · `--bail=0`, `--passWithNoTests` — un vert sans avoir rien exercé
 *   · `--no-verify`                — on saute précisément le contrôle
 *
 * Le cas `|| true` est le plus vicieux : la sortie ressemble EXACTEMENT à
 * celle d'un succès. Sans ce filtre, le registre certifierait un échec.
 */
const ANNULATEURS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\|\|\s*(?:true|:)\b/u, "le code de sortie est écrasé par « || true »"],
  [/;\s*(?:true|:)\s*$/u, "le code de sortie est écrasé par « ; true »"],
  [/--watch\b/u, "mode surveillance : la commande ne rend jamais de verdict"],
  [/--ui\b/u, "mode interface : aucun verdict en sortie"],
  [/--pass-?with-?no-?tests\b/iu, "peut passer au vert sans avoir exercé un seul test"],
  [/--no-verify\b/u, "saute précisément le contrôle qu'on prétend faire"],
];

/**
 * UN COMPOSÉ N'EST PAS UNE COMMANDE — la leçon des vraies données.
 *
 * Les commandes réellement exécutées ressemblent à
 * `cd X && pnpm exec vp fmt --write src/ && pnpm exec tsgo --noEmit | grep -v x`.
 * En classant la chaîne ENTIÈRE, on obtenait des verdicts faux : un
 * `tsgo --noEmit` rangé dans « tests » parce qu'un `vp test run` traînait
 * dans le même composé, et une étendue « ciblée » à cause des chemins d'un
 * `fmt` qui ne prouve rien.
 *
 * On découpe donc sur les séparateurs de shell et on classe CHAQUE segment.
 * (Même garde qu'Hermès, `_SHELL_SPLIT_RE` — je l'avais lu sans m'en servir,
 * et ce sont les 900 vraies commandes du fondateur qui me l'ont rappelé.)
 */
const SEPARATEURS_SHELL = /\s*(?:&&|\|\||;|\n)\s*/u;

/**
 * Ce qui précède un outil sans être l'outil : `pnpm exec vp test` est un
 * lancement de tests, `echo pnpm exec vp test` n'en est pas un.
 */
const LANCEURS = "(?:pnpm|npm|npx|yarn|bun|bunx)\\s+(?:exec\\s+|run\\s+|dlx\\s+)?";

/**
 * Les commandes qui prouvent quelque chose — reconnues UNIQUEMENT en position
 * de commande, jamais au milieu d'un argument.
 *
 * Le motif est ancré en tête de segment. Sans cet ancrage,
 * `for d in native oxlint-plugin-t3code release` passait pour un lancement de
 * lint : le nom d'un DOSSIER contenait « oxlint ». Un classifieur qui se
 * trompe de ce côté-là certifie des preuves qui n'existent pas.
 */
const NATURES: ReadonlyArray<readonly [RegExp, NaturePreuve]> = [
  [new RegExp(`^(?:${LANCEURS})?(?:vp\\s+)?(?:vitest|jest)\\b`, "u"), "tests"],
  [new RegExp(`^(?:${LANCEURS})?vp\\s+test\\b`, "u"), "tests"],
  [new RegExp(`^(?:${LANCEURS})?test\\b`, "u"), "tests"],
  [new RegExp(`^(?:${LANCEURS})?(?:tsgo|tsc)\\b`, "u"), "types"],
  [new RegExp(`^(?:${LANCEURS})?(?:oxlint|eslint)\\b`, "u"), "lint"],
  [new RegExp(`^(?:${LANCEURS})?vp\\s+lint\\b`, "u"), "lint"],
  [new RegExp(`^(?:${LANCEURS})?(?:vp\\s+)?build\\b`, "u"), "build"],
];

/**
 * Ce qui rend une exécution CIBLÉE : un chemin, un filtre, un motif.
 *
 * Sans l'un de ces marqueurs, la commande porte sur tout ce que sa
 * configuration couvre — c'est ce qu'on appelle complet.
 */
const CIBLAGE: ReadonlyArray<RegExp> = [
  /\s[\w./-]*\.(?:test|spec)\.[cm]?[jt]sx?\b/u,
  /\s-t\s|\s--test-name-pattern\b|\s--testNamePattern\b/u,
  /\s--filter\b|\s--project\b/u,
  /\s(?:src|apps|packages)\/\S+/u,
];

/**
 * Ce qu'un SEGMENT de commande prouve — ou pourquoi il ne prouve rien.
 *
 * `estErreur` vient du résultat d'outil enregistré ; `sortie` sert à
 * reconnaître un échec que le code de retour aurait pu taire.
 */
export function classerSegment(segment: string, sortie: string, estErreur: boolean): Preuve {
  // On retire ce qui précède sans commander : redirections, tubes en aval,
  // et l'environnement posé en préfixe (`FOO=1 vitest`).
  const nue = segment
    .trim()
    .replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/u, "")
    .replace(/\s*\|.*$/u, "");

  const nature = NATURES.find(([motif]) => motif.test(nue))?.[1] ?? "aucune";
  if (nature === "aucune") {
    return {
      nature,
      etendue: "ciblee",
      verdict: "indetermine",
      raison: "cette commande ne vérifie rien",
    };
  }

  const annulateur = ANNULATEURS.find(([motif]) => motif.test(segment));
  if (annulateur !== undefined) {
    return {
      nature,
      etendue: "ciblee",
      // INDÉTERMINÉ, pas « échoué » : on ne sait pas, et prétendre savoir
      // dans un sens ou dans l'autre serait le même mensonge.
      verdict: "indetermine",
      raison: annulateur[1],
    };
  }

  const etendue = CIBLAGE.some((motif) => motif.test(nue)) ? "ciblee" : "complete";
  const verdict = verdictDeSortie(sortie, estErreur);
  return {
    nature,
    etendue,
    verdict,
    raison:
      verdict === "reussi"
        ? etendue === "complete"
          ? "passage complet, au vert"
          : "passage ciblé, au vert — ne dit RIEN du reste du dépôt"
        : verdict === "echoue"
          ? "la commande a rapporté un échec"
          : "sortie illisible : aucun verdict ne peut en être tiré",
  };
}

/**
 * Toutes les preuves d'une commande, composés compris.
 *
 * Une seule ligne de shell peut prouver DEUX choses (`tsgo && vitest`) ou
 * zéro. On rend donc une liste, jamais un verdict unique — et les segments
 * qui ne vérifient rien sont écartés plutôt que comptés comme muets.
 *
 * LIMITE ASSUMÉE, et elle est structurelle : la sortie est enregistrée par
 * APPEL D'OUTIL, pas par segment. Dans `tsgo && vitest`, les deux segments
 * partagent donc le même verdict — celui de la ligne entière. C'est juste
 * quand elle échoue (`&&` s'arrête au premier rouge) et approximatif quand
 * elle réussit. On ne peut pas faire mieux sans instrumenter le shell, et
 * inventer une attribution par segment serait pire que de le dire.
 */
export function preuvesDeCommande(commande: string, sortie: string, estErreur: boolean): Preuve[] {
  return commande
    .split(SEPARATEURS_SHELL)
    .map((segment) => classerSegment(segment, sortie, estErreur))
    .filter((preuve) => preuve.nature !== "aucune");
}

/**
 * Le verdict lu dans la SORTIE, pas seulement dans le code de retour.
 *
 * Un `grep` en aval, un `| tail`, et le code de retour devient celui du
 * dernier maillon — le vert du tube masque le rouge de la commande. On lit
 * donc aussi ce qui est écrit.
 */
export function verdictDeSortie(sortie: string, estErreur: boolean): VerdictPreuve {
  if (estErreur) return "echoue";
  const texte = sortie.toLowerCase();
  if (/\b\d+\s+failed\b|\bfail(?:ed)?\s+\d+\b|\berror ts\d+|\bfailing\b/u.test(texte)) {
    return "echoue";
  }
  if (/\b\d+\s+passed\b|\ball tests passed\b|\bno issues found\b/u.test(texte)) {
    return "reussi";
  }
  // Rien de reconnaissable : on ne CHOISIT pas. Un « indéterminé » honnête
  // vaut mieux qu'un vert inventé — c'est le côté du gate qui n'écrit rien.
  return "indetermine";
}

/**
 * CE QU'ON PEUT DIRE de tout un lot de preuves, sans jamais l'élargir.
 *
 * La règle qui compte : une nature n'est « prouvée » que si au moins un
 * passage COMPLET est au vert. Dix passages ciblés verts ne font pas un
 * dépôt vert — c'est exactement l'élargissement qu'Hermès s'interdit, et
 * c'est la façon la plus courante de se mentir.
 */
export interface EtatDePreuve {
  readonly nature: NatureVerifiee;
  readonly prouve: boolean;
  readonly detail: string;
}

export function etatDesPreuves(preuves: ReadonlyArray<Preuve>): EtatDePreuve[] {
  return NATURES_VERIFIEES.map((nature) => {
    const siennes = preuves.filter((preuve) => preuve.nature === nature);
    if (siennes.length === 0) {
      return { nature, prouve: false, detail: "jamais lancé" };
    }
    const echecs = siennes.filter((preuve) => preuve.verdict === "echoue").length;
    if (echecs > 0) {
      return { nature, prouve: false, detail: `${echecs} passage(s) en échec` };
    }
    const complet = siennes.some(
      (preuve) => preuve.etendue === "complete" && preuve.verdict === "reussi",
    );
    if (complet) return { nature, prouve: true, detail: "passage complet au vert" };
    const ciblesVertes = siennes.filter(
      (preuve) => preuve.etendue === "ciblee" && preuve.verdict === "reussi",
    ).length;
    if (ciblesVertes > 0) {
      return {
        nature,
        prouve: false,
        detail: `${ciblesVertes} passage(s) CIBLÉ(S) au vert — le reste n'a pas été exercé`,
      };
    }
    return { nature, prouve: false, detail: "aucun verdict exploitable" };
  });
}
