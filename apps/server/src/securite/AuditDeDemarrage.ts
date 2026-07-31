/**
 * AUDIT DE DÉMARRAGE — dire au démarrage ce que personne ne regardera jamais.
 *
 * Chantier n°20, chaîne C. Aspiré de `hermes_cli/security_audit_startup.py`
 * (282 l.), dont la doctrine est la bonne : **consultatif, jamais bloquant**.
 * Il journalise et rend des phrases lisibles ; il ne lève rien et n'empêche
 * jamais un démarrage.
 *
 * ── Ce qu'on prend, et ce qui n'est pas notre monde ───────────────────────
 *
 * Leurs quatre contrôles visent un démon exposé sur un serveur : compte root,
 * sshd avec mot de passe, conteneur sans volume persistant, écouteur réseau
 * sans authentification. Les deux du milieu ne nous concernent pas — T3 est
 * une application de bureau, elle ne gère ni sshd ni conteneur.
 *
 * On garde le compte root, et on ajoute le contrôle qu'ils n'ont pas et qui
 * nous a trouvé un vrai défaut.
 *
 * ── Ce que le premier passage a trouvé, sur la vraie machine ──────────────
 *
 *   ~/.t3/userdata/clerk-tokens.json     -rw-rw-rw-   ← 0666
 *   ~/.t3/userdata/settings.json         -rw-r--r--   ← 0644
 *   ~/.claude/.credentials.json          -rw-------   ← Claude Code, lui, le fait
 *
 * Le premier porte un jeton d'authentification de 712 caractères et il est
 * **modifiable** par n'importe quel utilisateur local — pas seulement
 * lisible. Un autre compte de la machine peut le REMPLACER.
 *
 * Il n'est pas écrit par nous : c'est `@clerk/electron/storage`, une
 * dépendance. On ne peut donc pas corriger son mode d'écriture — seulement
 * le détecter et le resserrer. C'est précisément à ça que sert un audit de
 * démarrage plutôt qu'une règle de code.
 *
 * Le second ne porte aucun secret (les jetons vivent au trousseau), mais il
 * porte le `homePath` de chaque compte : l'adresse exacte du fichier
 * d'identifiants. Ce n'est pas une fuite, c'est une carte.
 *
 * Module PUR : on lui donne des faits, il rend des constats.
 */

export type GraviteDAudit = "grave" | "avertissement";

export interface Constat {
  readonly id: string;
  readonly gravite: GraviteDAudit;
  /** Nommé pour un HUMAIN comme pour un agent (A7) : le fait, puis le geste. */
  readonly quoi: string;
  /** Le chemin concerné, quand il y en a un — pour pouvoir réparer. */
  readonly chemin?: string;
}

/** Ce qu'un fichier d'état a le droit d'être. */
export type Sensibilite =
  /** Porte un jeton, un mot de passe, une clé. Personne d'autre ne lit. */
  | "secret"
  /** Porte la carte de l'installation : où sont les comptes, les homes. */
  | "carte";

export interface FichierObserve {
  readonly chemin: string;
  /** Les bits de permission POSIX, ex. 0o644. `null` si inconnus. */
  readonly mode: number | null;
  readonly sensibilite: Sensibilite;
}

/** Le mode attendu : lecture et écriture par le seul propriétaire. */
export const MODE_ATTENDU = 0o600;

/** Les bits qui donnent un droit à quelqu'un d'AUTRE que le propriétaire. */
const BITS_DES_AUTRES = 0o077;
/** Parmi eux, ceux qui donnent le droit d'ÉCRIRE. */
const BITS_ECRITURE_DES_AUTRES = 0o022;

/** `0o644` → `rw-r--r--`, pour que le constat se lise sans calcul mental. */
export function enLettres(mode: number): string {
  const trio = (bits: number) =>
    `${(bits & 4) === 0 ? "-" : "r"}${(bits & 2) === 0 ? "-" : "w"}${(bits & 1) === 0 ? "-" : "x"}`;
  return `${trio((mode >> 6) & 7)}${trio((mode >> 3) & 7)}${trio(mode & 7)}`;
}

/**
 * Le constat d'UN fichier.
 *
 * Un fichier modifiable par autrui est plus grave qu'un fichier lisible : on
 * ne parle plus de fuite mais de substitution. Quelqu'un peut REMPLACER le
 * jeton, et l'application s'authentifiera avec le sien.
 */
export function constatDeFichier(fichier: FichierObserve): Constat | null {
  if (fichier.mode === null) return null;
  const desAutres = fichier.mode & BITS_DES_AUTRES;
  if (desAutres === 0) return null;

  const ecrivable = (fichier.mode & BITS_ECRITURE_DES_AUTRES) !== 0;
  const quoi =
    fichier.sensibilite === "secret"
      ? "un jeton d'authentification"
      : "la carte de l'installation (où vivent les comptes et leurs identifiants)";

  if (ecrivable) {
    return {
      id: "fichier-modifiable-par-autrui",
      gravite: "grave",
      chemin: fichier.chemin,
      quoi: `${fichier.chemin} est en ${enLettres(fichier.mode)} : n'importe quel utilisateur de cette machine peut le MODIFIER. Il porte ${quoi} — le remplacer suffirait à se faire passer pour toi. Attendu : ${enLettres(MODE_ATTENDU)}.`,
    };
  }
  return {
    id: "fichier-lisible-par-autrui",
    gravite: fichier.sensibilite === "secret" ? "grave" : "avertissement",
    chemin: fichier.chemin,
    quoi: `${fichier.chemin} est en ${enLettres(fichier.mode)} : n'importe quel utilisateur de cette machine peut le LIRE. Il porte ${quoi}. Attendu : ${enLettres(MODE_ATTENDU)}.`,
  };
}

/**
 * L'audit complet, à partir de faits déjà collectés.
 *
 * `estRoot` est POSIX seulement ; sur Windows il vaut simplement `false`, et
 * le contrôle disparaît sans bruit — comme chez eux.
 */
export function auditer(input: {
  readonly estRoot: boolean;
  readonly fichiers: ReadonlyArray<FichierObserve>;
}): ReadonlyArray<Constat> {
  const constats: Constat[] = [];

  if (input.estRoot) {
    constats.push({
      id: "tourne-en-root",
      gravite: "grave",
      quoi: "T3 tourne en root. Tout ce que l'agent exécute a les droits du système entier — y compris ce qu'une page web lui aura suggéré de faire. Relance-le avec ton compte habituel.",
    });
  }

  for (const fichier of input.fichiers) {
    const constat = constatDeFichier(fichier);
    if (constat !== null) constats.push(constat);
  }
  return constats;
}

/**
 * La phrase de tête. Silencieuse quand tout va bien — un audit qui parle à
 * chaque démarrage devient un bruit qu'on filtre.
 */
export function resumeDAudit(constats: ReadonlyArray<Constat>): string | null {
  if (constats.length === 0) return null;
  const graves = constats.filter((c) => c.gravite === "grave").length;
  return `Audit de démarrage : ${graves} point(s) grave(s), ${constats.length - graves} avertissement(s). ${constats.map((c) => c.quoi).join(" ")}`;
}

/** Les fichiers dont le mode se resserre tout seul, et ceux qu'on signale. */
export function aReparer(constats: ReadonlyArray<Constat>): ReadonlyArray<string> {
  const chemins = constats.map((c) => c.chemin).filter((c): c is string => c !== undefined);
  return [...new Set(chemins)];
}
