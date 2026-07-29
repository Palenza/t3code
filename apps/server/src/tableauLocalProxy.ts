import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { DESKTOP_RENDERER_ORIGINS } from "./http.ts";
import {
  HttpClient,
  HttpClientResponse,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

/**
 * Read-only proxy to the local `cc-tableau` dashboard (an out-of-repo tool
 * serving machine-wide state — factory status, repo status — on 127.0.0.1).
 *
 * The web app cannot fetch that server directly: it sends no CORS headers and
 * lives outside this repo. Proxying through the backend keeps the request
 * same-origin for the renderer without touching the external tool.
 *
 * Deliberately unauthenticated but loopback-gated: the payload only describes
 * the machine the server runs on, and only callers on that machine can read
 * it. A request whose source address cannot be established is refused rather
 * than trusted.
 */

const TABLEAU_LOCAL_ETAT_URL = "http://127.0.0.1:8318/api/etat";
const TABLEAU_LOCAL_TIMEOUT_MS = 3_000;
/**
 * Structured affiliation state, written by Palenza's own generator
 * (`scripts/etat-affiliation.mjs` → `data/etat-affiliation.json`). Read from
 * disk on each request: the file carries its own `genere_le` stamp, so the
 * client can always show the reading's age instead of passing it off as live.
 */
const AFFILIATION_JSON_PATH = "/Users/enzo/Documents/Palenza/data/etat-affiliation.json";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopbackRemoteAddress(remoteAddress: string | null | undefined): boolean {
  if (remoteAddress === null || remoteAddress === undefined) {
    return false;
  }
  return LOOPBACK_ADDRESSES.has(remoteAddress.trim().toLowerCase());
}

const LOCAL_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * CSRF guard for the loopback-gated routes (trouvaille essaim 29/07): the
 * loopback check alone lets any WEBSITE open in a local browser reach these
 * endpoints — the request originates from the browser process, so its socket
 * IS loopback. Browsers label such requests themselves: `sec-fetch-site:
 * cross-site` and/or a foreign `origin` header. Those are refused.
 *
 * What must keep working: the PACKAGED app's renderer — it lives on the
 * custom scheme (`t3code://app`, see DESKTOP_RENDERER_ORIGINS), so its
 * fetches to the local server are labelled cross-site by Chromium; the
 * origin allowlist must therefore be checked BEFORE the sec-fetch-site
 * verdict (learned the hard way: the first version of this guard silenced
 * the Tableau local page and the update pill in the installed app). Also
 * kept working: the dev renderer (same-site between web and server ports)
 * and plain local tooling like curl, which sends neither header and is
 * already covered by the loopback gate.
 */
export function isSameAppBrowserRequest(headers: {
  readonly [key: string]: string | ReadonlyArray<string> | undefined;
}): boolean {
  const single = (value: string | ReadonlyArray<string> | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : (value as string | undefined);
  const origin = single(headers["origin"])?.trim();
  // The desktop renderer's own origin outranks every other signal: a web
  // page cannot forge its Origin header, so this allowlist is safe.
  if (origin !== undefined && DESKTOP_RENDERER_ORIGINS.includes(origin)) {
    return true;
  }
  const fetchSite = single(headers["sec-fetch-site"])?.trim().toLowerCase();
  if (fetchSite !== undefined && fetchSite !== "") {
    return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  }
  if (origin === undefined || origin === "" || origin === "null") {
    // No browser markings at all: not a cross-site browser request.
    return origin !== "null";
  }
  try {
    return LOCAL_ORIGIN_HOSTS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const decodeJsonString = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);

export function readRemoteAddress(source: unknown): string | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const candidate = source as {
    readonly remoteAddress?: string | null;
    readonly socket?: {
      readonly remoteAddress?: string | null;
    };
  };
  return candidate.socket?.remoteAddress ?? candidate.remoteAddress ?? undefined;
}

export const tableauLocalProxyRouteLayer = HttpRouter.add(
  "GET",
  "/api/tableau-local/etat",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }

    const httpClient = yield* HttpClient.HttpClient;
    const corps = yield* httpClient.get(TABLEAU_LOCAL_ETAT_URL).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.text),
      Effect.timeout(TABLEAU_LOCAL_TIMEOUT_MS),
      Effect.orElseSucceed(() => null),
    );

    const fileSystem = yield* FileSystem.FileSystem;
    const affiliationBrut = yield* fileSystem
      .readFileString(AFFILIATION_JSON_PATH)
      .pipe(Effect.orElseSucceed(() => null));

    // The two sources fail independently: a dead dashboard must not hide the
    // affiliation file, and vice versa. Each side is null when unavailable —
    // the client decides how to say so. 503 only when BOTH are silent.
    const tableau =
      corps === null ? null : yield* decodeJsonString(corps).pipe(Effect.orElseSucceed(() => null));
    const affiliation =
      affiliationBrut === null
        ? null
        : yield* decodeJsonString(affiliationBrut).pipe(Effect.orElseSucceed(() => null));
    if (tableau === null && affiliation === null) {
      return HttpServerResponse.text("Tableau local unreachable.", { status: 503 });
    }

    return HttpServerResponse.jsonUnsafe(
      { tableau, affiliation },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);
