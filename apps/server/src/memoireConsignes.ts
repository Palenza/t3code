import { extraireConsignes, memoireAReinjecter, type Consigne } from "@t3tools/shared/consignes";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { resolveClaudeHomePath } from "./provider/Drivers/ClaudeHome.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "./tableauLocalProxy.ts";

/**
 * La mémoire réinjectée — ce qui a été dit une fois arrive dans la session
 * suivante sans qu'on ait à le redire.
 *
 * Le principe vient de claude-mem : capturer pendant, réinjecter au démarrage.
 * Réécrit en interne sur consigne explicite (« on ne passe jamais par d'autres
 * serveurs, tout est internalisé à vie »). Ce qu'on leur emprunte est
 * l'ARCHITECTURE — se greffer sur ce que l'hôte lit déjà plutôt que de le
 * modifier — pas leur implémentation.
 *
 * Le canal de réinjection est un `CLAUDE.md` dans le dossier de configuration
 * de l'instance. C'est le fichier que la CLI charge d'elle-même au démarrage :
 * aucun code à exécuter, aucun crochet à poser, rien qui puisse se
 * désynchroniser. Si demain la CLI change son mécanisme, la mémoire cesse
 * d'arriver — elle ne se corrompt pas.
 *
 * La capture, elle, vit côté client : c'est là que les messages de l'humain
 * existent en entier.
 */

const CONSIGNE_WIRE = Schema.Struct({
  phrase: Schema.String,
  nature: Schema.Literals(["interdit", "impose"]),
});
const Corps = Schema.Struct({ consignes: Schema.Array(CONSIGNE_WIRE) });
const decodeCorps = Schema.decodeUnknownEffect(Corps);

/** Le fichier que la CLI lit d'elle-même au démarrage d'une session. */
const NOM_FICHIER = "CLAUDE.md";

/**
 * Bornes du bloc géré. Ce qui est écrit à côté appartient à l'utilisateur et
 * n'est jamais touché : on remplace notre bloc, pas son fichier.
 */
const DEBUT = "<!-- memoire-t3code:debut -->";
const FIN = "<!-- memoire-t3code:fin -->";

function fusionner(existant: string, memoire: string): string {
  const bloc = memoire.trim().length === 0 ? "" : `${DEBUT}\n${memoire.trim()}\n${FIN}\n`;
  const debut = existant.indexOf(DEBUT);
  const fin = existant.indexOf(FIN);
  if (debut !== -1 && fin !== -1 && fin > debut) {
    const avant = existant.slice(0, debut);
    const apres = existant.slice(fin + FIN.length).replace(/^\n/u, "");
    return `${avant}${bloc}${apres}`;
  }
  if (bloc.length === 0) return existant;
  // Notre bloc passe EN TÊTE : ce que l'humain a interdit doit être lu avant
  // les instructions de projet, pas après.
  return existant.trim().length === 0 ? bloc : `${bloc}\n${existant}`;
}

export const memoireRouteLayer = HttpRouter.add(
  "POST",
  "/api/memoire",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }
    const corps = yield* Effect.orElseSucceed(decodeCorps(yield* request.json), () => null);
    if (corps === null) {
      return HttpServerResponse.jsonUnsafe({ ecrit: 0, raison: "corps invalide" }, { status: 400 });
    }

    const memoire = memoireAReinjecter(corps.consignes as ReadonlyArray<Consigne>);
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const settings = yield* (yield* ServerSettingsService).getSettings;

    let ecrit = 0;
    for (const config of Object.values(settings.providerInstances)) {
      if (config.driver !== "claudeAgent") continue;
      const brut = config.config;
      const homePath =
        typeof brut === "object" &&
        brut !== null &&
        typeof (brut as { homePath?: unknown }).homePath === "string"
          ? (brut as { homePath: string }).homePath
          : "";
      // Sans dossier propre, l'instance partage le ~/.claude de l'humain :
      // y écrire toucherait sa CLI personnelle, hors de l'app.
      if (homePath.trim().length === 0) continue;
      const resolu = yield* resolveClaudeHomePath({ homePath });
      const fichier = path.join(resolu, NOM_FICHIER);
      const existant = yield* fs.readFileString(fichier).pipe(Effect.orElseSucceed(() => ""));
      yield* fs
        .writeFileString(fichier, fusionner(existant, memoire))
        .pipe(Effect.catchCause(() => Effect.void));
      ecrit += 1;
    }
    return HttpServerResponse.jsonUnsafe({ ecrit, consignes: corps.consignes.length });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("mémoire: écriture impossible", { cause }).pipe(
        Effect.as(HttpServerResponse.jsonUnsafe({ ecrit: 0 }, { status: 500 })),
      ),
    ),
  ),
);

export { extraireConsignes, fusionner };
