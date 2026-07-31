/**
 * CIBLES SENSIBLES — tout ce qui est DANS l'espace de travail n'est pas
 * ordinaire pour autant.
 *
 * Chantier n°11, chaîne C. Données aspirées de `tools/approval.py` d'Hermès
 * (4 131 lignes) : `_SSH_SENSITIVE_PATH`, `_CREDENTIAL_FILES`,
 * `_SHELL_RC_FILES`, `_PROJECT_ENV_PATH`, `_SYSTEM_CONFIG_PATH`.
 *
 * ── Le trou, vérifié le 31/07 ─────────────────────────────────────────────
 *
 * Le chantier n°21 a fermé la SORTIE de l'espace de travail : plus aucune
 * écriture ne suit un lien vers l'extérieur. Mais il ne dit rien de ce qui est
 * DEDANS, et le contrôle de chemin accepte :
 *
 *     .git/hooks/pre-commit    ← ACCEPTÉ
 *     .env                     ← ACCEPTÉ
 *     .claude/settings.json    ← ACCEPTÉ
 *
 * Écrire dans `.git/hooks/pre-commit`, c'est faire exécuter du code arbitraire
 * au prochain commit — par l'humain, sur sa machine, avec ses droits. C'est
 * une escalade complète, et elle ne franchit aucune frontière.
 *
 * `.git/config` est pire encore parce que ça ne ressemble pas à du code :
 * `core.pager`, `core.fsmonitor`, `core.sshCommand` sont des COMMANDES que git
 * lance tout seul.
 *
 * ── Où on refuse, et où on se contente de le DIRE ─────────────────────────
 *
 * Refuser trop, c'est casser l'outil pour tout le monde et se faire
 * contourner. On refuse donc UNIQUEMENT ce dont l'écriture par cet outil n'a
 * aucun usage légitime — `.git/`, qui appartient à git.
 *
 * Le reste — un `.env`, les réglages, les hooks de l'agent — est signalé
 * bruyamment. Ce sont des fichiers qu'on édite pour de vraies raisons ; les
 * bloquer les ferait éditer autrement, sans trace.
 *
 * ── Le piège macOS, qu'ils documentent ────────────────────────────────────
 *
 * `/etc`, `/var`, `/tmp`, `/home` sont des liens vers `/private/…`. Un motif
 * qui ne regarde que `/etc/` se contourne en écrivant `/private/etc/`. Chez
 * nous le `realpath` du n°21 le résout déjà — mais la liste le nomme quand
 * même, parce qu'un jour quelqu'un s'en servira ailleurs.
 *
 * Module PUR.
 */

export type NatureDeCible = "interdite" | "sensible" | "ordinaire";

export interface VerdictDeCible {
  readonly nature: NatureDeCible;
  /** Nommé pour un AGENT (A7) : ce qui a été demandé et pourquoi. */
  readonly pourquoi: string;
}

/**
 * Ce dont l'écriture par l'outil d'espace de travail n'a AUCUN usage
 * légitime, et dont l'écriture donne l'exécution de code.
 */
const INTERDITES: ReadonlyArray<{ readonly motif: RegExp; readonly quoi: string }> = [
  {
    // `.git/hooks/*` s'exécute au prochain commit. `.git/config` porte
    // `core.pager`, `core.fsmonitor`, `core.sshCommand` — des commandes que
    // git lance de lui-même. Tout `.git/` appartient à git ; on n'y écrit pas
    // à la main, on utilise git.
    motif: /(^|\/)\.git(\/|$)/u,
    quoi: "`.git/` appartient à git : un hook s'exécute au prochain commit, et `.git/config` porte des commandes que git lance seul (core.pager, core.fsmonitor, core.sshCommand). Passe par une commande git, jamais par une écriture de fichier.",
  },
];

/**
 * Ce qui s'écrit pour de vraies raisons, mais jamais par distraction.
 *
 * Aspiré d'Hermès et adapté : leurs chemins visent `~/.ssh`, `~/.netrc`,
 * `~/.bashrc` — hors d'un espace de travail, donc déjà couverts chez nous par
 * le garde de sortie du n°21. On garde ceux qui vivent DANS un dépôt.
 */
const SENSIBLES: ReadonlyArray<{ readonly motif: RegExp; readonly quoi: string }> = [
  {
    motif: /(^|\/)\.env(\.[^/]+)?$/u,
    quoi: "un fichier d'environnement porte des secrets (S2 : jamais commités, jamais dans une URL)",
  },
  {
    motif: /(^|\/)\.(npmrc|pypirc|netrc|pgpass)$/u,
    quoi: "fichier d'identifiants de gestionnaire de paquets ou de réseau",
  },
  {
    motif: /(^|\/)\.claude\/(settings|settings\.local)\.json$/u,
    quoi: "les réglages de l'agent — y écrire change ses permissions et ses hooks",
  },
  {
    motif: /(^|\/)\.claude\/hooks(\/|$)/u,
    quoi: "un hook de l'agent s'exécute à chaque outil : c'est du code, pas de la configuration",
  },
  {
    motif: /(^|\/)(\.bashrc|\.zshrc|\.profile|\.bash_profile|\.zprofile)$/u,
    quoi: "fichier de démarrage de shell : il s'exécute à chaque nouvelle session",
  },
  {
    // Aspiré tel quel, avec son miroir macOS : `/etc` est un lien vers
    // `/private/etc`, donc un motif sur `/etc/` seul se contourne.
    motif: /^\/(etc|private\/(etc|var|tmp|home))\//u,
    quoi: "chemin de configuration système (et son miroir macOS /private/…)",
  },
];

/**
 * Classe un chemin relatif à la racine de l'espace de travail.
 *
 * On sépare par `/` avant de tester : un dossier nommé `mon.git` ou un fichier
 * `notes.env` ne sont pas des cibles sensibles, et les confondre ferait crier
 * le garde sur du travail ordinaire — la panne la plus sûre pour qu'on le
 * débranche.
 */
export function verdictDeCible(cheminRelatif: string): VerdictDeCible {
  const normalise = cheminRelatif.replaceAll("\\", "/");

  for (const interdite of INTERDITES) {
    if (interdite.motif.test(normalise)) {
      return {
        nature: "interdite",
        pourquoi: `Écriture refusée sur « ${cheminRelatif} » : ${interdite.quoi}`,
      };
    }
  }
  for (const sensible of SENSIBLES) {
    if (sensible.motif.test(normalise)) {
      return {
        nature: "sensible",
        pourquoi: `« ${cheminRelatif} » est une cible SENSIBLE : ${sensible.quoi}. L'écriture est faite, mais elle est dite.`,
      };
    }
  }
  return { nature: "ordinaire", pourquoi: "" };
}
