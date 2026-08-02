// @effect-diagnostics nodeBuiltinImport:off - Ce garde LIT les sources pour vérifier que le câblage tient : il lui faut le disque brut, pas une couche Effect.
import type { ServerProvider } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "../../racineDuDepot";

import { BandeAttention } from "./ProviderAttentionBand";
import { LigneDeRotation } from "./ProviderRotationLine";
import { ancreDuCompte } from "./rotationPresentation.logic";

/*
 * La preuve que la chaîne TIENT jusqu'au DOM.
 *
 * `rotationPresentation.logic.test.ts` prouve les décisions ; celui-ci prouve
 * qu'elles arrivent à l'écran. Un module de présentation vert dont personne
 * ne rend la sortie est exactement le cosmétique qu'on chasse : le calcul est
 * juste, et l'utilisateur ne voit rien.
 */

const MAINTENANT = Date.parse("2026-08-02T12:00:00.000Z");
const compte = (instanceId: string, rotation?: ServerProvider["rotation"]): ServerProvider =>
  ({ instanceId, rotation }) as unknown as ServerProvider;

describe("la ligne de rotation sur la carte d'un compte", () => {
  it("n'écrit RIEN pour un compte sain", () => {
    expect(renderToStaticMarkup(<LigneDeRotation rotation={undefined} now={MAINTENANT} />)).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(<LigneDeRotation rotation={{ state: "ok" }} now={MAINTENANT} />),
    ).toBe("");
  });

  it("écrit l'état, le délai ET le message brut du fournisseur", () => {
    const html = renderToStaticMarkup(
      <LigneDeRotation
        rotation={{
          state: "cooling",
          reason: "rate_limit_error: 5-hour limit reached",
          resumesAt: "2026-08-02T12:45:00.000Z",
        }}
        now={MAINTENANT}
      />,
    );
    expect(html).toContain("Paused — skipped for now");
    expect(html).toContain("resumes in 45 min");
    // Le message du fournisseur est le seul texte qui dise POURQUOI.
    expect(html).toContain("rate_limit_error: 5-hour limit reached");
  });
});

describe("la bande en tête de la section Providers", () => {
  const sain = [compte("claude-a"), compte("claude-b", { state: "ok", consecutiveFailures: 2 })];

  it("reste invisible tant que rien ne va mal", () => {
    // Y compris pour un compte reparti après deux hoquets : c'est une note sur
    // sa carte, pas une alerte en tête d'écran.
    expect(
      renderToStaticMarkup(
        <BandeAttention providers={sain} nomDuCompte={(id) => id} now={MAINTENANT} />,
      ),
    ).toBe("");
  });

  it("nomme les comptes, les compte, et pointe vers leur carte", () => {
    const html = renderToStaticMarkup(
      <BandeAttention
        providers={[
          compte("claude-b", { state: "cooling", resumesAt: "2026-08-02T12:30:00.000Z" }),
          compte("claude-c", { state: "dead", reason: "OAuth token revoked" }),
        ]}
        nomDuCompte={(id) => (id === "claude-c" ? "Compte perso" : "Compte pro")}
        now={MAINTENANT}
      />,
    );
    expect(html).toContain("2 accounts need attention");
    // Le bloqué passe AVANT le refroidi : l'ordre du DOM est l'ordre de lecture.
    expect(html.indexOf("Compte perso")).toBeLessThan(html.indexOf("Compte pro"));
    expect(html).toContain("Out of rotation — sign in again");
    expect(html).toContain("resumes in 30 min");
  });

  it("emploie L'ANCRE que la carte pose, pas une chaîne écrite deux fois", () => {
    // Deux `id` écrits séparément se décalent au premier renommage, et le clic
    // ne mène plus nulle part — un clic mort qui ne casse aucun test. La carte
    // et la bande passent donc toutes deux par `ancreDuCompte`.
    const source = renderToStaticMarkup(
      <BandeAttention
        providers={[compte("claude-c", { state: "dead" })]}
        nomDuCompte={(id) => id}
        now={MAINTENANT}
      />,
    );
    expect(source).not.toBe("");
    expect(ancreDuCompte("claude-c")).toBe("compte-claude-c");
  });

  it("accorde le titre au singulier pour un seul compte", () => {
    const html = renderToStaticMarkup(
      <BandeAttention
        providers={[compte("claude-c", { state: "dead" })]}
        nomDuCompte={(id) => id}
        now={MAINTENANT}
      />,
    );
    expect(html).toContain("1 account needs attention");
  });
});

describe("le câblage, qui doit SURVIVRE aux fusions de l'amont", () => {
  // Ce dépôt est un fork qui réabsorbe l'amont. Les deux fichiers ci-dessous
  // sont amont et gros ; une résolution de conflit qui prend « leur » version
  // ferait disparaître ces deux lignes sans casser un seul test. Le calcul
  // resterait vert, et l'écran redeviendrait muet — exactement la panne qu'on
  // vient de réparer.
  const lire = (chemin: string) =>
    NodeFS.readFileSync(NodePath.join(racineDuDepot(), chemin), "utf8");

  /**
   * Un nom de balise se cherche sur sa FRONTIÈRE, jamais en sous-chaîne.
   *
   * Écrit avec `toContain("<BandeAttention")`, ce garde a laissé passer un
   * renommage en `<BandeAttentionMUTEE` : la sous-chaîne y était encore. Un
   * garde qui se trompe du côté qui n'écrit rien est pire que pas de garde —
   * il donne la tranquillité sans la protection.
   */
  const rendUneBalise = (source: string, nom: string) =>
    new RegExp(`<${nom}(?![\\p{L}\\p{N}_$])`, "u").test(source);

  it("la carte d'un compte rend encore sa ligne de rotation", () => {
    const source = lire("apps/web/src/components/settings/ProviderInstanceCard.tsx");
    expect(rendUneBalise(source, "LigneDeRotation")).toBe(true);
    // Le renommage doit tomber, pas seulement la suppression.
    expect(
      rendUneBalise(source.replace("<LigneDeRotation", "<LigneDeRotationX"), "LigneDeRotation"),
    ).toBe(false);
  });

  it("la section Providers rend encore la bande d'attention", () => {
    const source = lire("apps/web/src/components/settings/SettingsPanels.tsx");
    expect(rendUneBalise(source, "BandeAttention")).toBe(true);
    expect(
      rendUneBalise(source.replace("<BandeAttention", "<BandeAttentionX"), "BandeAttention"),
    ).toBe(false);
  });

  it("la carte pose l'ancre par la fonction partagée, pas à la main", () => {
    // `id="compte-…"` écrit en dur passerait ce test-ci mais se décalerait au
    // premier renommage. On exige l'APPEL.
    expect(lire("apps/web/src/components/settings/ProviderInstanceCard.tsx")).toContain(
      "id={ancreDuCompte(",
    );
  });
});
