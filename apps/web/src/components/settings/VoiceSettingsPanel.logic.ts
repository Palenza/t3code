import type {
  ModelCatalogEntry,
  ModelCatalogQuantization,
  ModelDownloadState,
  ServerVoiceModelSnapshot,
  ServerVoiceModelTarget,
  VoiceDictionaryEntry,
} from "@t3tools/contracts";

export function resolveDisplayedModelTarget(input: {
  readonly desktopManagerAvailable: boolean;
  readonly localModelId: string;
  readonly localQuantizationId: string;
  readonly serverSnapshot: ServerVoiceModelSnapshot | null;
}): ServerVoiceModelTarget | null {
  if (!input.desktopManagerAvailable) return input.serverSnapshot?.selected ?? null;
  return input.localModelId.length > 0 && input.localQuantizationId.length > 0
    ? { modelId: input.localModelId, quantizationId: input.localQuantizationId }
    : null;
}

export function formatModelBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function downloadKey(modelId: string, quantizationId: string): string {
  return `${modelId}:${quantizationId}`;
}

export function indexDownloadStates(
  states: ReadonlyArray<ModelDownloadState>,
): ReadonlyMap<string, ModelDownloadState> {
  return new Map(states.map((state) => [downloadKey(state.modelId, state.quantizationId), state]));
}

export function selectedQuantization(
  model: ModelCatalogEntry,
  preferredQuantizationId: string,
): ModelCatalogQuantization | undefined {
  return (
    model.quantizations.find((quantization) => quantization.id === preferredQuantizationId) ??
    model.quantizations.find((quantization) => quantization.id === "Q8_0") ??
    model.quantizations[0]
  );
}

export function modelSizeLabel(
  quantization: ModelCatalogQuantization,
): "Small model" | "Medium model" | "Large model" {
  if (quantization.sizeBytes < 300_000_000) return "Small model";
  if (quantization.sizeBytes < 900_000_000) return "Medium model";
  return "Large model";
}

export function resolveModelRegistry(input: {
  readonly desktopManagerAvailable: boolean;
  readonly inferenceMode: "auto" | "local" | "server";
  readonly serverEnabled: boolean;
}): "local" | "server" {
  const serverSelected =
    input.inferenceMode === "server" || (input.inferenceMode === "auto" && input.serverEnabled);
  return input.desktopManagerAvailable && !serverSelected ? "local" : "server";
}

export function modelSearchMatches(model: ModelCatalogEntry, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [model.id, model.displayName, model.description, ...model.capabilities.languages]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}

/** Separators accepted between spoken forms and their replacement, tried in order. */
const PASTE_SEPARATORS = ["->", "=>", "→", "=", "\t"] as const;

export interface DictionaryPasteResult {
  readonly entries: ReadonlyArray<VoiceDictionaryEntry>;
  /** Lines that could not be understood, verbatim — shown back, never dropped silently. */
  readonly rejected: ReadonlyArray<string>;
}

/**
 * Parses a plain-text list pasted by the user, one entry per line:
 *
 *   té trois code, pé trois -> Raptor     (alias: spoken forms → replacement)
 *   Palenza                                (bare word: term the recognizer should know)
 *
 * `->`, `=>`, `→`, `=` and a tab all work as the separator. Pasted entries
 * default to fuzzy, case-insensitive — the whole point of pasting a list is
 * catching mis-heard words.
 */
export function parseDictionaryPaste(text: string, makeId: () => string): DictionaryPasteResult {
  const entries: VoiceDictionaryEntry[] = [];
  const rejected: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const separator = PASTE_SEPARATORS.find((candidate) => line.includes(candidate));
    const [left, right] =
      separator === undefined
        ? [line, null]
        : [
            line.slice(0, line.indexOf(separator)),
            line.slice(line.indexOf(separator) + separator.length),
          ];
    const originals = left
      .split(/[,·]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const replacement = right?.trim() ?? "";
    if (originals.length === 0 || (separator !== undefined && !replacement)) {
      rejected.push(line);
      continue;
    }
    entries.push({
      id: makeId(),
      type: separator === undefined ? "term" : "alias",
      originals,
      ...(separator === undefined ? {} : { replacement }),
      caseSensitive: false,
      fuzzy: true,
      enabled: true,
    });
  }
  return { entries, rejected };
}

