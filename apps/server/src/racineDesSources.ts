/**
 * OÙ SONT LES SOURCES — sans demander d'où on a lancé le test.
 *
 * Cinq tests de structure lisent l'arbre des sources pour vérifier des
 * invariants que le typage ne peut pas porter : « aucun module de décision
 * n'est muet », « chaque toolkit MCP passe par la porte de sortie », « le
 * cœur de la passerelle ne nomme aucune plateforme en dur ».
 *
 * Tous partaient de `process.cwd() + "src"`. Ça marche quand le runner est
 * lancé depuis `apps/server`, et ça donne cinq ROUGES quand il est lancé
 * depuis la racine du dépôt — pour une raison qui n'a rien à voir avec le
 * code testé.
 *
 * ── Pourquoi ça méritait un correctif et pas une habitude ────────────────
 *
 * Un rouge qui ne parle pas du code est pire qu'un test absent : il apprend à
 * lire les rouges sans y croire. C'est exactement la protection que M11 et A4
 * demandent — « un rouge parle de MON changement jusqu'à preuve du
 * contraire » — et une seule exception régulière suffit à l'user.
 *
 * La racine se déduit donc du fichier LUI-MÊME : ce module vit dans `src/`,
 * donc `src/` est son propre dossier. Aucune supposition sur l'appelant.
 *
 * ── Pourquoi il ne joint pas les chemins ─────────────────────────────────
 *
 * Assembler demanderait `node:path`, que la maison interdit au profit du
 * service `Path` d'Effect. Les appelants tiennent déjà ce service : ils
 * joignent eux-mêmes. Une fonction de moins ici vaut mieux qu'une dérogation
 * de diagnostic.
 */

/**
 * Le dossier `src` du serveur, quel que soit le répertoire courant.
 *
 * `import.meta.dirname` est le dossier de CE fichier, qui est `src` par
 * construction. Si ce module déménage un jour, le chemin bouge avec lui —
 * ce qui est le comportement voulu, et l'inverse d'un chemin en dur.
 */
export const racineDesSources = (): string => import.meta.dirname;
