import { describe, expect, it } from "vite-plus/test";

import {
  modelSearchMatches,
  parseDictionaryImport,
  parseDictionaryPaste,
  resolveDisplayedModelTarget,
  resolveModelRegistry,
  selectedQuantization,
} from "./VoiceSettingsPanel.logic";

describe("VoiceSettingsPanel logic", () => {
  it("imports dictionary entries with defaults", () => {
    expect(
      parseDictionaryImport(
        JSON.stringify([
          {
            id: "one",
            type: "alias",
            originals: ["comply cube"],
            replacement: "ComplyQ",
          },
        ]),
      ),
    ).toEqual([
      {
        id: "one",
        type: "alias",
        originals: ["comply cube"],
        replacement: "ComplyQ",
        caseSensitive: false,
        fuzzy: false,
        enabled: true,
      },
    ]);
  });

  it("rejects aliases without replacements", () => {
    expect(() =>
      parseDictionaryImport(JSON.stringify([{ type: "alias", originals: ["missing"] }])),
    ).toThrow(/replacement/i);
  });

  it("prefers the requested quantization and searches language metadata", () => {
    const model = {
      id: "model",
      displayName: "Speech model",
      description: "Fast",
      featured: true,
      capabilities: {
        languages: ["en", "es"],
        supportsLanguageDetect: true,
        supportsInitialPrompt: false,
        supportsStreaming: false,
      },
      quantizations: [
        {
          id: "Q4",
          label: "Q4",
          downloadUrl: "https://example.com/q4",
          sha256: "q4",
          sizeBytes: 1,
          minRamMb: 1,
        },
        {
          id: "Q8_0",
          label: "Q8",
          downloadUrl: "https://example.com/q8",
          sha256: "q8",
          sizeBytes: 2,
          minRamMb: 1,
        },
      ],
    } as unknown as Parameters<typeof selectedQuantization>[0];
    expect(selectedQuantization(model, "Q4")?.id).toBe("Q4");
    expect(modelSearchMatches(model, "ES")).toBe(true);
  });

  it("uses the server selection in browsers without overriding desktop-local selection", () => {
    const serverSnapshot = {
      catalog: [],
      downloads: [],
      selected: { modelId: "server-model", quantizationId: "Q4_K_M" },
    };

    expect(
      resolveDisplayedModelTarget({
        desktopManagerAvailable: false,
        localModelId: "local-model",
        localQuantizationId: "Q8_0",
        serverSnapshot,
      }),
    ).toEqual(serverSnapshot.selected);
    expect(
      resolveDisplayedModelTarget({
        desktopManagerAvailable: true,
        localModelId: "local-model",
        localQuantizationId: "Q8_0",
        serverSnapshot,
      }),
    ).toEqual({ modelId: "local-model", quantizationId: "Q8_0" });
  });

  it("shows the server registry in Electron when inference targets the server", () => {
    expect(
      resolveModelRegistry({
        desktopManagerAvailable: true,
        inferenceMode: "server",
        serverEnabled: true,
      }),
    ).toBe("server");
    expect(
      resolveModelRegistry({
        desktopManagerAvailable: true,
        inferenceMode: "local",
        serverEnabled: true,
      }),
    ).toBe("local");
  });
});

describe("parseDictionaryPaste", () => {
  let n = 0;
  const makeId = () => `id-${++n}`;

  it("parses aliases with any separator and terms from bare words", () => {
    const { entries, rejected } = parseDictionaryPaste(
      [
        "raptore, rapetore -> Raptor",
        "fable cinq => Fable 5",
        "palennza = Palenza",
        "cécé tableau\tcc-tableau",
        "Affilizz",
        "",
      ].join("\n"),
      makeId,
    );
    expect(rejected).toEqual([]);
    expect(entries.map((entry) => [entry.type, entry.originals, entry.replacement])).toEqual([
      ["alias", ["raptore", "rapetore"], "Raptor"],
      ["alias", ["fable cinq"], "Fable 5"],
      ["alias", ["palennza"], "Palenza"],
      ["alias", ["cécé tableau"], "cc-tableau"],
      ["term", ["Affilizz"], undefined],
    ]);
    // Pasted entries exist to catch mis-heard words: fuzzy, case-insensitive.
    expect(entries.every((entry) => entry.fuzzy && !entry.caseSensitive && entry.enabled)).toBe(
      true,
    );
  });

  it("reports unusable lines verbatim instead of dropping them", () => {
    const { entries, rejected } = parseDictionaryPaste(
      "bon -> Bon\n-> sans gauche\nvide ->",
      makeId,
    );
    expect(entries).toHaveLength(1);
    expect(rejected).toEqual(["-> sans gauche", "vide ->"]);
  });
});
