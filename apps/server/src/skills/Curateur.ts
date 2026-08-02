/**
 * LE CURATEUR — ce qui ne sert plus s'efface du chemin, jamais du disque.
 *
 * Chantier n°1, chaîne B. Aspiré de `agent/curator.py` d'Hermès (2 019 l.) et
 * de `curator_backup.py` (716 l.).
 *
 * ── Les quatre invariants stricts, portés tels quels ──────────────────────
 *
 * Ils sont écrits en toutes lettres dans leur docstring, et ils sont la
 * raison pour laquelle un curateur automatique n'est pas une bombe :
 *
 *   1. il ne touche QUE ce que l'agent a créé ;
 *   2. il n'efface JAMAIS — il archive, et l'archive se récupère ;
 *   3. une skill ÉPINGLÉE échappe à tout ;
 *   4. il tourne sur le modèle AUXILIAIRE, hors du cache principal.
 *
 * Ici on porte la DÉCISION (1, 2, 3). Le passage sur modèle auxiliaire (4)
 * appartient au routage de `modules/ai` et viendra avec la revue elle-même.
 *
 * ── Le cinquième invariant, qui est le nôtre ──────────────────────────────
 *
 * Le n°2 rend `indécidable` quand la fenêtre d'observation ne couvre pas la
 * vie d'une skill. **Le curateur ne peut RIEN faire d'un `indécidable`.** Ce
 * n'est pas une prudence, c'est le lien de la chaîne : sans lui, le curateur
 * archiverait 82 % des skills sur les données d'aujourd'hui — dont celles que
 * la LOI rend obligatoires.
 *
 * ── Le piège qu'ils ont payé, et qui rejoint le nôtre ─────────────────────
 *
 * « À la première vue d'une skill éligible, on ANCRE son horloge à MAINTENANT
 * et on diffère. » Sans ça, activer le curateur archiverait d'un coup tout ce
 * qui dort depuis longtemps — au moment précis où personne ne s'y attend.
 *
 * Et un piège qu'on ne pouvait pas deviner : chez eux, une skill référencée
 * par un JOB CRON est traitée comme épinglée. Le compteur d'usage ne monte
 * qu'au déclenchement, donc un job qui tourne moins souvent que le délai
 * d'archivage verrait sa skill disparaître sous lui. T3 n'a pas de cron
 * (chantier n°47) : quand il arrivera, cette règle devra arriver avec.
 *
 * Module PUR.
 */

import type { EtatDeSkill } from "./UsageDesSkills.ts";

/** L'état d'une skill dans le cycle de vie du curateur. */
export type EtatDeVie = "active" | "dormante" | "archivee";

/** Ce que le curateur décide de faire — et « rien » est la réponse la plus fréquente. */
export type Geste = "rien" | "amorcer" | "endormir" | "archiver" | "reveiller";

export interface SkillCuree {
  readonly nom: string;
  readonly etatDeVie: EtatDeVie;
  readonly epinglee: boolean;
  /** Le curateur ne touche QUE ce que l'agent a créé. */
  readonly creeeParLAgent: boolean;
  /** Verdict du n°2. `indécidable` interdit tout geste. */
  readonly usage: EtatDeSkill;
  /** Dernier appel vu, ou `null`. */
  readonly dernierAppel: number | null;
  /** Naissance. Sert d'ancrage quand la skill n'a jamais servi. */
  readonly neeLe: number | null;
  /** `false` quand le curateur la voit pour la PREMIÈRE fois. */
  readonly dejaVue: boolean;
}

export interface Decision {
  readonly nom: string;
  readonly geste: Geste;
  /** Nommé pour un AGENT (A7) : le geste, et ce qui l'a décidé. */
  readonly pourquoi: string;
}

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Seuils portés d'Hermès (`DEFAULT_STALE_AFTER_DAYS`,
 * `DEFAULT_ARCHIVE_AFTER_DAYS`).
 *
 * Le premier tombe pile sur le plancher d'observation qu'on avait mesuré
 * indépendamment pour le n°2 (30 jours). Deux chemins, le même nombre : c'est
 * un bon signe, pas une coïncidence — en dessous d'un mois, un silence ne veut
 * rien dire.
 */
export const JOURS_AVANT_DORMANCE = 30;
export const JOURS_AVANT_ARCHIVE = 90;

