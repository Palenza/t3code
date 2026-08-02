import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import {
  RAISON_ILLISIBLE,
  RAISON_INJOIGNABLE,
  presentTableauLocal,
  type TableauLocalEtat,
} from "./tableauLocal";

/**
 * La lecture du tableau local, en UN seul endroit.
 *
 * Deux vues le lisent désormais : la page `/settings/tableau-local` et le rond
 * du composeur. Deux copies de ce fetch, c'est deux délais d'expiration, deux
 * façons de gérer un JSON cassé — et un jour deux réponses différentes à la
 * même question.
 */

const TABLEAU_PATH = "/api/tableau-local/etat";
const FETCH_TIMEOUT_MS = 5_000;

export async function lireTableauLocal(): Promise<TableauLocalEtat> {
  let response: Response;
  try {
    response = await fetch(resolvePrimaryEnvironmentHttpUrl(TABLEAU_PATH), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { kind: "muet", raison: RAISON_INJOIGNABLE };
  }
  if (!response.ok) {
    return { kind: "muet", raison: RAISON_INJOIGNABLE };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "muet", raison: RAISON_ILLISIBLE };
  }
  return presentTableauLocal(payload, Date.now());
}
