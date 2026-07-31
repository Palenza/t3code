/**
 * CE QU'ON PROPOSERAIT D'AUTORISER — et tout ce qu'on refuse de proposer.
 *
 * Chantier n°12. Leur `hermes_cli/approvals_suggest.py` compte les refus et
 * propose les plus fréquents. On garde l'idée et on inverse la charge de la
 * preuve, parce que ce module n'est pas comme les autres : les autres gardes
 * REFUSENT quelque chose, celui-ci propose d'OUVRIR.
 *
 * ── Pourquoi l'inversion n'est pas de la prudence décorative ──────────────
 *
 * Une suggestion acceptée élargit une frontière de sécurité, définitivement
 * et silencieusement. Un refus de suggérer coûte un aller-retour. L'asymétrie
 * est totale, donc le doute profite au refus — toujours.
 *
 * ── Les quatre choses qu'on refuse de proposer, et pourquoi ───────────────
 *
 * 1. **Un outil nu.** « Bash a été refusé 12 fois » ne se propose pas en
 *    `Bash`. Ce serait donner tout le shell parce qu'on a vu douze commandes.
 *    Une suggestion est aussi ÉTROITE que la preuve qui la porte.
 *
 * 2. **Une commande qu'on n'a pas.** Un refus sans sa commande ne prouve
 *    rien de suggérable. Il compte comme une preuve MANQUANTE, pas comme un
 *    vote — et le module le dit, parce que c'est ça le fait actionnable.
 *
 * 3. **Une chaîne shell.** `git status && rm -rf /` commence par `git
 *    status` : autoriser sa forme autoriserait la suite. Un `&&`, un `|`,
 *    un `;`, une substitution — et la commande n'est plus ce qu'elle
 *    paraît. Non suggérable, quel que soit le nombre de refus.
 *
 * 4. **Une commande destructrice.** Et celle-ci est la vraie : douze refus
 *    de `rm -rf` ne sont pas douze arguments pour l'autoriser, ce sont douze
 *    fois où le garde a fait son travail. LA FRÉQUENCE N'EST PAS UN
 *    CONSENTEMENT. C'est précisément l'endroit où un compteur naïf se
 *    retourne contre celui qu'il protège.
 *
 * ── Le seuil, et son reçu ────────────────────────────────────────────────
 *
 * Trois occasions AU MOINS, sur DEUX JOURS distincts au moins.
 *
 * La seconde condition porte tout le poids, et elle vient d'une mesure :
 * sur les 13 refus réellement enregistrés (7,4 jours d'usage), **12 sont
 * tombés le même jour** — le 29/07. Un compteur brut y aurait lu « Bash : 12
 * refus, motif écrasant ». C'était un après-midi, donc une intention, pas une
 * habitude. Une habitude revient un autre jour.
 *
 * Module PUR : il propose, il n'autorise rien.
 */

/** Un refus, tel que la projection le garde. */
export interface Refus {
  /** Le nom de l'outil refusé — `Bash`, `Write`… */
  readonly outil: string;
  /**
   * La commande refusée, si on l'a.
   *
   * `null` arrive pour deux raisons différentes, et le module les sépare :
   * l'outil n'est pas `Bash` (un `Write` porte un chemin), ou la jointure
   * n'a rien trouvé. Seule la seconde est une preuve manquante.
   */
  readonly commande: string | null;
  /** Le jour du refus, en `AAAA-MM-JJ`. C'est la granularité qui décide. */
  readonly jour: string;
}

export interface Suggestion {
  /** La forme à autoriser — jamais plus large que la preuve. */
  readonly forme: string;
  readonly outil: string;
  readonly occasions: number;
  readonly jours: number;
  /** De quoi juger sans relire la base. */
  readonly exemples: ReadonlyArray<string>;
}

export interface Bilan {
  readonly suggestions: ReadonlyArray<Suggestion>;
  /**
   * Ce qui a été vu et écarté, avec la raison. C'est la moitié utile quand
   * `suggestions` est vide : sans elle, on lirait « rien à proposer » là où
   * la vérité est « on n'a pas de quoi proposer », qui n'est pas la même
   * phrase (H4).
   */
  readonly ecartes: ReadonlyArray<{ readonly quoi: string; readonly pourquoi: string }>;
  /** Le compte-rendu chiffré, prêt à lire par un agent (A7). */
  readonly resume: string;
}

/** Trois occasions : en dessous, un refus est un accident. */
export const OCCASIONS_MINIMUM = 3;
/**
 * Deux jours : c'est la condition qui sépare une habitude d'un après-midi.
 * Mesurée, pas devinée — voir l'en-tête.
 */
export const JOURS_MINIMUM = 2;

