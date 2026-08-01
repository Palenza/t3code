/**
 * CE QUI S'EXÉCUTERA SI ON OUVRE CE DOSSIER.
 *
 * Suite directe de P4, dont le reçu est dans `docs/P4-CONFIANCE-LE-RECU.md` :
 * un dépôt cloné exécute son hook `SessionStart` chez nous, à chaque session,
 * sans qu'aucune confiance soit demandée — et sa skill entre dans la liste de
 * l'agent à côté des nôtres.
 *
 * ── Pourquoi ce module vient AVANT le bac à sable ─────────────────────────
 *
 * Le remède est un bac à sable Seatbelt. Mais un bac à sable est un changement
 * de comportement pour TOUT LE MONDE (palier D2), il se montre avant de
 * partir, et il peut remplacer un trou par une panne.
 *
 * Ceci ne change RIEN au comportement : ça REGARDE et ça DIT. C'est donc
 * livrable tout de suite, et ça reste utile même une fois le bac à sable en
 * place — parce qu'un bac à sable protège sans jamais expliquer ce dont il
 * protège.
 *
 * ── La skill est le vecteur le plus vicieux, pas le hook ──────────────────
 *
 * Un hook fait une chose, une fois, et un journal peut la montrer. Une skill
 * injectée entre dans le CONTEXTE de l'agent et lui donne des instructions,
 * avec tous ses droits. C'est de l'injection de prompt livrée par un
 * `git clone`. Elle pèse donc plus lourd ici que le hook.
 *
 * Module PUR : il décrit, il n'exécute rien et ne bloque rien.
 */

/** Ce qu'on sait d'un dossier, sans l'ouvrir : la liste de ses chemins. */
export interface Surface {
  /** Un `settings.json` de projet peut déclarer des hooks. */
  readonly reglages: ReadonlyArray<string>;
  /** Des scripts de hook, qui s'exécutent aux moments du cycle de vie. */
  readonly hooks: ReadonlyArray<string>;
  /** Des skills, qui entrent dans le contexte et INSTRUISENT l'agent. */
  readonly skills: ReadonlyArray<string>;
  /** Des serveurs MCP déclarés par le projet : du code tiers, lancé. */
  readonly mcp: ReadonlyArray<string>;
}

export type Gravite = "rien" | "instruit" | "execute";

export interface Verdict {
  readonly gravite: Gravite;
  /** Ce qui s'exécutera ou instruira, NOMMÉ. Jamais « du contenu suspect ». */
  readonly quoi: ReadonlyArray<string>;
  /** Le message pour un AGENT : la limite, sa valeur, et la demande (A7). */
  readonly message: string;
}

/**
 * Les emplacements qui portent de l'exécutable, tels que le CLI les lit.
 *
 * Volontairement littéraux : une expression trop large classerait n'importe
 * quel `settings.json` d'application comme une menace, et un garde qui crie
 * sur le sain n'est plus écouté.
 */
const EST_REGLAGE = /(^|\/)\.claude\/settings(\.local)?\.json$/;
const EST_HOOK = /(^|\/)\.claude\/hooks\//;
const EST_SKILL = /(^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/;
const EST_MCP = /(^|\/)\.mcp\.json$/;

/** Ce que le dossier porte, lu depuis la seule liste de ses chemins. */
export function surfaceDe(fichiers: ReadonlyArray<string>): Surface {
  return {
    reglages: fichiers.filter((f) => EST_REGLAGE.test(f)),
    hooks: fichiers.filter((f) => EST_HOOK.test(f)),
    skills: fichiers.filter((f) => EST_SKILL.test(f)),
    mcp: fichiers.filter((f) => EST_MCP.test(f)),
  };
}

/** Le nom d'une skill depuis son chemin — c'est ce qui apparaît à l'agent. */
export function nomDeSkill(chemin: string): string {
  const morceaux = chemin.split("/");
  return morceaux[morceaux.length - 2] ?? chemin;
}

/**
 * Que se passera-t-il si on ouvre ce dossier ?
 *
 * `ecritParNous` dit si le dépôt est le nôtre. Quand il l'est, la surface
 * reste DÉCRITE mais n'est plus une alerte : nos propres hooks sont notre
 * outillage, et les signaler à chaque ouverture userait le signal jusqu'à ce
 * que plus personne ne le lise.
 */
export function verdictALOuverture(surface: Surface, ecritParNous: boolean): Verdict {
  const executables = [...surface.hooks, ...surface.reglages, ...surface.mcp];
  const quoi = [
    ...surface.hooks.map((f) => `hook ${f}`),
    ...surface.reglages.map((f) => `réglages ${f}`),
    ...surface.mcp.map((f) => `serveur MCP déclaré par ${f}`),
    ...surface.skills.map((f) => `skill « ${nomDeSkill(f)} » (${f})`),
  ];

  if (quoi.length === 0) {
    return {
      gravite: "rien",
      quoi: [],
      message: "Ce dossier ne porte ni hook, ni skill, ni serveur MCP de projet.",
    };
  }

  if (ecritParNous) {
    return {
      gravite: "rien",
      quoi,
      message: `Dossier connu : ${String(quoi.length)} élément(s) exécutable(s) ou instructif(s), qui sont les nôtres.`,
    };
  }

  // Deux gravités et pas une seule, parce que le geste diffère. « execute »
  // demande un bac à sable ; « instruit » demande de LIRE la skill avant de
  // lancer quoi que ce soit. Les confondre ferait chercher au mauvais endroit.
  const gravite: Gravite = executables.length > 0 ? "execute" : "instruit";

  const entete =
    gravite === "execute"
      ? `Ce dossier n'est pas le nôtre et ${String(executables.length)} élément(s) s'EXÉCUTERONT à l'ouverture de la session, à chaque session.`
      : `Ce dossier n'est pas le nôtre et ${String(surface.skills.length)} skill(s) entreront dans le contexte de l'agent — elles l'INSTRUISENT, avec ses droits.`;

  return {
    gravite,
    quoi,
    // A7 : nommer ce qui va tirer, pas « attention, contenu suspect ». Un agent
    // répare « le hook X va tirer » ; il ne peut rien faire d'un avertissement.
    message: `${entete}\n${quoi.map((q) => `  · ${q}`).join("\n")}\nMesuré le 01/08 (docs/P4-CONFIANCE-LE-RECU.md) : aucune confiance n'est demandée sur ce chemin. Lire ces fichiers AVANT d'ouvrir une session ici, ou travailler depuis un dossier à nous et lire ce dépôt à distance.`,
  };
}
