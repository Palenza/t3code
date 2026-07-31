/**
 * L'audit de démarrage, BRANCHÉ.
 *
 * `AuditDeDemarrage.ts` décide ; ce module-ci va chercher les faits et dit ce
 * qu'il trouve. La séparation n'est pas décorative : le module de décision est
 * pur, donc testable sur des modes de fichiers qu'on n'a pas sur cette
 * machine, y compris ceux qu'on espère ne jamais voir.
 *
 * ── Pourquoi il journalise et ne RÉPARE pas ───────────────────────────────
 *
 * Le fichier qui a motivé le contrôle, `clerk-tokens.json`, n'est pas écrit
 * par nous : `@clerk/electron/storage` le pose en 0666. Un `chmod` au
 * démarrage serait défait à la prochaine écriture de la dépendance — et entre
 * les deux, on aurait le confort d'avoir « corrigé ». Un audit qui répare mal
 * est pire qu'un audit qui dit. Resserrer ces modes touche l'authentification :
 * ça se décide, ça ne se glisse pas dans un branchement.
 *
 * ── Et pourquoi il ne bloque jamais ───────────────────────────────────────
 *
 * Doctrine reprise d'eux telle quelle : consultatif. Un audit qui empêche le
 * démarrage transforme un avertissement en panne, et la première chose qu'on
 * fait d'une panne au démarrage, c'est de la désactiver.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import {
  auditer,
  resumeDAudit,
  type FichierObserve,
  type Sensibilite,
} from "./AuditDeDemarrage.ts";

/**
 * Les fichiers regardés, et POURQUOI chacun.
 *
 * Liste courte et nommée plutôt qu'un balayage de dossier : un audit qui
 * énumère tout finit par crier sur des fichiers sans importance, et on
 * apprend à l'ignorer — c'est comme ça qu'un vrai constat se perd.
 */
const aRegarder = (config: {
  readonly baseDir: string;
  readonly settingsPath: string;
}): ReadonlyArray<{ readonly chemin: string; readonly sensibilite: Sensibilite }> => [
  {
    // Le jeton d'authentification. Écrit par `@clerk/electron/storage`, trouvé
    // en 0666 — modifiable par n'importe quel compte de la machine.
    chemin: `${config.baseDir}/userdata/clerk-tokens.json`,
    sensibilite: "secret",
  },
  {
    // La carte de l'installation : où vivent les comptes et leurs homes.
    chemin: config.settingsPath,
    sensibilite: "carte",
  },
];

/**
 * `estRoot` — POSIX seulement.
 *
 * `process.getuid` n'existe pas sous Windows ; le contrôle disparaît alors
 * sans bruit, comme chez eux. Ce n'est pas un oubli : la notion d'uid 0 n'y a
 * pas d'équivalent, et inventer une réponse serait pire que ne rien dire.
 */
const estRoot = (): boolean => process.getuid?.() === 0;

export const auditerAuDemarrage = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const fichiers: FichierObserve[] = [];
  for (const cible of aRegarder(config)) {
    const chemin = path.normalize(cible.chemin);
    // Un fichier absent n'est pas un constat : il n'existe pas encore, ou
    // cette installation ne s'en sert pas. `mode: null` le fait ignorer par le
    // module de décision, ce qui est exactement le bon comportement.
    const stat = yield* fs.stat(chemin).pipe(Effect.orElseSucceed(() => null));
    fichiers.push({
      chemin,
      mode: stat === null ? null : Number(stat.mode) & 0o777,
      sensibilite: cible.sensibilite,
    });
  }

  const constats = auditer({ estRoot: estRoot(), fichiers });
  const resume = resumeDAudit(constats);
  // Silencieux quand tout va bien : un audit qui parle à chaque démarrage
  // devient un bruit qu'on filtre, et c'est le jour où il a raison qu'on ne
  // le lit plus.
  if (resume !== null) {
    yield* Effect.logWarning(resume, {
      graves: constats.filter((c) => c.gravite === "grave").length,
      chemins: constats.map((c) => c.chemin).filter((c) => c !== undefined),
    });
  }
  return constats;
});

/** À poser dans la construction du serveur. N'échoue jamais, ne bloque rien. */
export const layer = Layer.effectDiscard(
  auditerAuDemarrage.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("L'audit de démarrage n'a pas pu s'exécuter.", { cause }),
    ),
  ),
);
