/**
 * DE QUOI NOURRIR LE GRAPHE — git pour les mutations, la projection pour l'usage.
 *
 * La LECTURE du chantier n°3. Le jugement est dans `GrapheDApprentissage.ts`,
 * qui reste pur ; ici on ne fait que ramener la matière, et on la ramène de
 * DEUX endroits parce qu'ils savent deux choses différentes :
 *
 * · **git** sait quand une skill a changé, et pourquoi. Gratuitement, avec un
 *   historique complet. Reconstruire ça dans une table serait une deuxième
 *   vérité pour la même chose.
 * · **la projection** sait quand une skill a servi, et si ça a marché.
 *
 * ── Le piège qu'on désamorce ici ─────────────────────────────────────────
 *
 * `finDesDonnees` est la dernière activité CONNUE, pas « maintenant ». La
 * projection est élaguée : ses données s'arrêtent avant le présent. Prendre
 * l'heure courante comme borne ferait passer le trou entre la dernière
 * activité et maintenant pour une période sans usage — c'est-à-dire qu'un
 * élagage se lirait comme une régression.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "../persistence/Errors.ts";
import type { PersistenceSqlError } from "../persistence/Errors.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import type { Mutation, Observation } from "./GrapheDApprentissage.ts";
import { nomDeSkillInvoquee } from "./UsageStore.ts";

export interface Matiere {
  readonly mutations: ReadonlyArray<Mutation>;
  readonly observations: ReadonlyArray<Observation>;
  /** La dernière activité connue. `null` quand la projection est vide. */
  readonly finDesDonnees: number | null;
}

export interface ApprentissageStoreShape {
  readonly matiere: (cwd: string) => Effect.Effect<Matiere, PersistenceSqlError>;
}

export class ApprentissageStore extends Context.Service<
  ApprentissageStore,
  ApprentissageStoreShape
>()("t3/skills/ApprentissageStore") {}

/**
 * Le nom de la skill que touche un chemin de fichier.
 *
 * `.claude/skills/aspirer/SKILL.md` → `aspirer`. Un chemin qui ne mène pas
 * dans un dossier de skill rend `null` : le commit a touché autre chose en
 * même temps, ce qui est le cas courant.
 */
export function skillTouchee(chemin: string): string | null {
  const morceaux = chemin.split("/");
  const index = morceaux.indexOf("skills");
  if (index === -1) return null;
  // Il faut un dossier APRÈS `skills/`, sinon le chemin désigne le dossier
  // lui-même et ne nomme aucune skill.
  const nom = morceaux[index + 1];
  if (nom === undefined || nom === "" || morceaux.length <= index + 2) return null;
  return nom;
}

/**
 * Le séparateur de champs : U+001F, « unit separator ».
 *
 * Un caractère de contrôle plutôt qu'un tiret ou un tube, parce qu'un sujet de
 * commit contient tout ce qu'on voudrait prendre comme séparateur — et une
 * seule occurrence suffirait à décaler toute la lecture.
 *
 * Écrit en échappement, jamais en octet brut : invisible dans du source, il
 * survit mal à un copier-coller, à un formateur, à une relecture, et sa
 * disparition ne casserait rien VISIBLEMENT — elle décalerait un champ.
 */
const SEPARATEUR = "\u001f";

/**
 * Les mutations, telles que `git log --name-only` les rend : une ligne de
 * champs, puis les fichiers qu'elle touche, puis la suivante.
 */
