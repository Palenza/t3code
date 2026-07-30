import { MODES_LIVRES, type ModeTravail } from "@t3tools/shared/modesTravail";
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { appliquerModeAuHome, lireModeDuHome } from "./provider/Drivers/ClaudeModePermissions.ts";
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

/**
 * Relit sur le DISQUE le mode reellement pose, tous comptes confondus.
 *
 * Rend `undefined` quand la lecture n'a rien pu conclure (reglages illisibles,
 * aucun compte a dossier propre) : dans ce cas on ne touche pas a l'etat en
 * memoire plutot que de le vider a tort. Rend `null` quand le disque dit
 * clairement qu'aucun mode n'est pose.
 */
const relireModeSurDisque = Effect.fn("relireModeSurDisque")(function* () {
  const settings = yield* (yield* ServerSettingsService).getSettings;
  const instances = settings.providerInstances;
  let lu: ModeTravail | null | undefined = undefined;
  for (const [, config] of Object.entries(instances)) {
    if (config.driver !== "claudeAgent") continue;
    const brut = config.config;
    const homePath =
      typeof brut === "object" && brut !== null && typeof (brut as { homePath?: unknown }).homePath === "string"
        ? (brut as { homePath: string }).homePath
        : "";
    if (homePath.trim().length === 0) continue;
    const resolu = yield* resolveClaudeHomePath({ homePath });
    const mode = yield* lireModeDuHome(resolu, MODES_LIVRES);
    // Le PLUS restrictif l'emporte : si un seul compte porte encore un refus,
    // l'utilisateur doit le voir. Mieux vaut annoncer une restriction qui ne
    // vaut que pour un compte que d'en cacher une qui mord.
    if (mode !== null) return mode;
    lu = lu === undefined ? null : lu;
  }
  return lu;
});

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
    // Le disque fait foi, pas la memoire du serveur. Au redemarrage l'ecran
    // redevenait gris pendant que la CLI appliquait toujours les refus — les
    // agents repondaient « Bash exists but is not enabled » sans que rien ne
    // l'explique. On relit ce qui est REELLEMENT pose.
    const surDisque = yield* relireModeSurDisque();
    if (surDisque !== undefined) modeCourant = surDisque;

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
    // La PORTÉE REELLE, pas seulement le nombre d'appliques. Un compte sans
    // dossier propre est SAUTE — et sur cette machine c'est le compte
    // principal, celui qui porte douze des quatorze fils actifs. Dire
    // « 3 comptes » laissait croire a « partout » ; il faut dire sur combien.
    return HttpServerResponse.jsonUnsafe({
      pose: true,
      mode: mode === null ? null : mode.slug,
      comptes: appliques,
      comptesTotal: vises.length,
      comptesSautes: vises.length - appliques,
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
