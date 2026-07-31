import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { UsageStore } from "../../../skills/UsageStore.ts";

/**
 * L'outil `usage-skills` — laquelle sert vraiment, et depuis quand on regarde.
 *
 * Absorption d'Hermès (`tools/skill_usage.py`), chantier n°2, socle du n°1
 * (le curateur). Deux écarts assumés avec leur version :
 *
 * 1. **Aucun sidecar.** Ils écrivent un `.usage.json` près de chaque skill
 *    parce que rien ne persiste les invocations chez eux. Chez nous ce serait
 *    nuisible : `signatureDesSkills` recharge les skills dès que le contenu du
 *    dossier bouge, donc un compteur y déclencherait un rechargement par tour.
 *    On lit `projection_thread_activities`, qui enregistre déjà tout.
 *
 * 2. **Le verdict porte sa FENÊTRE.** Mesuré le 31/07 : la projection ne
 *    couvre que 7,1 jours, 14 skills sur 17 y sont muettes, et la plus
 *    ancienne a 62 jours. Conclure « inutilisée » là-dessus archiverait 82 %
 *    des skills — dont celles que la loi du projet rend obligatoires. L'outil
 *    répond donc `indécidable` tant que l'observation ne couvre pas toute la
 *    vie de la skill (H4 : « on n'a pas vu » est un fait sur NOUS).
 */

export class UsageSkillsError extends Schema.TaggedErrorClass<UsageSkillsError>()(
  "UsageSkillsError",
  { message: Schema.String },
) {}

export const UsageSkillsInput = Schema.Struct({
  cwd: Schema.optional(
    Schema.String.annotate({
      description:
        "Racine de l'espace de travail, pour voir aussi les skills de projet (<cwd>/.claude/skills). Omis : seules les skills utilisateur sont vues.",
    }),
  ),
  homePath: Schema.optional(
    Schema.String.annotate({
      description:
        "Dossier de configuration Claude à inspecter. Omis : CLAUDE_CONFIG_DIR, sinon ~/.claude.",
    }),
  ),
  epinglees: Schema.optional(
    Schema.Array(Schema.String).annotate({
      description:
        "Noms de skills à considérer comme épinglées : elles sont mesurées comme les autres, mais jamais proposées à l'archivage.",
    }),
  ),
});

const UsageRendu = Schema.Struct({
  nom: Schema.String,
  etat: Schema.Literals(["utilisée", "inutilisée", "indécidable"]),
  appels: Schema.Number,
  dernierAppel: Schema.NullOr(Schema.String),
  epinglee: Schema.Boolean,
  /** `true` seulement si un archivage serait JUSTIFIÉ — jamais par défaut. */
  archivable: Schema.Boolean,
  pourquoi: Schema.String,
  chemin: Schema.String,
});

export const UsageSkillsResultat = Schema.Struct({
  /** Une phrase qui nomme la fenêtre AVANT les chiffres. */
  resume: Schema.String,
  /** La période réellement couverte par les données, en ISO. */
  fenetre: Schema.NullOr(Schema.Struct({ depuis: Schema.String, jusqu: Schema.String })),
  skills: Schema.Array(UsageRendu),
  /** Ce que cette mesure ne couvre pas — jamais tu. */
  note: Schema.String,
});

