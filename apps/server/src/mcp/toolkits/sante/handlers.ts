import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  diagnostiquerComptes,
  diagnostiquerIndex,
  diagnostiquerPannes,
  verdictGeneral,
  type CompteObserve,
  type Constat,
  type IndexObserve,
  type PanneInconnue,
} from "../../../doctor/Diagnostic.ts";
import type { ServerProviderRateLimitWindow } from "@t3tools/contracts";

import { lireCarnet } from "../../../provider/carnetInconnus.ts";
import type { SanteCompte } from "../../../provider/comptePool.ts";
import { toutesLesSantes } from "../../../provider/compteSanteStore.ts";
import { getRateLimits } from "../../../provider/rateLimitStore.ts";
import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { SanteError, SanteToolkit } from "./tools.ts";

/**
 * Les deux fenêtres que le fournisseur rapporte, telles qu'elles arrivent.
 * `claudeUsageLimitRefusal.ts` les nomme déjà ainsi — on ne réinvente pas un
 * second vocabulaire pour la même chose.
 */
const CINQ_HEURES = "five_hour";
const SEPT_JOURS = "seven_day";

const UneLigne = Schema.Struct({ n: Schema.Number });

/**
 * Ce que les stores savent des comptes EN CE MOMENT.
 *
 * Attention à ce que ça ne dit pas : ces stores sont process-locaux et repartent
 * vides à chaque démarrage — délibérément, pour qu'un « mort » n'y survive pas à
 * la ré-authentification qui le guérit. Un compte qui n'a pas encore servi
 * depuis le démarrage n'y figure donc pas. C'est un fait sur NOUS, pas sur la
 * configuration (H4), et la note finale le dit.
 */
export function enCompteObserve(
  sante: SanteCompte,
  fenetres: ReadonlyArray<ServerProviderRateLimitWindow>,
): CompteObserve {
  const pourcentage = (kind: string): number | null =>
    // `?? null` et pas `?? 0` : une fenêtre SANS pourcentage arrive vraiment —
    // le SDK type `utilization?: number` et un vrai tour Max n'en a envoyé
    // aucun. Zéro voudrait dire « compte intact », l'exact contraire de
    // « on ne sait pas ».
    fenetres.find((f) => f.kind === kind)?.utilization ?? null;

  return {
    nom: String(sante.instanceId),
    sante: sante.etat === "refroidissement" ? "refroidit" : sante.etat,
    cinqHeures: pourcentage(CINQ_HEURES),
    septJours: pourcentage(SEPT_JOURS),
    // `mort` n'est posé QUE par `authentification-morte` (comptePool.ts) :
    // l'équivalence est exacte, pas une approximation.
    authExpiree: sante.etat === "mort",
  };
}

const comptesObserves = (): ReadonlyArray<CompteObserve> =>
  toutesLesSantes().map((sante) =>
    enCompteObserve(sante, getRateLimits(sante.instanceId)?.windows ?? []),
  );

/**
 * L'état de l'index de rappel.
 *
 * La table est virtuelle (fts5) et peut ne pas exister du tout : c'est le cas
 * quand le serveur tourne encore sur une base d'avant la migration 036. On
 * distingue ce cas d'une simple dérive, parce que le geste diffère — relancer
 * le serveur d'un côté, reconstruire l'index de l'autre.
 */
const indexObserve = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const compter = <E>(requete: Effect.Effect<ReadonlyArray<unknown>, E>) =>
    requete.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(UneLigne))),
      Effect.map((lignes) => lignes[0]?.n ?? 0),
    );

  // On DEMANDE si la table est là, on ne le déduit pas d'un échec. Interroger
  // `thread_messages_fts` et traiter l'erreur comme « absente » confondrait
  // une table manquante avec une base verrouillée ou corrompue — et rendrait
  // « relance le serveur » là où il faut tout autre chose. Ici, une vraie
  // panne SQL remonte comme une panne SQL.
  const presente =
    (yield* compter(
      sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'thread_messages_fts'`,
    )) > 0;
  if (!presente) {
    return { existe: false, messagesIndexes: 0, messagesStabilises: 0 } satisfies IndexObserve;
  }

  return {
    existe: true,
    messagesIndexes: yield* compter(sql`SELECT COUNT(*) AS n FROM thread_messages_fts`),
    messagesStabilises: yield* compter(sql`SELECT COUNT(*) AS n FROM projection_thread_messages`),
  } satisfies IndexObserve;
}).pipe(
  // Une base illisible est un fait à REMONTER, pas à ranger en « index
  // absent ». Le doctor perd un angle et le dit ; il n'invente pas de geste.
  Effect.mapError(
    (cause) =>
      new SanteError({
        message: `La base est illisible, donc l'état de l'index de rappel est inconnu (${String(cause)}). Le reste du diagnostic n'a pas été tenté.`,
      }),
  ),
);

/**
 * Le carnet des pannes non reconnues, dans la forme que le doctor attend.
 *
 * Un carnet illisible ne devient pas « aucune panne » : ce serait un vert
 * fabriqué. On rend `null`, et la note le dit.
 */
const pannesObservees = lireCarnet().pipe(
  Effect.map((carnet): ReadonlyArray<PanneInconnue> | null =>
    carnet.map((entree) => ({
      signature: entree.signature,
      occurrences: entree.occurrences,
    })),
  ),
  Effect.catchCause(() => Effect.succeed(null)),
);

const handlers = {
  sante: () =>
    Effect.flatMap(
      Effect.gen(function* () {
        const comptes = comptesObserves();
        const index = yield* indexObserve;
        const pannes = yield* pannesObservees;

        const constats: Constat[] = [...diagnostiquerComptes(comptes), diagnostiquerIndex(index)];
        if (pannes !== null) constats.push(diagnostiquerPannes(pannes));

        // H4 : ce qu'on n'a pas regardé se dit comme un fait sur NOUS. Sans
        // cette phrase, un `verdict: "ok"` se lirait « tout va bien » alors
        // qu'il veut dire « rien de cassé PARMI CE QU'ON A REGARDÉ ».
        const angles: string[] = [
          comptes.length === 0
            ? "comptes : aucun n'a encore servi depuis le démarrage du serveur — les stores de santé sont process-locaux et repartent vides, donc ce silence ne dit rien de la configuration"
            : `comptes : ${String(comptes.length)} observé(s) depuis le démarrage`,
          "index de rappel : regardé",
          pannes === null
            ? "pannes non reconnues : carnet ILLISIBLE — absence de constat, pas absence de panne"
            : `pannes non reconnues : ${String(pannes.length)} signature(s) au carnet`,
        ];

        return {
          verdict: verdictGeneral(constats),
          constats,
          note: `Regardé : ${angles.join(" · ")}. Ce passage ne dit rien de ce qui n'est pas dans cette liste.`,
        };
      }),
      porteDeSortie,
    ),
} satisfies Parameters<typeof SanteToolkit.toLayer>[0];

export const SanteToolkitHandlersLive = SanteToolkit.toLayer(handlers);
