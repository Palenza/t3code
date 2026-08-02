// @effect-diagnostics nodeBuiltinImport:off - Le garde de câblage LIT la source de l'adaptateur : il lui faut le disque brut, pas une couche Effect.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { assert, beforeEach, describe, it } from "vite-plus/test";

import {
  SEUIL_ALERTE_PART,
  consignePourLeProchainTour,
  etatDeFalaise,
  noterCompactage,
  noterUsage,
  viderFalaises,
} from "./GardeDeFalaise.ts";

const FIL = "fil-1";

describe("la garde de falaise", () => {
  beforeEach(viderFalaises);

  it("se tait tant que le fil est loin de la falaise", () => {
    noterUsage(FIL, 100_000, 1_000_000);
    assert.strictEqual(consignePourLeProchainTour(FIL), undefined);
  });

  it("demande l'état de reprise au franchissement — puis se tait", () => {
    noterUsage(FIL, 820_000, 1_000_000);
    const consigne = consignePourLeProchainTour(FIL);
    assert.ok(consigne?.includes("82 %"), consigne);
    assert.ok(consigne?.includes("état de reprise"), consigne);

    // Le tour suivant, toujours au-dessus du seuil : une bande qui crie à
    // chaque tour, on apprend à ne plus la lire.
    noterUsage(FIL, 900_000, 1_000_000);
    assert.strictEqual(consignePourLeProchainTour(FIL), undefined);
  });

  it("se réarme quand le fil redescend sous le seuil", () => {
    noterUsage(FIL, 850_000, 1_000_000);
    assert.ok(consignePourLeProchainTour(FIL));
    // Compacté : la part retombe.
    noterUsage(FIL, 20_000, 1_000_000);
    assert.strictEqual(consignePourLeProchainTour(FIL), undefined);
    // Nouveau franchissement = nouvelle consigne.
    noterUsage(FIL, 810_000, 1_000_000);
    assert.ok(consignePourLeProchainTour(FIL));
  });

  it("après un compactage, ré-ancre UNE fois — et avant toute autre parole", () => {
    // Le cas réel : l'alerte de seuil n'a pas été consommée quand le
    // compactage tombe. Le ré-ancrage doit passer devant, et l'alerte de
    // seuil ne doit pas suivre dans le même souffle — la part est retombée.
    noterUsage(FIL, 990_000, 1_000_000);
    noterCompactage(FIL);
    noterUsage(FIL, 18_000, 1_000_000);

    const consigne = consignePourLeProchainTour(FIL);
    assert.ok(consigne?.includes("COMPACTÉ"), consigne);
    assert.ok(consigne?.includes("RELIS"), consigne);
    assert.strictEqual(consignePourLeProchainTour(FIL), undefined);
  });

  it("un compactage réarme aussi l'alerte de seuil", () => {
    noterUsage(FIL, 850_000, 1_000_000);
    assert.ok(consignePourLeProchainTour(FIL));
    noterCompactage(FIL);
    assert.ok(consignePourLeProchainTour(FIL)?.includes("COMPACTÉ"));
    // Le fil regonfle jusqu'au seuil : c'est un NOUVEAU franchissement.
    noterUsage(FIL, 830_000, 1_000_000);
    assert.ok(consignePourLeProchainTour(FIL)?.includes("83 %"));
  });

  it("ignore les relevés inutilisables plutôt que d'inventer une part", () => {
    noterUsage(FIL, 500_000, 0);
    noterUsage(FIL, Number.NaN, 1_000_000);
    assert.strictEqual(etatDeFalaise(FIL).part, null);
    assert.strictEqual(consignePourLeProchainTour(FIL), undefined);
  });

  it("chaque fil porte sa propre falaise", () => {
    noterUsage("fil-a", 850_000, 1_000_000);
    noterUsage("fil-b", 100_000, 1_000_000);
    assert.ok(consignePourLeProchainTour("fil-a"));
    assert.strictEqual(consignePourLeProchainTour("fil-b"), undefined);
  });

  it("le seuil laisse VRAIMENT plusieurs tours avant la falaise", () => {
    // Reçu (Compactage.ts) : l'auto-compactage part à la fenêtre pleine. Le
    // seuil doit laisser ~200 000 jetons de marge — pas 2 %.
    assert.ok(SEUIL_ALERTE_PART <= 0.85, String(SEUIL_ALERTE_PART));
    assert.ok(SEUIL_ALERTE_PART >= 0.6, String(SEUIL_ALERTE_PART));
  });
});

describe("le câblage, qui doit survivre aux fusions de l'amont", () => {
  // `ClaudeAdapter.ts` est un fichier amont, gros et vivant (14 commits en
  // 60 jours). Une résolution de conflit qui prend « leur » version ferait
  // disparaître trois lignes sans casser un test : la garde resterait verte
  // et muette — un module de plus construit et jamais atteint.
  const RACINE = NodePath.resolve(
    NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
    "../../../..",
  );

  it("ce test connaît encore la racine du dépôt", () => {
    assert.ok(
      NodeFS.existsSync(NodePath.join(RACINE, "pnpm-workspace.yaml")),
      `pas de pnpm-workspace.yaml sous ${RACINE} — le calcul de racine est faux`,
    );
  });

  it("l'adaptateur Claude porte les trois branchements", () => {
    const source = NodeFS.readFileSync(
      NodePath.join(RACINE, "apps/server/src/provider/Layers/ClaudeAdapter.ts"),
      "utf8",
    );
    // Frontière de jeton : un renommage doit tomber, pas seulement une
    // suppression (leçon du garde <BandeAttention, même session).
    const appelle = (nom: string) => new RegExp(`\\b${nom}\\(`, "u").test(source);
    assert.ok(appelle("noterUsage"), "noterUsage n'est plus appelé");
    assert.ok(
      appelle("consignePourLeProchainTour"),
      "consignePourLeProchainTour n'est plus appelé",
    );
    assert.ok(appelle("noterCompactage"), "noterCompactage n'est plus appelé");
    assert.ok(
      source.includes('"UserPromptSubmit"') || source.includes("UserPromptSubmit: ["),
      "le hook UserPromptSubmit a disparu",
    );
    assert.ok(source.includes("PostCompact: ["), "le hook PostCompact a disparu");
  });
});
