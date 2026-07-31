import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { scannerSkill } from "../../../securite/ScanDeSkill.ts";
import { controlerSkill, resumeDeControle } from "../../../skills/NormesDeSkill.ts";
import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { inspecterDossier } from "./inspection.ts";
import { skillsSurDisque } from "../../../skills/SurDisque.ts";
import { ApprentissageStore } from "../../../skills/ApprentissageStore.ts";
import { grapheDApprentissage, raconterLeGraphe } from "../../../skills/GrapheDApprentissage.ts";
import { UsageStore } from "../../../skills/UsageStore.ts";
import { classerLesSkills, isoDe, jourDe, resumeDUsage } from "../../../skills/UsageDesSkills.ts";
import { UsageSkillsError, UsageSkillsToolkit } from "./tools.ts";

/**
 * Ce que la machine sait de l'humain, et qui n'a rien à faire dans un `author:`.
 *
 * Une skill se PARTAGE. Un nom pris au système d'exploitation ou à la config
 * git est une fuite de vie privée que personne n'a acceptée — et elle passe
 * inaperçue, parce que sur la machine d'origine ça ressemble simplement à un
 * champ rempli.
 *
 * Le nom de session vient du chemin du home plutôt que de `USER` : c'est la
 * même donnée, mais elle survit aux environnements où `USER` n'est pas posé.
 */
