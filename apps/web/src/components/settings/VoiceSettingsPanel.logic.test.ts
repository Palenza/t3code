import { describe, expect, it } from "vite-plus/test";

import {
  minutesDeVeilleValides,
  modelSearchMatches,
  parseDictionaryImport,
  parseDictionaryPaste,
  resolveDisplayedModelTarget,
  resolveModelRegistry,
  selectedQuantization,
  veilleGouvernee,
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

describe("les minutes avant l'arrêt du moteur vocal", () => {
  it("accepte un entier à partir de 1", () => {
    expect(minutesDeVeilleValides("1")).toBe(1);
    expect(minutesDeVeilleValides("5")).toBe(5);
    expect(minutesDeVeilleValides("120")).toBe(120);
  });

  it("tolère les espaces autour, comme un copier-coller en produit", () => {
    expect(minutesDeVeilleValides("  7  ")).toBe(7);
  });

  it("refuse ce que le schéma refuserait — et le refuse ICI", () => {
    // Si ces valeurs partaient au serveur, le schéma (`Int >= 1`) rejetterait
    // le patch : le champ garderait la saisie, rien ne serait enregistré, et
    // personne ne saurait pourquoi. On refuse donc avant l'envoi.
    expect(minutesDeVeilleValides("0")).toBeNull();
    expect(minutesDeVeilleValides("-3")).toBeNull();
    expect(minutesDeVeilleValides("3.5")).toBeNull();
    expect(minutesDeVeilleValides("abc")).toBeNull();
    expect(minutesDeVeilleValides("5 minutes")).toBeNull();
  });

  it("refuse le champ vide, l'état normal pendant la frappe", () => {
    // Effacer pour retaper ne doit rien écrire : sinon le réglage part à
    // « vide » entre deux touches.
    expect(minutesDeVeilleValides("")).toBeNull();
    expect(minutesDeVeilleValides("   ")).toBeNull();
  });

  it("refuse les notations que Number() accepterait pourtant", () => {
    // `Number("1e3")` vaut 1000 et `Number("0x10")` vaut 16. Un parseur qui
    // se contente de Number() laisserait entrer des valeurs que personne n'a
    // voulu taper dans un champ de minutes.
    expect(minutesDeVeilleValides("1e3")).toBeNull();
    expect(minutesDeVeilleValides("0x10")).toBeNull();
    expect(minutesDeVeilleValides("+5")).toBeNull();
  });
});

/**
 * LE RÉGLAGE QUI NE FAIT RIEN — et qui le dit maintenant.
 *
 * Le champ promettait aux DEUX moteurs un arrêt après N minutes. Sur le
 * moteur local, `TranscriptionService` pose `idleTimeoutOverride:
 * Duration.infinity` : le faucheur n'est jamais lancé, le modèle (~600 Mo)
 * reste chargé pour toujours. La faute d'origine était une généralisation —
 * on avait cité le faucheur du SIDECAR pour justifier une promesse faite aux
 * deux branches.
 */
describe("le délai de veille dit sur quel moteur il agit", () => {
  it("gouverne bel et bien le moteur externe", () => {
    const vu = veilleGouvernee("sidecar");
    expect(vu.actif).toBe(true);
    expect(vu.description).toContain("moteur externe est arrêté");
  });

  it("ne PROMET plus rien sur le moteur local — et le champ y est inerte", () => {
    const vu = veilleGouvernee("transcribecpp");
    // Un champ actif sur un réglage inerte est décoratif.
    expect(vu.actif).toBe(false);
    expect(vu.description).toContain("Sans effet");
    expect(vu.description).not.toContain("est arrêté pour libérer la mémoire");
  });
});