/**
 * Que faire d'UNE skill ?
 *
 * L'ordre des refus est la doctrine : on cherche d'abord toutes les raisons de
 * NE RIEN FAIRE, et on n'agit qu'en dernier, quand plus rien ne s'y oppose.
 * Un curateur qui commence par chercher quoi archiver finira par archiver.
 */
export function deciderPour(skill: SkillCuree, maintenant: number): Decision {
  const rien = (pourquoi: string): Decision => ({ nom: skill.nom, geste: "rien", pourquoi });

  // 1 · L'épinglée échappe à tout. Invariant n°3.
  if (skill.epinglee) return rien("épinglée : le curateur n'y touche jamais.");

  // 2 · Ce que l'agent n'a pas créé ne lui appartient pas. Invariant n°1.
  if (!skill.creeeParLAgent) {
    return rien("écrite par l'humain : le curateur ne touche que ce que l'agent a créé.");
  }

  // 3 · Le lien avec le n°2, et c'est le plus important.
  if (skill.usage === "indécidable") {
    return rien(
      "usage INDÉCIDABLE : l'observation ne couvre pas toute sa vie. Aucun geste ne se justifie sur cette base.",
    );
  }

  // 4 · Première vue : on ancre l'horloge à maintenant et on diffère. Sans ça,
  //     allumer le curateur archiverait d'un coup tout ce qui dort.
  if (!skill.dejaVue) {
    return {
      nom: skill.nom,
      geste: "amorcer",
      pourquoi:
        "vue pour la première fois : son horloge d'inactivité démarre MAINTENANT, pas à sa naissance. Rien d'autre à ce passage.",
    };
  }

  // 5 · Elle sert : on la réveille si elle dormait.
  if (skill.usage === "utilisée") {
    return skill.etatDeVie === "active"
      ? rien("utilisée, et déjà active.")
      : {
          nom: skill.nom,
          geste: "reveiller",
          pourquoi: `utilisée alors qu'elle était « ${skill.etatDeVie} » : elle redevient active.`,
        };
  }

  // 6 · Reste le silence prouvé. L'ancrage est le dernier appel, sinon la
  //     naissance — sans quoi une skill neuve s'archiverait elle-même.
  const ancrage = skill.dernierAppel ?? skill.neeLe;
  if (ancrage === null) {
    return rien("ni appel ni date de naissance : rien à quoi ancrer une horloge.");
  }
  const jours = Math.floor((maintenant - ancrage) / JOUR);

  if (jours >= JOURS_AVANT_ARCHIVE && skill.etatDeVie !== "archivee") {
    return {
      nom: skill.nom,
      geste: "archiver",
      pourquoi: `${jours} jours sans usage prouvé (seuil ${JOURS_AVANT_ARCHIVE}). ARCHIVÉE, jamais effacée : l'archive se récupère.`,
    };
  }
  if (jours >= JOURS_AVANT_DORMANCE && skill.etatDeVie === "active") {
    return {
      nom: skill.nom,
      geste: "endormir",
      pourquoi: `${jours} jours sans usage prouvé (seuil ${JOURS_AVANT_DORMANCE}). Mise en sommeil — elle reste là, elle sort juste du chemin.`,
    };
  }
  return rien(`${jours} jours sans usage, sous le seuil de ${JOURS_AVANT_DORMANCE}.`);
}

/** Le passage complet, dans l'ordre reçu — stable d'un lancement à l'autre. */
export function passageDuCurateur(
  skills: ReadonlyArray<SkillCuree>,
  maintenant: number,
): ReadonlyArray<Decision> {
  return skills.map((skill) => deciderPour(skill, maintenant));
}

/**
 * La phrase de tête. Elle compte les gestes, et surtout elle dit combien de
 * skills n'ont RIEN eu — parce que c'est la réponse normale.
 */
export function resumeDuPassage(decisions: ReadonlyArray<Decision>): string {
  const compte = (geste: Geste) => decisions.filter((d) => d.geste === geste).length;
  const agis = decisions.length - compte("rien");
  if (agis === 0) {
    return `${decisions.length} skill(s) examinée(s), aucun geste. C'est la réponse normale.`;
  }
  return `${decisions.length} skill(s) examinée(s) : ${compte("amorcer")} amorcée(s), ${compte("endormir")} endormie(s), ${compte("archiver")} archivée(s), ${compte("reveiller")} réveillée(s). Rien n'a été effacé.`;
}