export const identiteDeLaMachine = (
  environnement: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<string> => {
  const home = environnement.HOME ?? environnement.USERPROFILE ?? "";
  // `findLast` et pas `filter(...).at(-1)` : un home qui finit par un
  // séparateur (`/Users/lea/`) ne doit pas rendre un segment vide.
  const nomDeSession = home.split(/[/\\]/u).findLast((p) => p.length > 0);
  return [...new Set([environnement.USER, environnement.USERNAME, nomDeSession])].filter(
    (valeur): valeur is string => valeur !== undefined && valeur.length > 0,
  );
};

const handlers = {
  "usage-skills": (input) =>
    // La porte est à la SORTIE : tout ce que l'outil rend y passe, y compris
    // les chemins rares.
    Effect.flatMap(
      Effect.gen(function* () {
        const store = yield* UsageStore;
        const surDisque = yield* skillsSurDisque({
          // `exactOptionalPropertyTypes` : une clé présente à `undefined` n'est
          // pas la même chose qu'une clé absente.
          // `homePath: ""` fait retomber `resolveClaudeConfigDirPath` sur
          // CLAUDE_CONFIG_DIR puis ~/.claude — le contrat exige la clé.
          config: { homePath: input.homePath ?? "" },
          cwd: input.cwd,
          environment: process.env,
          epinglees: input.epinglees,
        });
        const [appels, fenetre] = yield* Effect.all(
          [store.appelsParSkill(), store.fenetreObservee()],
          { concurrency: 2 },
        ).pipe(
          Effect.mapError(
            (cause) =>
              new UsageSkillsError({
                message: `Le flux d'activité n'a pas pu être lu (${String(cause)}).`,
              }),
          ),
        );

        const usages = classerLesSkills({ surDisque, appels, fenetre });
        const cheminParNom = new Map(surDisque.map((s) => [s.nom, s.chemin]));
        const indecidables = usages.filter((u) => u.etat === "indécidable").length;

        return {
          resume: resumeDUsage(usages, fenetre),
          fenetre:
            fenetre === null
              ? null
              : { depuis: isoDe(fenetre.depuis) ?? "", jusqu: isoDe(fenetre.jusqu) ?? "" },
          skills: usages.map((u) => ({
            ...u,
            dernierAppel: isoDe(u.dernierAppel),
            chemin: cheminParNom.get(u.nom) ?? "",
          })),
          // H4 : ce qu'on n'a pas vu est un fait sur NOUS. La projection est
          // élaguée et ne couvre que les fils passés PAR T3 — une skill lancée
          // depuis la CLI n'y laisse aucune trace.
          note:
            indecidables > 0
              ? `${indecidables} skill(s) INDÉCIDABLE(S) : l'observation ne couvre pas toute leur vie. Aucune ne doit être archivée sur cette base. La projection est élaguée, et une skill lancée hors de T3 n'y laisse aucune trace.`
              : "Toutes les skills ont pu être jugées sur une observation couvrant leur vie entière. La projection reste élaguée : une skill lancée hors de T3 n'y laisse aucune trace.",
        };
      }),
      porteDeSortie,
    ),
  "normes-skills": (input) =>
    Effect.flatMap(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const surDisque = yield* skillsSurDisque({
          config: { homePath: input.homePath ?? "" },
          cwd: input.cwd,
          environment: process.env,
        });

        const controlees = yield* Effect.forEach(surDisque, (skill) =>
          Effect.gen(function* () {
            // Une skill illisible n'est pas une skill conforme : on le DIT,
            // au lieu de la compter comme saine par absence de manquement.
            const texte = yield* fileSystem
              .readFileString(skill.chemin)
              .pipe(Effect.orElseSucceed(() => null));
            if (texte === null) {
              return {
                nom: skill.nom,
                chemin: skill.chemin,
                manquements: [
                  {
                    regle: "illisible",
                    gravite: "erreur" as const,
                    quoiFaire: `${skill.chemin} n'a pas pu être lu. Vérifie qu'il existe et que ses droits le permettent — tant qu'il est illisible, aucune norme ne peut être vérifiée dessus.`,
                  },
                ],
              };
            }
            return {
              nom: skill.nom,
              chemin: skill.chemin,
              manquements: controlerSkill({ texte, identiteDeLaMachine: identiteDeLaMachine() }),
            };
          }),
        );

        const aCorriger = controlees.filter((s) => s.manquements.length > 0);
        const erreurs = aCorriger.reduce(
          (total, s) => total + s.manquements.filter((m) => m.gravite === "erreur").length,
          0,
        );

        return {
          resume: resumeDeControle(aCorriger.flatMap((s) => s.manquements)),
          skills: aCorriger,
          // H4 : ce contrôle ne regarde que la FORME. Une skill impeccable de
          // forme peut être fausse sur le fond, et il n'a aucun moyen de le
          // savoir. Le dire évite qu'un « 0 manquement » se lise « bonne skill ».
          note: `${String(surDisque.length)} skill(s) contrôlée(s), ${String(aCorriger.length)} à reprendre (${String(erreurs)} erreur(s)). Ce contrôle ne regarde que la FORME : une skill sans manquement peut être fausse sur le fond, et rien ici ne le verrait.`,
        };
      }),
      porteDeSortie,
    ),
  "inspecter-skill": (input) =>
    Effect.flatMap(
      Effect.gen(function* () {
        const inspection = yield* inspecterDossier(input.chemin);

        if (inspection.fichiers.length === 0) {
          // Rien lu n'est PAS « rien à signaler ». Un dossier vide, un chemin
          // faux, un dossier illisible : trois situations, un même silence —
          // et rendre « sain » sur ce silence serait un feu vert inventé (H4).
          return {
            verdict: "prudence" as const,
            decision: "demander" as const,
            fichiersLus: 0,
            trouvailles: [],
            resume: `Aucun fichier lu sous « ${input.chemin} ». Ce n'est pas un verdict « sain » : c'est une absence de matière. Vérifie le chemin, et qu'il s'agit bien du dossier de la skill.`,
            ...(inspection.notes.length > 0 ? { note: inspection.notes.join(" · ") } : {}),
          };
        }

        const rapport = scannerSkill(inspection.fichiers, input.confiance ?? "communaute");
        return {
          verdict: rapport.verdict,
          decision: rapport.decision,
          fichiersLus: inspection.fichiers.length,
          trouvailles: rapport.trouvailles,
          resume: rapport.resume,
          ...(inspection.notes.length > 0 ? { note: inspection.notes.join(" · ") } : {}),
        };
      }),
      porteDeSortie,
    ),
  apprentissage: (input) =>
    Effect.gen(function* () {
      const store = yield* ApprentissageStore;
      const matiere = yield* store.matiere(input.cwd);

      // Pas de fin de données = projection vide. On ne borne alors RIEN, et
      // toute fenêtre « après » serait ouverte à l'infini : mieux vaut le dire
      // que de rendre des verdicts calculés sur du vide.
      if (matiere.finDesDonnees === null) {
        return {
          recit:
            "La projection ne contient aucune activité : il n'y a pas de fenêtre d'observation, donc rien à corréler. Ce n'est pas « les skills ne servent pas », c'est « on n'a rien observé » (H4).",
          lignes: [],
          jugeables: 0,
          examinees: 0,
        };
      }

      const lignes = grapheDApprentissage(
        matiere.mutations,
        matiere.observations,
        matiere.finDesDonnees,
      );
      const jugeables = lignes.filter(
        (ligne) =>
          ligne.verdict.quoi === "amélioration" ||
          ligne.verdict.quoi === "régression" ||
          ligne.verdict.quoi === "sans-effet-mesurable",
      ).length;

      return {
        recit: raconterLeGraphe(lignes),
        lignes: lignes.map((ligne) => ({
          skill: ligne.mutation.skill,
          quand: jourDe(ligne.mutation.quand),
          libelle: ligne.mutation.libelle,
          verdict: ligne.verdict.quoi,
          detail:
            "pourquoi" in ligne.verdict
              ? ligne.verdict.pourquoi
              : `${String(ligne.verdict.avant.reussites)}/${String(ligne.verdict.avant.total)} puis ${String(ligne.verdict.apres.reussites)}/${String(ligne.verdict.apres.total)}`,
        })),
        jugeables,
        examinees: lignes.length,
        ...(matiere.mutations.length === 0
          ? {
              note: "Aucune mutation de skill trouvée dans git pour ce dépôt. Soit les skills n'y ont jamais changé, soit elles vivent ailleurs — le graphe ne peut pas distinguer les deux.",
            }
          : {}),
      };
    }).pipe(
      Effect.mapError(
        (cause) =>
          new UsageSkillsError({
            message: `Lecture de l'apprentissage impossible : ${String(cause)}`,
          }),
      ),
      Effect.flatMap(porteDeSortie),
    ),
} satisfies Parameters<typeof UsageSkillsToolkit.toLayer>[0];

export const UsageSkillsToolkitHandlersLive = UsageSkillsToolkit.toLayer(handlers);
