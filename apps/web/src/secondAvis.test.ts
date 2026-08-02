// @effect-diagnostics nodeBuiltinImport:off - Le garde de câblage LIT les sources : disque brut, pas de couche Effect.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "./racineDuDepot";
import { choisirCompteDeSecondAvis, questionPourSecondAvis, titreDeSecondAvis } from "./secondAvis";

const candidat = (
  instanceId: string,
  options?: { enabled?: boolean; state?: "ok" | "cooling" | "dead" },
) => ({
  instanceId,
  enabled: options?.enabled ?? true,
  ...(options?.state ? { rotation: { state: options.state } as never } : {}),
});

describe("le choix du compte relecteur", () => {
  it("jamais le compte d'origine — le même moteur relirait son propre biais", () => {
    expect(
      choisirCompteDeSecondAvis({
        instanceActuelle: "claude-a",
        candidats: [candidat("claude-a")],
      }),
    ).toBeNull();
  });

  it("prend un autre compte sain quand il y en a un", () => {
    expect(
      choisirCompteDeSecondAvis({
        instanceActuelle: "claude-a",
        candidats: [candidat("claude-a"), candidat("claude-b"), candidat("claude-c")],
      }),
    ).toBe("claude-b");
  });

  it("un compte sain passe avant un compte en refroidissement", () => {
    expect(
      choisirCompteDeSecondAvis({
        instanceActuelle: "claude-a",
        candidats: [
          candidat("claude-a"),
          candidat("claude-b", { state: "cooling" }),
          candidat("claude-c", { state: "ok" }),
        ],
      }),
    ).toBe("claude-c");
  });

  it("un refroidissement vaut mieux que rien — mais un mort, jamais", () => {
    expect(
      choisirCompteDeSecondAvis({
        instanceActuelle: "claude-a",
        candidats: [
          candidat("claude-a"),
          candidat("claude-b", { state: "cooling" }),
          candidat("claude-c", { state: "dead" }),
        ],
      }),
    ).toBe("claude-b");
    expect(
      choisirCompteDeSecondAvis({
        instanceActuelle: "claude-a",
        candidats: [candidat("claude-a"), candidat("claude-c", { state: "dead" })],
      }),
    ).toBeNull();
  });

  it("ignore les comptes désactivés", () => {
    expect(
      choisirCompteDeSecondAvis({
        instanceActuelle: "claude-a",
        candidats: [candidat("claude-a"), candidat("claude-b", { enabled: false })],
      }),
    ).toBeNull();
  });
});

describe("la question rejouée reste VERBATIM", () => {
  it("ne retire que notre propre artefact de transport", () => {
    expect(questionPourSecondAvis("Ultrathink:\nPourquoi X ?")).toBe("Pourquoi X ?");
    // Le mot au MILIEU appartient à l'utilisateur : on n'y touche pas.
    expect(questionPourSecondAvis("Explique ultrathink et son coût")).toBe(
      "Explique ultrathink et son coût",
    );
  });
});

describe("le titre du fil", () => {
  it("reste court et reconnaissable", () => {
    expect(titreDeSecondAvis("Pourquoi le cache rate ?")).toBe(
      "Second avis — Pourquoi le cache rate ?",
    );
    const long = titreDeSecondAvis("x".repeat(200));
    expect(long.length).toBeLessThanOrEqual("Second avis — ".length + 60);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("le câblage, qui doit survivre aux fusions de l'amont", () => {
  const lire = (chemin: string) =>
    NodeFS.readFileSync(NodePath.join(racineDuDepot(), chemin), "utf8");

  it("ChatView possède encore le lanceur de second avis", () => {
    const source = lire("apps/web/src/components/ChatView.tsx");
    expect(/\bchoisirCompteDeSecondAvis\(/u.test(source)).toBe(true);
    expect(/\btitreDeSecondAvis\(/u.test(source)).toBe(true);
  });

  it("la ligne d'actions d'un message assistant porte encore le bouton", () => {
    const source = lire("apps/web/src/components/chat/MessagesTimeline.tsx");
    expect(/\bonSecondAvis\b/u.test(source)).toBe(true);
  });
});
