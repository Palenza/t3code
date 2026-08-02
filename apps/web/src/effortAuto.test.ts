// @effect-diagnostics nodeBuiltinImport:off - Le garde de câblage LIT les sources : disque brut, pas de couche Effect.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  EFFORT_AUTO,
  SEUIL_LOURD_CARACTERES,
  SEUIL_PARAGRAPHES,
  effortInjectePourAuto,
  meriteLeBoost,
} from "./effortAuto";
import { racineDuDepot } from "./racineDuDepot";

describe("le boost ne part que quand il est mérité", () => {
  it("jamais sur un message court et plat", () => {
    expect(meriteLeBoost("renomme cette variable")).toBe(false);
    expect(meriteLeBoost("")).toBe(false);
    expect(meriteLeBoost("   ")).toBe(false);
  });

  it("part sur un message long", () => {
    expect(meriteLeBoost("x".repeat(SEUIL_LOURD_CARACTERES))).toBe(true);
    // Et la frontière tient à un caractère près — un seuil qui dérive en
    // douce est une mine.
    expect(meriteLeBoost("x".repeat(SEUIL_LOURD_CARACTERES - 1))).toBe(false);
  });

  it("part sur une structure multi-paragraphes PORTEUSE d'une question", () => {
    const paragraphes = Array.from({ length: SEUIL_PARAGRAPHES }, (_, i) => `Bloc ${i}.`).join(
      "\n\n",
    );
    expect(meriteLeBoost(`${paragraphes}\n\nQu'en penses-tu ?`)).toBe(true);
    // Sans question, une pile de paragraphes est du CONTEXTE collé, pas une
    // demande profonde.
    expect(meriteLeBoost(paragraphes)).toBe(false);
  });

  it("ne double JAMAIS un mot déjà tapé par l'humain", () => {
    expect(meriteLeBoost(`ultrathink : ${"x".repeat(900)}`)).toBe(false);
  });

  it("le seuil reste dans sa fourchette de conception", () => {
    // Un choix, pas une mesure — mais un choix BORNÉ : sous 300 il boosterait
    // des demandes banales, au-delà de 2000 il ne boosterait plus rien.
    expect(SEUIL_LOURD_CARACTERES).toBeGreaterThanOrEqual(300);
    expect(SEUIL_LOURD_CARACTERES).toBeLessThanOrEqual(2000);
  });
});

describe("l'injection ne concerne que l'effort auto, sur un modèle qui connaît le mot", () => {
  const long = "x".repeat(SEUIL_LOURD_CARACTERES);

  it("injecte ultrathink pour auto + message lourd + modèle compatible", () => {
    expect(
      effortInjectePourAuto({ effort: EFFORT_AUTO, texte: long, modeleConnaitUltrathink: true }),
    ).toBe("ultrathink");
  });

  it("n'injecte rien hors auto — les autres crans gardent leur chemin", () => {
    for (const effort of [null, undefined, "high", "max", "ultracode", "ultrathink"]) {
      expect(
        effortInjectePourAuto({ effort, texte: long, modeleConnaitUltrathink: true }),
      ).toBeNull();
    }
  });

  it("n'injecte rien sur un modèle qui ignore le mot", () => {
    // Préfixer « Ultrathink: » à un rail qui ne le connaît pas, c'est du
    // bruit dans SON prompt — et du bruit qui a l'air d'une consigne.
    expect(
      effortInjectePourAuto({ effort: EFFORT_AUTO, texte: long, modeleConnaitUltrathink: false }),
    ).toBeNull();
  });
});

describe("le câblage, qui doit survivre aux fusions de l'amont", () => {
  const lire = (chemin: string) =>
    NodeFS.readFileSync(NodePath.join(racineDuDepot(), chemin), "utf8");

  it("l'envoi passe encore par la décision d'auto-boost", () => {
    const source = lire("apps/web/src/components/ChatView.tsx");
    expect(/\beffortInjectePourAuto\(/u.test(source)).toBe(true);
  });

  it("le serveur propose encore le cran Auto, et le normalise en high", () => {
    const source = lire("apps/server/src/provider/Layers/ClaudeProvider.ts");
    expect(/\{ value: "auto", label: "Auto" \}/u.test(source)).toBe(true);
    // La normalisation existe — sinon le CLI recevrait un effort inconnu.
    expect(/effort === "auto"/u.test(source)).toBe(true);
  });

  it("« auto » ne rejoint JAMAIS promptInjectedValues", () => {
    // S'il y entrait, choisir Auto réécrirait le brouillon en préfixant le
    // mot à CHAQUE message — exactement ce que ce cran promet de ne pas faire.
    const source = lire("apps/server/src/provider/Layers/ClaudeProvider.ts");
    expect(/promptInjectedValues:[^\n]*auto/u.test(source)).toBe(false);
  });
});