export const UsageSkillsTool = Tool.make("usage-skills", {
  description:
    "Quelles skills ont RÉELLEMENT été appelées, sur quelle période, et lesquelles on ne peut pas juger. Ne modifie rien, n'archive rien. Répond « indécidable » quand l'observation ne couvre pas toute la vie d'une skill — zéro appel en une semaine ne dit rien d'une skill vieille de deux mois. À appeler avant toute décision de ménage sur les skills.",
  parameters: UsageSkillsInput,
  success: UsageSkillsResultat,
  failure: UsageSkillsError,
  // Le disque EN PLUS de la base : l'usage ne se lit pas sans savoir quelles
  // skills existent, ni depuis quand.
  dependencies: [UsageStore, FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Usage des skills")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

/**
 * L'outil `normes-skills` — la bouche du chantier n°4.
 *
 * Le module de contrôle (`skills/NormesDeSkill.ts`) était complet et testé,
 * sans appelant. Or c'est tout son intérêt qui se perdait là : chez eux ces
 * normes vivent dans un PROMPT — on demande au modèle de les suivre. Chez nous
 * elles vivent dans un CONTRÔLE — on vérifie qu'elles le sont. Un contrôle
 * qu'on ne lance jamais n'est qu'un prompt de plus, en moins visible.
 *
 * Il lit, il ne corrige rien. Une skill n'est jamais déclarée « invalide » :
 * elle est perfectible, et on dit quoi faire. Un contrôle qui refuse tout est
 * un contrôle qu'on débranche.
 */
export const NormesSkillsInput = Schema.Struct({
  cwd: Schema.optional(
    Schema.String.annotate({
      description:
        "Racine de l'espace de travail, pour contrôler aussi les skills de projet (<cwd>/.claude/skills).",
    }),
  ),
  homePath: Schema.optional(
    Schema.String.annotate({
      description: "Dossier de configuration Claude. Omis : CLAUDE_CONFIG_DIR, sinon ~/.claude.",
    }),
  ),
});

const ManquementRendu = Schema.Struct({
  regle: Schema.String,
  gravite: Schema.Literals(["erreur", "avertissement"]),
  /** Nommé pour un AGENT (A7) : ce qui ne va pas ET quoi faire. */
  quoiFaire: Schema.String,
});

const SkillControlee = Schema.Struct({
  nom: Schema.String,
  chemin: Schema.String,
  manquements: Schema.Array(ManquementRendu),
});

export const NormesSkillsResultat = Schema.Struct({
  resume: Schema.String,
  /** Seules les skills qui ont quelque chose à corriger. Les saines se taisent. */
  skills: Schema.Array(SkillControlee),
  /** Ce que ce contrôle ne regarde pas — jamais tu (H4). */
  note: Schema.String,
});

export const NormesSkillsTool = Tool.make("normes-skills", {
  description:
    "Contrôle la FORME des skills installées : nom mal formé, description absente ou trop longue, mots de vitrine, auteur pris à la machine, fichier trop gros. Ne corrige rien. À appeler après avoir écrit ou modifié une skill, et avant de s'étonner qu'une skill ne soit jamais choisie — une description floue est la première cause.",
  parameters: NormesSkillsInput,
  success: NormesSkillsResultat,
  failure: UsageSkillsError,
  dependencies: [FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Normes des skills")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

/**
 * L'outil `inspecter-skill` — la porte que le scanner du n°10 gardait à vide.
 *
 * Le scanner était complet et testé, et rien ne lui apportait jamais de
 * fichiers : un garde sans porte. Cet outil est la porte, et il ne fait que
 * REGARDER. Installer écrirait dans le home Claude de l'humain — l'endroit
 * que notre désinstalleur classe « ne se touche jamais » — et ça se décide,
 * ça ne se glisse pas dans un outil de lecture.
 */
export const InspecterSkillInput = Schema.Struct({
  chemin: Schema.String.annotate({
    description: "Dossier de la skill candidate. Rien n'y est écrit ni copié.",
  }),
  confiance: Schema.optional(
    Schema.Literals(["interne", "de-confiance", "communaute", "faite-par-l-agent"]).annotate({
      description:
        "D'où elle vient. C'est ce qui croise le verdict : la même trouvaille bloque une skill venue d'internet et passe sur une skill interne. Omis : « communaute », le plus prudent des quatre.",
    }),
  ),
});

export const InspecterSkillResultat = Schema.Struct({
  verdict: Schema.Literals(["sain", "prudence", "dangereux"]),
  /** Ce qui SERAIT fait à l'installation, croisé avec la confiance. */
  decision: Schema.Literals(["installer", "demander", "refuser"]),
  fichiersLus: Schema.Number,
  trouvailles: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      gravite: Schema.Literals(["critique", "haute", "moyenne"]),
      categorie: Schema.String,
      ou: Schema.String,
      quoi: Schema.String,
    }),
  ),
  resume: Schema.String,
  note: Schema.optional(Schema.String),
});

export const InspecterSkillTool = Tool.make("inspecter-skill", {
  description:
    "Que contient cette skill, et est-ce qu'on peut la prendre ? Lit un dossier candidat, contrôle sa FORME (binaire embarqué, trop de fichiers, caractères invisibles que l'humain ne voit pas et que le modèle lit) autant que son contenu, puis croise le verdict avec la confiance dans la source. N'installe RIEN et n'écrit nulle part. À appeler avant de copier une skill reçue de quelqu'un.",
  parameters: InspecterSkillInput,
  success: InspecterSkillResultat,
  failure: UsageSkillsError,
  dependencies: [FileSystem.FileSystem, Path.Path],
})
  .annotate(Tool.Title, "Inspecter une skill")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const UsageSkillsToolkit = Toolkit.make(
  UsageSkillsTool,
  NormesSkillsTool,
  InspecterSkillTool,
);
