import { assert, describe, it } from "vite-plus/test";

import {
  construireCarte,
  extraireDefinitions,
  rendreCarte,
  resoudreImport,
} from "./repoMapCore.ts";

const F = (chemin: string, contenu: string) => ({ chemin, contenu });

describe("repo map — extraction des définitions", () => {
  it("attrape fonctions, classes, types, const et ré-exports", () => {
    const defs = extraireDefinitions(
      [
        "export function calculer(a: number) {",
        "export const SEUIL = 2;",
        "export class Moteur {",
        "export interface Verdict {",
        "export type Nature = 'a' | 'b';",
        "export { unTruc, autreTruc }",
        "const prive = 1;",
      ].join("\n"),
    );
    assert.strictEqual(defs.length, 6, "les 6 exports, jamais le privé");
    assert.ok(defs[0]?.startsWith("export function calculer"));
  });
});

describe("repo map — résolution d'imports", () => {
  const lot = new Set(["src/a/b.ts", "src/c/index.ts", "src/x/y.ts"]);
  it("résout relatif, extension implicite et index", () => {
    assert.strictEqual(resoudreImport("src/x/y.ts", "../a/b", lot), "src/a/b.ts");
    assert.strictEqual(resoudreImport("src/x/y.ts", "../c", lot), "src/c/index.ts");
  });
  it("ignore les paquets npm — la carte parle de NOTRE code", () => {
    assert.strictEqual(resoudreImport("src/x/y.ts", "effect/Effect", lot), null);
  });
});

describe("repo map — classement", () => {
  const sources = [
    F("src/noyau.ts", "export function coeur() {}"),
    F("src/a.ts", "import { coeur } from './noyau.ts';\nexport const a = 1;"),
    F("src/b.ts", "import { coeur } from './noyau.ts';\nexport const b = 1;"),
    F("src/feuille.ts", "export const feuille = 1;"),
  ];

  it("ce que tout le monde importe passe en tête", () => {
    const carte = construireCarte(sources);
    assert.strictEqual(carte[0]?.chemin, "src/noyau.ts");
    assert.strictEqual(carte[0]?.degreEntrant, 2);
  });

  it("le focus de la conversation reclasse — c'est le « personnalisé » d'aider", () => {
    const carte = construireCarte(sources, ["feuille"]);
    assert.strictEqual(carte[0]?.chemin, "src/feuille.ts", "le fichier cité bat le central");
  });
});

describe("repo map — le budget CRIE quand il coupe (A7)", () => {
  const beaucoup = Array.from({ length: 30 }, (_, i) =>
    F(`src/mod-${"x".repeat(i + 1)}.ts`, "export const valeur = 1;"),
  );

  it("sous le budget : tout passe, aucun avertissement", () => {
    const rendu = rendreCarte(construireCarte(beaucoup.slice(0, 2)), 10_000);
    assert.ok(!rendu.includes("TRONQUÉE"));
  });

  it("au-delà : la coupe nomme la limite, la demande et le nombre coupé", () => {
    const rendu = rendreCarte(construireCarte(beaucoup), 400);
    assert.ok(rendu.includes("TRONQUÉE"), "une carte amputée en silence ment (H4)");
    assert.ok(rendu.includes("budget 400"), "la limite est nommée");
    assert.ok(rendu.includes("30 fichiers classés"), "la demande est nommée");
  });
});
