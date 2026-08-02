/**
 * QUEL PAQUET CETTE COMMANDE VA-T-ELLE VRAIMENT CHERCHER ?
 *
 * Chantier n°15, chaîne C. Aspiré de `tools/osv_check.py` (169 l.).
 *
 * ── Ce que leur fichier est vraiment, contre ce que le catalogue en disait ──
 *
 * Le catalogue annonçait « vérification CVE/OSV comme outil ». En lisant le
 * code, ce n'en est pas une : ils ignorent DÉLIBÉRÉMENT les CVE et ne
 * regardent que les avis `MAL-*` — les paquets confirmés malveillants. C'est
 * beaucoup plus tranchant, et beaucoup plus juste.
 *
 * La raison tient en une phrase : une CVE dans une dépendance est un risque
 * qu'on arbitre, un paquet malveillant est du code hostile qu'on exécute. Le
 * premier mérite un rapport, le second un refus. Confondre les deux donne une
 * alerte qui crie sur les trois quarts de l'écosystème npm, donc une alerte
 * qu'on éteint.
 *
 * ── Pourquoi cette moitié-là est PURE ─────────────────────────────────────
 *
 * Deviner le paquet visé par une ligne de commande est un travail d'analyse
 * syntaxique, pas de réseau. Le séparer permet de le tester sur les formes
 * tordues — un paquet scopé, une version épinglée, un `--package` qui nomme
 * autre chose que le binaire exécuté — sans jamais appeler OSV.
 *
 * ── Deux cas que leur parseur rate, et qu'on prend ────────────────────────
 *
 * 1. `npx --yes <paquet>` : chez eux `--yes` est sauté (il commence par `-`)
 *    et le paquet est bien trouvé. Mais `npx -y <paquet>` aussi. En revanche
 *    `npx -p a -p b` ne rend que `a` — comme chez eux, et c'est assumé : on
 *    ne prétend pas couvrir les commandes composées, on rend `null` plutôt
 *    qu'une demi-réponse quand la forme n'est pas reconnue.
 * 2. `bunx` et `pnpm dlx` n'existent pas chez eux. Ce sont les commandes que
 *    NOUS utilisons — un contrôle qui ne connaît pas nos propres outils ne
 *    contrôle rien.
 *
 * Module PUR.
 */

/** Les écosystèmes qu'OSV nomme ainsi. Les chaînes sont leur vocabulaire. */
export type Ecosysteme = "npm" | "PyPI";

export interface PaquetVise {
  readonly ecosysteme: Ecosysteme;
  readonly nom: string;
  /** La version épinglée, ou `null` quand la commande n'en fixe aucune. */
  readonly version: string | null;
}

/**
 * Les lanceurs qui vont CHERCHER un paquet avant de l'exécuter.
 *
 * C'est ça qui compte, et pas « est-ce que la commande installe » : `npx`
 * télécharge et exécute en un geste, sans laisser de trace dans un
 * `package.json`. C'est exactement le chemin qu'un paquet malveillant
 * emprunte — celui que personne ne relit.
 */
const LANCEURS: ReadonlyMap<string, Ecosysteme> = new Map([
  ["npx", "npm"],
  ["npx.cmd", "npm"],
  // Les nôtres. Absents de chez eux, et ce sont ceux qu'on tape.
  ["bunx", "npm"],
  ["dlx", "npm"],
  ["uvx", "PyPI"],
  ["uvx.cmd", "PyPI"],
  ["pipx", "PyPI"],
]);

/** `--package NOM` et `-p NOM` nomment un paquet DIFFÉRENT du binaire exécuté. */
const DIT_LE_PAQUET = new Set(["--package", "-p"]);

const basename = (chemin: string): string =>
  chemin.split(/[/\\]/u).findLast((p) => p.length > 0) ?? "";

/**
 * Le paquet qu'une commande va chercher, ou `null` si ce n'en est pas une.
 *
 * `null` couvre deux cas très différents et c'est volontaire ici : « cette
 * commande ne télécharge rien » et « c'est un lanceur mais je n'ai pas su
 * lire ses arguments ». Les distinguer donnerait à l'appelant un choix qu'il
 * ne peut pas faire — dans les deux cas, il n'y a rien à interroger.
 */
export function paquetALancer(
  commande: string,
  arguments_: ReadonlyArray<string>,
): PaquetVise | null {
  const base = basename(commande).toLowerCase();

  // `pnpm dlx <paquet>` : le lanceur est le SECOND mot. Sans ce cas, la
  // commande la plus courante du dépôt passerait pour un non-lanceur.
  const viaPnpm = base === "pnpm" && arguments_[0] === "dlx";
  const ecosysteme = viaPnpm ? "npm" : LANCEURS.get(base);
  if (ecosysteme === undefined) return null;

  const jeton = premierJetonDePaquet(viaPnpm ? arguments_.slice(1) : arguments_);
  if (jeton === null) return null;

  const { nom, version } = ecosysteme === "npm" ? lireNpm(jeton) : lirePyPI(jeton);
  return nom.length === 0 ? null : { ecosysteme, nom, version };
}