export function lireLeJournal(brut: string): ReadonlyArray<Mutation> {
  const mutations: Mutation[] = [];
  let courant: { quand: number; libelle: string } | null = null;
  const vues = new Set<string>();

  for (const ligne of brut.split("\n")) {
    if (ligne.includes(SEPARATEUR)) {
      const [, secondes, libelle] = ligne.split(SEPARATEUR);
      const quand = Number(secondes) * 1000;
      courant = Number.isFinite(quand) && quand > 0 ? { quand, libelle: libelle ?? "" } : null;
      continue;
    }
    const chemin = ligne.trim();
    if (chemin === "" || courant === null) continue;
    const skill = skillTouchee(chemin);
    if (skill === null) continue;
    // Un commit qui touche trois fichiers d'une skill est UNE mutation, pas
    // trois : sans ça, le seuil de jugement se déclencherait sur la taille du
    // commit plutôt que sur son existence.
    const cle = `${skill}@${String(courant.quand)}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    mutations.push({ skill, quand: courant.quand, libelle: courant.libelle });
  }
  return mutations;
}

interface LigneUsage {
  readonly payload_json: string;
  readonly created_at: string;
  readonly echec: number;
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const git = yield* GitVcsDriver.GitVcsDriver;

  const matiere: ApprentissageStoreShape["matiere"] = (cwd) =>
    Effect.gen(function* () {
      // `tool.completed` SEULEMENT, et c'est le point délicat.
      //
      // Une invocation émet aussi des `tool.updated` — deux en moyenne,
      // mesuré : 22 `updated` pour 11 `completed` sur les appels de Skill.
      // Lire les deux genres compterait donc chaque usage trois fois, et
      // gonflerait les fenêtres jusqu'à passer le plancher de jugement avec
      // trois fois moins d'usages réels que le seuil ne l'exige.
      //
      // L'issue de l'appel se lit sur `data.result.is_error`, qui vit sur le
      // `completed` — pas besoin du `status` de l'`updated`. `null` veut dire
      // que le résultat n'a rien signalé : c'est une réussite.
      const lignes = yield* sql<LigneUsage>`
        SELECT payload_json, created_at,
               CASE WHEN json_extract(payload_json, '$.data.result.is_error') = 1 THEN 1 ELSE 0 END AS echec
        FROM projection_thread_activities
        WHERE kind = 'tool.completed'
          AND json_extract(payload_json, '$.data.toolName') = 'Skill'
        ORDER BY created_at ASC
      `.pipe(Effect.mapError(toPersistenceSqlError("ApprentissageStore.matiere:usages")));

      const observations: Observation[] = [];
      for (const ligne of lignes) {
        const skill = nomDeSkillInvoquee(ligne.payload_json);
        if (skill === null) continue;
        const quand = Date.parse(ligne.created_at);
        // Un horodatage abîmé ne se range dans aucune fenêtre : le compter
        // quand même le mettrait arbitrairement dans « avant ».
        if (Number.isNaN(quand)) continue;
        observations.push({ skill, quand, reussi: ligne.echec === 0 });
      }

      const bornes = yield* sql<{ readonly jusqu: string | null }>`
        SELECT MAX(created_at) AS jusqu FROM projection_thread_activities
      `.pipe(Effect.mapError(toPersistenceSqlError("ApprentissageStore.matiere:bornes")));
      const brut = bornes[0]?.jusqu;
      const fin = brut == null ? Number.NaN : Date.parse(brut);
      const finDesDonnees = Number.isNaN(fin) ? null : fin;

      // Git peut échouer pour des raisons banales — pas un dépôt, dépôt vide,
      // aucun dossier de skills. Aucune n'est une panne : elles veulent toutes
      // dire « aucune mutation à montrer », et faire tomber l'outil entier
      // pour ça priverait de la moitié qui marche.
      const mutations = yield* git
        .execute({
          operation: "ApprentissageStore.mutations",
          cwd,
          args: [
            "log",
            `--format=%H${SEPARATEUR}%at${SEPARATEUR}%s`,
            "--name-only",
            "--no-merges",
            "--",
            ".claude/skills",
          ],
        })
        .pipe(
          Effect.map((resultat) => lireLeJournal(resultat.stdout)),
          Effect.orElseSucceed(() => [] as ReadonlyArray<Mutation>),
        );

      return { mutations, observations, finDesDonnees };
    });

  return { matiere } satisfies ApprentissageStoreShape;
});

export const ApprentissageStoreLive = Layer.effect(ApprentissageStore, make);