export function parseDictionaryImport(json: string): ReadonlyArray<VoiceDictionaryEntry> {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Dictionary JSON must be an array.");
  return parsed.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`Dictionary entry ${index + 1} must be an object.`);
    }
    const entry = value as Record<string, unknown>;
    const originals = Array.isArray(entry.originals)
      ? entry.originals.filter((item): item is string => typeof item === "string")
      : [];
    if (originals.length === 0 || originals.some((item) => item.trim().length === 0)) {
      throw new Error(`Dictionary entry ${index + 1} needs at least one spoken form.`);
    }
    const type = entry.type === "term" ? "term" : entry.type === "alias" ? "alias" : null;
    if (!type) throw new Error(`Dictionary entry ${index + 1} has an invalid type.`);
    const replacement =
      typeof entry.replacement === "string" && entry.replacement.trim()
        ? entry.replacement.trim()
        : undefined;
    if (type === "alias" && !replacement) {
      throw new Error(`Alias entry ${index + 1} needs a replacement.`);
    }
    return {
      id:
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id
          : `imported-${index}-${Date.now()}`,
      type,
      originals: originals.map((item) => item.trim()),
      ...(replacement ? { replacement } : {}),
      caseSensitive: entry.caseSensitive === true,
      fuzzy: entry.fuzzy === true,
      enabled: entry.enabled !== false,
    };
  });
}

export function serializeDictionary(entries: ReadonlyArray<VoiceDictionaryEntry>): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

export function dictionaryEquals(
  left: ReadonlyArray<VoiceDictionaryEntry>,
  right: ReadonlyArray<VoiceDictionaryEntry>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * LE DÉLAI AVANT QUE LE MOTEUR VOCAL SOIT TUÉ, LU DEPUIS UN CHAMP DE TEXTE.
 *
 * `voice.idleTimeoutMinutes` est appliqué pour de bon : au-delà de ce délai
 * sans audio, le moteur est arrêté pour libérer la mémoire
 * (`TranscriptionService.ts:306`), et le clip suivant paie de nouveau les
 * ~7 s de chargement du modèle. Le réglage existait donc — sans aucun champ
 * pour le toucher.
 *
 * Un champ de texte rend des choses qu'un `Int ≥ 1` refuse : le vide pendant
 * la frappe, « 3.5 », « abc », un négatif. Écrire ça tel quel ferait rejeter
 * le patch par le schéma — donc un réglage qui ne s'enregistre pas, sans que
 * personne sache pourquoi. On refuse ICI, et le champ garde sa valeur.
 *
 * Rend `null` quand la saisie n'est pas encore un réglage valide.
 */
export function minutesDeVeilleValides(saisie: string): number | null {
  const propre = saisie.trim();
  if (propre.length === 0) return null;
  if (!/^\d+$/.test(propre)) return null;
  const minutes = Number(propre);
  if (!Number.isInteger(minutes) || minutes < 1) return null;
  return minutes;
}

/**
 * CE QUE LE DÉLAI DE VEILLE GOUVERNE — et sur quel moteur il ne fait RIEN.
 *
 * Le champ « Garder le moteur chaud » promettait : « après ce nombre de
 * minutes sans dictée, le moteur est arrêté pour libérer la mémoire ». Sur le
 * moteur LOCAL, c'est faux depuis le premier jour : `TranscriptionService`
 * construit le moteur avec `idleTimeoutOverride: Duration.infinity` (GO
 * fondateur du 29/07 — recharger sept secondes à chaque reprise coûtait le
 * premier clip), donc le faucheur n'est jamais lancé et le modèle, ~600 Mo,
 * reste en mémoire pour toujours.
 *
 * La faute d'origine est une GÉNÉRALISATION : en câblant ce champ, on a cité
 * le faucheur du sidecar (`TranscriptionService.ts:306`) pour justifier une
 * promesse faite aux DEUX moteurs. Un réglage lu par le serveur n'est pas un
 * réglage appliqué partout — il faut regarder la branche qu'on emprunte,
 * pas celle qu'on a sous les yeux.
 *
 * On ne touche pas au comportement : le choix de garder le modèle chaud est
 * une décision, pas un bug. On cesse juste de prétendre l'inverse.
 */
export function veilleGouvernee(moteur: "sidecar" | "transcribecpp"): {
  readonly actif: boolean;
  readonly description: string;
} {
  if (moteur === "transcribecpp") {
    return {
      actif: false,
      description:
        "Sans effet sur le moteur local : son modèle reste chargé volontairement, pour que la dictée suivante ne repaie pas ses ~7 s de chargement. Ce délai ne gouverne que le moteur externe.",
    };
  }
  return {
    actif: true,
    description:
      "Après ce nombre de minutes sans dictée, le moteur externe est arrêté pour libérer la mémoire — et la dictée suivante attend de nouveau son chargement. Augmentez si vous dictez par à-coups.",
  };
}