/**
 * Le premier argument qui désigne un paquet.
 *
 * `--package NOM` gagne sur le premier positionnel : sans ça, `npx --package
 * @scope/outil binaire` ferait interroger « binaire », qui n'est pas un
 * paquet publié — donc une réponse vide, donc un feu vert accordé au mauvais
 * nom. Une vérification qui regarde à côté est pire qu'aucune.
 */
function premierJetonDePaquet(arguments_: ReadonlyArray<string>): string | null {
  let attendreLeSuivant = false;
  let positionnel: string | null = null;

  for (const argument of arguments_) {
    if (attendreLeSuivant) return argument;
    if (DIT_LE_PAQUET.has(argument)) {
      attendreLeSuivant = true;
      continue;
    }
    if (argument.startsWith("--package=")) return argument.slice("--package=".length);
    if (argument.startsWith("-")) continue;
    // On NOTE le positionnel sans s'arrêter : un `--package` plus loin dans la
    // ligne doit encore pouvoir le supplanter.
    positionnel ??= argument;
  }
  return positionnel;
}

/** `@scope/nom@version` ou `nom@version`. */
function lireNpm(jeton: string): { nom: string; version: string | null } {
  if (jeton.startsWith("@")) {
    const scope = /^(@[^/]+\/[^@]+)(?:@(.+))?$/u.exec(jeton);
    return scope === null
      ? { nom: jeton, version: null }
      : { nom: scope[1] ?? jeton, version: scope[2] ?? null };
  }
  const coupure = jeton.lastIndexOf("@");
  if (coupure <= 0) return { nom: jeton, version: null };
  const version = jeton.slice(coupure + 1);
  // `latest` n'est pas une version : l'envoyer à OSV interrogerait une
  // version qui n'existe pas, et une réponse vide se lirait « rien à
  // signaler ». Sans version, OSV répond sur le paquet entier — ce qu'on veut.
  return { nom: jeton.slice(0, coupure), version: version === "latest" ? null : version };
}

/** `nom==version`, avec ou sans extras `nom[extra]==version`. */
function lirePyPI(jeton: string): { nom: string; version: string | null } {
  const lu = /^([a-zA-Z0-9._-]+)(?:\[[^\]]*\])?(?:==(.+))?$/u.exec(jeton);
  return lu === null
    ? { nom: jeton, version: null }
    : { nom: lu[1] ?? jeton, version: lu[2] ?? null };
}

/**
 * Ce qu'OSV rend, réduit à ce qui nous intéresse.
 *
 * On ne garde QUE les `MAL-*`. Une CVE dans une dépendance est un risque
 * qu'on arbitre ; un paquet malveillant est du code hostile qu'on s'apprête à
 * exécuter. Mélanger les deux donne une alerte qui crie sur la moitié de npm,
 * donc une alerte qu'on éteint — et le jour où elle a raison, personne ne la
 * lit.
 */
export interface AvisOsv {
  readonly id: string;
  readonly resume: string;
}

export function malveillantsSeulement(vulnerabilites: unknown): ReadonlyArray<AvisOsv> {
  if (!Array.isArray(vulnerabilites)) return [];
  const avis: AvisOsv[] = [];
  for (const brut of vulnerabilites) {
    if (typeof brut !== "object" || brut === null) continue;
    const id = (brut as { id?: unknown }).id;
    if (typeof id !== "string" || !id.startsWith("MAL-")) continue;
    const resume = (brut as { summary?: unknown }).summary;
    avis.push({ id, resume: typeof resume === "string" ? resume : id });
  }
  return avis;
}

/**
 * Le verdict, en une phrase destinée à un AGENT (A7) : ce qui a été trouvé,
 * sur quel paquet, et quoi faire.
 */
export function verdictDePaquet(
  paquet: PaquetVise,
  avis: ReadonlyArray<AvisOsv>,
): { readonly malveillant: boolean; readonly phrase: string } {
  const nomComplet = paquet.version === null ? paquet.nom : `${paquet.nom}@${paquet.version}`;
  if (avis.length === 0) {
    // H4 : c'est un fait sur NOUS. OSV ne connaît pas tout, et un paquet
    // publié il y a une heure n'y est pas encore.
    return {
      malveillant: false,
      phrase: `Aucun avis de malveillance connu chez OSV pour ${nomComplet} (${paquet.ecosysteme}). Ça ne veut pas dire que le paquet est sain : ça veut dire qu'OSV n'a rien — un paquet publié il y a une heure n'y figure pas encore.`,
    };
  }
  const ids = avis.map((a) => a.id).join(", ");
  return {
    malveillant: true,
    phrase: `NE LANCE PAS ${nomComplet} (${paquet.ecosysteme}) : ${avis.length} avis de MALVEILLANCE confirmée chez OSV — ${ids}. ${avis.map((a) => a.resume).join(" · ")} Vérifie le nom : la cause la plus fréquente est une faute de frappe sur un paquet légitime.`,
  };
}