/**
 * Ce qui fait qu'une commande n'est plus ce qu'elle paraît.
 *
 * Un enchaînement, une redirection, une substitution : la forme lue au début
 * ne décrit plus ce qui s'exécutera à la fin.
 */
const OPERATEURS_SHELL = /[;&|><`$(){}]|\n/;

/**
 * Les verbes qu'on ne proposera jamais, quel que soit le compteur.
 *
 * La liste est courte EXPRÈS : elle ne prétend pas décrire tout ce qui est
 * dangereux — un tel inventaire n'existe pas, et prétendre l'avoir écrit
 * serait la mine. Elle attrape ce dont la destruction est le métier. Le
 * reste est attrapé par les trois autres refus, qui ne dépendent d'aucune
 * liste.
 */
const VERBES_DESTRUCTEURS = new Set([
  "rm",
  "rmdir",
  "dd",
  "mkfs",
  "shutdown",
  "reboot",
  "kill",
  "killall",
  "pkill",
  "chown",
  "chmod",
  "curl",
  "wget",
  "ssh",
  "scp",
  "sudo",
  "eval",
  "exec",
]);

/**
 * Les sous-commandes qui rendent un programme sûr… destructeur.
 *
 * `git status` est anodin, `git push --force` ne l'est pas. La forme
 * suggérée s'arrête au sous-verbe, donc c'est au sous-verbe qu'on juge.
 */
const SOUS_VERBES_DESTRUCTEURS = new Set([
  "git push",
  "git reset",
  "git clean",
  "git rebase",
  "npm publish",
  "pnpm publish",
  "docker rm",
  "docker rmi",
]);

/**
 * La forme suggérable d'une commande : le programme et son sous-verbe.
 *
 * `git status --short` → `git status`. On s'arrête là parce que c'est la
 * granularité à laquelle une autorisation se pose, et parce qu'aller plus
 * loin proposerait des drapeaux qui changent d'une fois sur l'autre.
 *
 * `null` quand la commande n'est pas réductible à une forme honnête.
 */
export function formeDeCommande(commande: string): string | null {
  const propre = commande.trim();
  if (propre === "" || OPERATEURS_SHELL.test(propre)) return null;

  const mots = propre.split(/\s+/);
  const programme = mots[0];
  if (programme === undefined || programme === "") return null;
  // Un chemin absolu vers un binaire ne se propose pas : `/tmp/x/rm` porte
  // le même nom que `rm` sans être le même programme.
  if (programme.includes("/")) return null;

  const suite = mots[1];
  // Un second mot n'est un sous-verbe que s'il ressemble à un verbe. Un
  // drapeau ou un chemin n'en est pas un : `ls -la` a pour forme `ls`.
  const estUnSousVerbe =
    suite !== undefined && /^[a-z][a-z0-9-]*$/.test(suite) && !suite.startsWith("-");
  return estUnSousVerbe ? `${programme} ${suite}` : programme;
}

/** Une forme dont on ne discute pas, quel que soit le nombre de refus. */
export function estDestructrice(forme: string): boolean {
  const programme = forme.split(" ")[0] ?? "";
  return VERBES_DESTRUCTEURS.has(programme) || SOUS_VERBES_DESTRUCTEURS.has(forme);
}

interface Groupe {
  readonly forme: string;
  readonly outil: string;
  readonly jours: Set<string>;
  readonly exemples: string[];
  occasions: number;
}

/**
 * Ce qu'on proposerait d'autoriser, au vu des refus.
 *
 * `dejaAutorise` porte ce qui l'est déjà : reproposer une forme autorisée
 * ferait douter de tout le reste de la liste.
 */
export function suggererDesAutorisations(
  refus: ReadonlyArray<Refus>,
  dejaAutorise: ReadonlySet<string>,
): Bilan {
  const ecartes: Array<{ quoi: string; pourquoi: string }> = [];
  const groupes = new Map<string, Groupe>();

  let muets = 0;
  let nonReductibles = 0;
  let destructeurs = 0;
  let horsShell = 0;

  for (const unRefus of refus) {
    // L'outil AVANT la commande, et l'ordre porte du sens.
    //
    // Un refus de `Write` porte un CHEMIN, pas une commande — donc il arrive
    // ici avec `commande: null`, comme un refus qu'on n'a pas su rattacher.
    // Tester le `null` d'abord le rangerait dans « preuve manquante », ce qui
    // est faux : sa preuve n'est pas manquante, elle est d'une autre nature.
    // Le lecteur en conclurait qu'il suffit d'attendre une meilleure
    // jointure, alors que suggérer par chemin est un autre métier.
    if (unRefus.outil !== "Bash") {
      horsShell += 1;
      continue;
    }
    if (unRefus.commande === null) {
      muets += 1;
      continue;
    }
    const forme = formeDeCommande(unRefus.commande);
    if (forme === null) {
      nonReductibles += 1;
      continue;
    }
    if (estDestructrice(forme)) {
      destructeurs += 1;
      continue;
    }
    if (dejaAutorise.has(forme)) continue;

    const cle = `${unRefus.outil} ${forme}`;
    const groupe = groupes.get(cle) ?? {
      forme,
      outil: unRefus.outil,
      jours: new Set<string>(),
      exemples: [],
      occasions: 0,
    };
    groupe.occasions += 1;
    groupe.jours.add(unRefus.jour);
    if (groupe.exemples.length < 3 && !groupe.exemples.includes(unRefus.commande)) {
      groupe.exemples.push(unRefus.commande);
    }
    groupes.set(cle, groupe);
  }

  if (muets > 0) {
    ecartes.push({
      quoi: `${String(muets)} refus sans leur commande`,
      pourquoi:
        "le message de refus ne porte que le nom de l'outil ; la commande vit dans l'activité d'achèvement, retrouvée par `tool_use_id`. Quand la jointure ne rend rien, l'activité manque — un tour interrompu, une projection élaguée. Ces refus ne sont pas des votes : ce sont des preuves manquantes.",
    });
  }
  if (horsShell > 0) {
    ecartes.push({
      quoi: `${String(horsShell)} refus portant sur un autre outil que Bash`,
      pourquoi:
        "ils désignent un chemin, pas une commande. Autoriser par chemin est un autre métier, avec ses propres pièges — on ne l'improvise pas ici.",
    });
  }
  if (nonReductibles > 0) {
    ecartes.push({
      quoi: `${String(nonReductibles)} commandes non réductibles à une forme`,
      pourquoi:
        "elles enchaînent, redirigent ou substituent. Autoriser leur début autoriserait leur suite — `git status && rm -rf /` commence par `git status`.",
    });
  }
  if (destructeurs > 0) {
    ecartes.push({
      quoi: `${String(destructeurs)} refus portant sur des commandes destructrices`,
      pourquoi:
        "on ne les proposera jamais, quel que soit le compteur. Douze refus de la même commande destructrice ne sont pas douze arguments pour l'autoriser : ce sont douze fois où le garde a fait son travail.",
    });
  }

  const suggestions: Suggestion[] = [];
  for (const groupe of groupes.values()) {
    const jours = groupe.jours.size;
    if (groupe.occasions < OCCASIONS_MINIMUM || jours < JOURS_MINIMUM) {
      ecartes.push({
        quoi: groupe.forme,
        // A7 : la limite, sa valeur ET la demande.
        pourquoi: `${String(groupe.occasions)} occasion(s) sur ${String(jours)} jour(s) distinct(s) — il en faut ${String(OCCASIONS_MINIMUM)} sur ${String(JOURS_MINIMUM)}. ${jours < JOURS_MINIMUM ? "Tout est tombé le même jour : c'est une intention, pas une habitude." : "Trop peu d'occasions pour distinguer un motif d'un accident."}`,
      });
      continue;
    }
    suggestions.push({
      forme: groupe.forme,
      outil: groupe.outil,
      occasions: groupe.occasions,
      jours,
      exemples: [...groupe.exemples],
    });
  }

  // Le plus établi d'abord : d'abord les jours, parce que c'est la preuve
  // qu'on cherche, et seulement ensuite le volume.
  suggestions.sort(
    (a, b) => b.jours - a.jours || b.occasions - a.occasions || a.forme.localeCompare(b.forme),
  );

  return { suggestions, ecartes, resume: resumer(refus.length, suggestions, ecartes) };
}

function resumer(
  total: number,
  suggestions: ReadonlyArray<Suggestion>,
  ecartes: ReadonlyArray<{ readonly quoi: string }>,
): string {
  if (total === 0) {
    return "Aucun refus d'outil enregistré sur la fenêtre observée. Rien à proposer — et rien à en conclure sur ce qu'il faudrait autoriser.";
  }
  if (suggestions.length === 0) {
    return `${String(total)} refus examinés, aucune autorisation à proposer — ${String(ecartes.length)} motif(s) d'écart, chacun avec sa raison. « Rien à proposer » ne veut pas dire « rien à autoriser » : ça veut dire qu'on n'a pas de quoi le prouver.`;
  }
  return `${String(total)} refus examinés, ${String(suggestions.length)} autorisation(s) proposée(s). Chacune est une PROPOSITION : elle élargit une frontière de sécurité et n'a d'effet que si un humain la reprend.`;
}
