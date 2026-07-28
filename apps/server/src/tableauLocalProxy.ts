import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
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
