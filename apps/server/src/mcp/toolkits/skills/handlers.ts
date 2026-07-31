import * as Effect from "effect/Effect";

import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { skillsSurDisque } from "../../../skills/SurDisque.ts";
import { UsageStore } from "../../../skills/UsageStore.ts";
import { classerLesSkills, isoDe, resumeDUsage } from "../../../skills/UsageDesSkills.ts";
import { UsageSkillsError, UsageSkillsToolkit } from "./tools.ts";

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
} satisfies Parameters<typeof UsageSkillsToolkit.toLayer>[0];

export const UsageSkillsToolkitHandlersLive = UsageSkillsToolkit.toLayer(handlers);
