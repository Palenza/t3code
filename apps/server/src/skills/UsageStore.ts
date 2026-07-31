/**
 * USAGE DES SKILLS — l'accès aux données, et rien d'autre.
 *
 * T3 enregistre déjà chaque invocation de skill : le CLI Claude Code expose
 * un outil `Skill`, et notre ingestion le persiste comme n'importe quel
 * `tool.completed`. Vérifié sur la base réelle le 31/07 — 11 appels, avec le
 * nom dans `payload_json.data.input.skill`.
 *
 * On LIT donc ce qui existe : aucune instrumentation, aucune écriture, aucun
 * nouveau schéma, et surtout aucun fichier déposé près des skills — un
 * sidecar y déclencherait un `reloadSkills()` par tour (voir l'en-tête de
 * `UsageDesSkills.ts`).
 *
 * Toute la DÉCISION vit dans `UsageDesSkills.ts`, pur et testé sans base. Ce
 * fichier ne sait que lire et décoder.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "../persistence/Errors.ts";
import type { PersistenceSqlError } from "../persistence/Errors.ts";
import { fenetreDe, type AppelsDUneSkill, type Fenetre } from "./UsageDesSkills.ts";

export interface UsageStoreShape {
  /** Les appels par skill, tous fils confondus. */
  readonly appelsParSkill: () => Effect.Effect<ReadonlyArray<AppelsDUneSkill>, PersistenceSqlError>;
  /**
   * La période réellement couverte par la projection.
   *
   * Elle se LIT, elle ne se suppose pas : la projection est élaguée, donc la
   * fenêtre bouge. Sans elle, un compte à zéro se lirait comme une absence
   * d'usage alors que c'est une absence d'observation.
   */
  readonly fenetreObservee: () => Effect.Effect<Fenetre | null, PersistenceSqlError>;
}

export class UsageStore extends Context.Service<UsageStore, UsageStoreShape>()(
  "t3/skills/UsageStore",
) {}

/** Le nom de la skill invoquée, ou `null` si l'activité n'en est pas une. */
export function nomDeSkillInvoquee(payload: string): string | null {
  let objet: unknown;
  try {
    objet = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof objet !== "object" || objet === null) return null;
  const data = (objet as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const donnees = data as { toolName?: unknown; input?: { skill?: unknown } };
  if (donnees.toolName !== "Skill") return null;
  const nom = donnees.input?.skill;
  // Une activité `Skill` sans nom exploitable est ignorée, jamais fatale : un
  // compteur qui casse sur une charge inattendue disparaîtrait exactement au
  // moment où on en a besoin.
  if (typeof nom !== "string" || nom.length === 0) return null;
  return nom;
}

interface LigneActivite {
  readonly payload_json: string;
  readonly created_at: string;
}

interface LigneBornes {
  readonly depuis: string | null;
  readonly jusqu: string | null;
}

const makeUsageStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const appelsParSkill: UsageStoreShape["appelsParSkill"] = () =>
    Effect.gen(function* () {
      // On filtre côté SQL sur le nom d'outil pour ne pas rapatrier les
      // dizaines de milliers de `Bash`, puis on décode en TypeScript : le
      // JSON de la charge est du contenu, pas un schéma sur lequel s'appuyer.
      const lignes = yield* sql<LigneActivite>`
        SELECT payload_json, created_at
        FROM projection_thread_activities
        WHERE kind = 'tool.completed'
          AND json_extract(payload_json, '$.data.toolName') = 'Skill'
        ORDER BY created_at ASC
      `;
      const compte = new Map<string, { appels: number; dernier: number | null }>();
      for (const ligne of lignes) {
        const nom = nomDeSkillInvoquee(ligne.payload_json);
        if (nom === null) continue;
        const quand = Date.parse(ligne.created_at);
        const vu = compte.get(nom) ?? { appels: 0, dernier: null };
        vu.appels += 1;
        // `Date.parse` rend NaN sur un horodatage abîmé : on compte quand même
        // l'appel, on refuse juste de dater.
        if (!Number.isNaN(quand) && (vu.dernier === null || quand > vu.dernier)) {
          vu.dernier = quand;
        }
        compte.set(nom, vu);
      }
      return [...compte].map(([nom, vu]) => ({
        nom,
        appels: vu.appels,
        dernierAppel: vu.dernier,
      }));
    }).pipe(Effect.mapError(toPersistenceSqlError("UsageStore.appelsParSkill:query")));

  const fenetreObservee: UsageStoreShape["fenetreObservee"] = () =>
    Effect.gen(function* () {
      const lignes = yield* sql<LigneBornes>`
        SELECT MIN(created_at) AS depuis, MAX(created_at) AS jusqu
        FROM projection_thread_activities
      `;
      const bornes = lignes[0];
      if (bornes?.depuis == null || bornes.jusqu == null) return null;
      const depuis = Date.parse(bornes.depuis);
      const jusqu = Date.parse(bornes.jusqu);
      if (Number.isNaN(depuis) || Number.isNaN(jusqu)) return null;
      return fenetreDe([depuis, jusqu]);
    }).pipe(Effect.mapError(toPersistenceSqlError("UsageStore.fenetreObservee:query")));

  return { appelsParSkill, fenetreObservee } satisfies UsageStoreShape;
});

export const UsageStoreLive = Layer.effect(UsageStore, makeUsageStore);
