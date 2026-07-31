import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import packageJson from "../../../../package.json" with { type: "json" };
import * as ServerConfig from "../../../config.ts";
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
import {
  rendreInventaire,
  saillantDeLInventaire,
  type FaitsDInventaire,
} from "../../../doctor/Inventaire.ts";
import { ServerSettingsService } from "../../../serverSettings.ts";
import { skillsSurDisque } from "../../../skills/SurDisque.ts";
import type { ServerProviderRateLimitWindow } from "@t3tools/contracts";
import {
  HostProcessArchitecture,
  HostProcessEnvironment,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";

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
 * Les variables qu'on cherche, par NOM.
 *
 * Liste fermée et non un balayage de `process.env` : un balayage recopierait
 * l'environnement entier dans un texte fait pour être collé quelque part
 * d'où on ne peut plus le retirer. Seuls les NOMS sortent, jamais les valeurs
 * — mais même un nom inattendu peut en dire trop sur une machine.
 */
const VARIABLES_REGARDEES = [
  "CLAUDE_CONFIG_DIR",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "NODE_OPTIONS",
  "T3_BASE_DIR",
] as const;

/**
 * Le poids de l'état sur disque.
 *
 * Récursif, et volontairement TOLÉRANT : un sous-dossier illisible compte
 * pour zéro plutôt que de faire échouer tout l'inventaire. Un inventaire
 * qu'une permission fait échouer n'est jamais collé dans le rapport de bug
 * qui en avait besoin.
 */
const poidsDuDossier = (racine: string): Effect.Effect<number, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const info = yield* fileSystem.stat(racine).pipe(Effect.orElseSucceed(() => null));
    if (info === null) return 0;
    if (info.type !== "Directory") return Number(info.size);

    const entrees = yield* fileSystem.readDirectory(racine).pipe(Effect.orElseSucceed(() => []));
    const poids = yield* Effect.forEach(
      entrees,
      (entree) => poidsDuDossier(`${racine}/${entree}`),
      {
        concurrency: 8,
      },
    );
    return poids.reduce((total, n) => total + n, 0);
  });

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
  inventaire: () =>
    Effect.flatMap(
      Effect.gen(function* () {
        const config = yield* ServerConfig.ServerConfig;
        const settings = yield* ServerSettingsService;
        // Références et non lectures directes de `process` : c'est la règle du
        // dépôt, et elle rend l'inventaire reproductible sous test.
        const plateforme = yield* HostProcessPlatform;
        const architecture = yield* HostProcessArchitecture;
        const environnement = yield* HostProcessEnvironment;
        const reglages = yield* settings.getSettings.pipe(
          Effect.mapError(
            (cause) =>
              new SanteError({
                message: `Les réglages n'ont pas pu être lus (${String(cause)}), donc la liste des comptes configurés est inconnue.`,
              }),
          ),
        );
        const home = environnement.HOME ?? environnement.USERPROFILE ?? "";
        const santes = new Map(toutesLesSantes().map((s) => [String(s.instanceId), s]));

        const skills = yield* skillsSurDisque({
          config: { homePath: "" },
          environment: environnement,
        });

        const faits: FaitsDInventaire = {
          versionApp: packageJson.version,
          plateforme: `${plateforme} ${architecture}`,
          versionNode: process.versions.node,
          home,
          comptes: Object.entries(reglages.providerInstances).map(([id, instance]) => ({
            nom: instance.displayName ?? id,
            driver: instance.driver,
            // Un compte est DÉSACTIVÉ explicitement, ou écarté par sa santé.
            // Un compte qui n'a simplement pas encore servi reste « actif » :
            // les stores de santé repartent vides à chaque démarrage, et le
            // compter inactif ferait dire à l'inventaire « aucun compte
            // actif » sur une installation parfaitement saine.
            actif: instance.enabled !== false && (santes.get(id)?.etat ?? "ok") === "ok",
          })),
          // `null` et non `[]` : T3 ne configure PAS les serveurs MCP, ils
          // vivent dans chaque home Claude. Rendre une liste vide dirait
          // « il n'y en a pas », ce qu'on n'a pas vérifié (H4).
          serveursMcp: null,
          skills: skills.length,
          etatOctets: yield* poidsDuDossier(config.baseDir),
          variables: VARIABLES_REGARDEES.filter((nom) => environnement[nom] !== undefined),
        };
        return {
          texte: rendreInventaire(faits),
          saillant: saillantDeLInventaire(faits),
          // H4 : ce qui n'a pas été regardé se dit. Sans cette ligne, un
          // inventaire complet en apparence laisserait croire qu'on a vérifié
          // les serveurs MCP et qu'ils vont bien.
          note: "Les serveurs MCP ne sont pas inspectés : T3 ne les configure pas, ils vivent dans chaque home Claude. Les variables d'environnement sont listées par NOM seulement — aucune valeur ne sort d'ici.",
        };
      }),
      porteDeSortie,
    ),
} satisfies Parameters<typeof SanteToolkit.toLayer>[0];

export const SanteToolkitHandlersLive = SanteToolkit.toLayer(handlers);
