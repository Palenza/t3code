import type { DesktopWslState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  applyWslEnableSelection,
  decrirePortee,
  decrirePortees,
  PORTEES_CONNUES,
} from "./ConnectionsSettings.logic";

const baseWslState: DesktopWslState = {
  enabled: false,
  distro: null,
  available: true,
  wslOnly: true,
  distros: [],
  preflightError: null,
};

describe("applyWslEnableSelection", () => {
  it("clears WSL-only and updates the distro before enabling both backends", async () => {
    const calls: Array<string> = [];
    let persistedWslOnly = true;
    let persistedDistro: string | null = "Ubuntu";
    const setWslDistro = vi.fn(async (distro: string | null) => {
      calls.push(`setWslDistro:${distro ?? "default"}`);
      persistedDistro = distro;
      return { ...baseWslState, distro, wslOnly: persistedWslOnly };
    });
    const setWslBackendEnabled = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslBackendEnabled:${enabled}`);
      return {
        ...baseWslState,
        enabled,
        distro: persistedDistro,
        wslOnly: persistedWslOnly,
      };
    });
    const setWslOnly = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslOnly:${enabled}`);
      persistedWslOnly = enabled;
      return { ...baseWslState, distro: persistedDistro, wslOnly: enabled };
    });

    const state = await applyWslEnableSelection({
      bridge: { setWslDistro, setWslBackendEnabled, setWslOnly },
      mode: "both",
      nextDistro: "Debian",
      persistedDistro: "Ubuntu",
    });

    expect(calls).toEqual(["setWslOnly:false", "setWslDistro:Debian", "setWslBackendEnabled:true"]);
    expect(state).toMatchObject({ enabled: true, distro: "Debian", wslOnly: false });
  });

  it("stages WSL-only before enabling without rewriting an unchanged distro", async () => {
    const calls: Array<string> = [];
    let persistedWslOnly = false;
    const setWslDistro = vi.fn(async () => baseWslState);
    const setWslOnly = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslOnly:${enabled}`);
      persistedWslOnly = enabled;
      return { ...baseWslState, wslOnly: enabled };
    });
    const setWslBackendEnabled = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslBackendEnabled:${enabled}`);
      return { ...baseWslState, enabled, wslOnly: persistedWslOnly };
    });

    const state = await applyWslEnableSelection({
      bridge: { setWslDistro, setWslBackendEnabled, setWslOnly },
      mode: "wsl-only",
      nextDistro: null,
      persistedDistro: null,
    });

    expect(calls).toEqual(["setWslOnly:true", "setWslBackendEnabled:true"]);
    expect(setWslDistro).not.toHaveBeenCalled();
    expect(state).toMatchObject({ enabled: true, wslOnly: true });
  });
});

describe("les permissions, lues en clair", () => {
  it("traduit une permission connue au lieu d'afficher son nom machine", () => {
    // Ce que l'écran montrait : « orchestration:read ». Ce qu'il montre
    // désormais : « View environment » + ce que ça autorise. Les libellés
    // existaient déjà, à trois lignes de là, pour COCHER les permissions.
    const portee = decrirePortee("orchestration:read");

    expect(portee.titre).toBe("View environment");
    expect(portee.description).toBe("Read threads, status, diffs, and configuration.");
    expect(portee.inconnue).toBe(false);
  });

  it("garde le nom BRUT d'une permission inconnue plutôt que d'en deviner le sens", () => {
    // Un serveur plus récent peut accorder une permission que ce client ignore.
    // Lui inventer une jolie phrase serait pire que de ne rien dire : ça
    // rassurerait à tort sur ce qu'on vient d'accorder.
    const portee = decrirePortee("quelquechose:denouveau");

    expect(portee.titre).toBe("quelquechose:denouveau");
    expect(portee.description).toBeNull();
    expect(portee.inconnue).toBe(true);
  });

  it("garde l'ordre reçu — on lit les permissions dans l'ordre où elles ont été accordées", () => {
    const lues = decrirePortees(["access:write", "orchestration:read"]);
    expect(lues.map((portee) => portee.scope)).toEqual(["access:write", "orchestration:read"]);
  });

  it("décrit CHAQUE permission du catalogue, sans trou", () => {
    // Le fil-piège : ajouter une permission au catalogue sans son libellé la
    // ferait passer pour « inconnue » à l'écran, alors qu'on la connaît.
    for (const entree of PORTEES_CONNUES) {
      const portee = decrirePortee(entree.scope);
      expect(portee.inconnue, `${entree.scope} n'a pas de libellé lisible`).toBe(false);
      expect(portee.titre.length).toBeGreaterThan(0);
      expect((portee.description ?? "").length).toBeGreaterThan(0);
    }
  });

  it("n'a aucun doublon de permission dans le catalogue", () => {
    // Deux entrées pour la même permission : la première gagne en silence, et
    // l'écran affiche un libellé sans qu'on sache lequel.
    const noms = PORTEES_CONNUES.map((entree) => entree.scope);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
