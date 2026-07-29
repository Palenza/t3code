import { MODES_LIVRES, type ModeTravail } from "@t3tools/shared/modesTravail";
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { appliquerModeAuHome } from "./provider/Drivers/ClaudeModePermissions.ts";
import { resolveClaudeHomePath } from "./provider/Drivers/ClaudeHome.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "./tableauLocalProxy.ts";

/**
 * Poser un mode de travail, et le rendre EFFECTIF.
 *
 * Le chemin court, choisi contre une migration de contrat : plutôt que
 * d'étendre `ProviderInteractionMode` — deux littéraux figés dans les schémas,
 * le serveur, l'interface et les données déjà persistées — le mode se pose par
 * une route et s'applique là où il compte, dans le dossier de configuration de
 * la CLI. Un contrat à moitié migré casse le démarrage ; une route additive ne
 * casse rien, et rend le même service.
 *
 * Ce que ça produit concrètement : choisir « Revue » écrit un refus d'écriture
 * dans les permissions de la CLI du compte concerné. L'agent ne peut alors
 * plus modifier un fichier — pas « ne devrait pas », ne PEUT pas.
 */

const ModeDemande = Schema.Struct({
  /** Le slug d'un mode connu ; `null` rend la liberté. */
  slug: Schema.NullOr(Schema.String),
  /** Le compte visé ; absent = tous les comptes Claude configurés. */
  instanceId: Schema.optional(Schema.String),
});
const decodeDemande = Schema.decodeUnknownEffect(ModeDemande);

/** L'état courant, en mémoire : le mode ne survit pas à un redémarrage, les
 * permissions écrites sur disque, si — et c'est le disque qui fait foi. */
let modeCourant: ModeTravail | null = null;

export function modeActif(): ModeTravail | null {
  return modeCourant;
}

const trouverMode = (slug: string | null): ModeTravail | null | undefined =>
  slug === null ? null : MODES_LIVRES.find((mode) => mode.slug === slug);

const gardeLocale = (request: HttpServerRequest.HttpServerRequest) => {
  if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
    return HttpServerResponse.text("Local machine only.", { status: 403 });
  }
  if (!isSameAppBrowserRequest(request.headers)) {
    return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
  }
  return null;
};

export const modeEtatRouteLayer = HttpRouter.add(
  "GET",
  "/api/mode",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const refus = gardeLocale(request);
    if (refus !== null) return refus;
    return HttpServerResponse.jsonUnsafe(
      {
        actif: modeCourant === null ? null : modeCourant.slug,
        disponibles: MODES_LIVRES.map((mode) => ({
          slug: mode.slug,
          nom: mode.nom,
          role: mode.role,
          quandUtiliser: mode.quandUtiliser ?? null,
          perimetre: mode.perimetreEcriture ?? [],
        })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);

export const modePoserRouteLayer = HttpRouter.add(
  "POST",
  "/api/mode",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const refus = gardeLocale(request);
    if (refus !== null) return refus;

    const demande = yield* Effect.orElseSucceed(decodeDemande(yield* request.json), () => null);
    if (demande === null) {
      return HttpServerResponse.jsonUnsafe({ pose: false, raison: "slug manquant" }, { status: 400 });
    }
    const mode = trouverMode(demande.slug);
    if (mode === undefined) {
      // Un slug inconnu ne doit PAS rendre la liberté par accident : une faute
      // de frappe désarmerait le périmètre en silence.
      return HttpServerResponse.jsonUnsafe(
        { pose: false, raison: `mode inconnu : ${demande.slug}` },
        { status: 400 },
      );
    }

    const settings = yield* (yield* ServerSettingsService).getSettings;
    const instances = settings.providerInstances;
    const vises = Object.entries(instances).filter(
      ([cle, config]) =>
        config.driver === "claudeAgent" &&
        (demande.instanceId === undefined || cle === demande.instanceId),
    );

    let appliques = 0;
    for (const [cle, config] of vises) {
      const brut = config.config;
      const homePath =
        typeof brut === "object" && brut !== null && typeof (brut as { homePath?: unknown }).homePath === "string"
          ? (brut as { homePath: string }).homePath
          : "";
      // Sans dossier propre, l'instance partage le `~/.claude` de l'humain :
      // y écrire un refus toucherait sa CLI personnelle, hors de l'app.
      if (homePath.trim().length === 0) continue;
      const resolu = yield* resolveClaudeHomePath({ homePath });
      yield* appliquerModeAuHome(resolu, mode);
      appliques += 1;
      yield* Effect.logInfo("mode posé", { instanceId: cle as ProviderInstanceId, mode: mode?.slug ?? "libre" });
    }

    modeCourant = mode;
    return HttpServerResponse.jsonUnsafe({
      pose: true,
      mode: mode === null ? null : mode.slug,
      comptes: appliques,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("mode: pose impossible", { cause }).pipe(
        Effect.as(
          HttpServerResponse.jsonUnsafe({ pose: false, raison: "erreur interne" }, { status: 500 }),
        ),
      ),
    ),
  ),
);

/** Remet l'état en mémoire à zéro — tests uniquement. */
export function oublierModeActif(): void {
  modeCourant = null;
}
