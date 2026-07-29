import { describe, expect, it } from "vite-plus/test";

import { claudeConfigFilePath, mergeMcpServers } from "./ClaudeSharedConfig.ts";

describe("mergeMcpServers", () => {
  it("fait hériter les serveurs du compte de référence", () => {
    // Le cas vécu le 29/07 : le compte de référence porte les MCP, le compte
    // ajouté n'en a aucun — et le relais l'envoie travailler sans outils.
    expect(mergeMcpServers({ higgsfield: { url: "h" }, exa: { url: "e" } }, {})).toEqual({
      higgsfield: { url: "h" },
      exa: { url: "e" },
    });
  });

  it("laisse TOUJOURS gagner le serveur déclaré en propre", () => {
    const merged = mergeMcpServers(
      { exa: { url: "reference" }, brightdata: { url: "b" } },
      { exa: { url: "propre" } },
    );
    expect(merged).toEqual({ exa: { url: "propre" }, brightdata: { url: "b" } });
  });

  it("n'écrit RIEN quand il n'y a rien à hériter", () => {
    // Pas d'ajout = pas de réécriture du fichier de config d'un compte.
    expect(mergeMcpServers({ exa: { url: "e" } }, { exa: { url: "e" }, autre: {} })).toBeNull();
    expect(mergeMcpServers({}, { exa: {} })).toBeNull();
  });
});

describe("claudeConfigFilePath", () => {
  it("place la config à la racine du home, quel qu'il soit", () => {
    expect(claudeConfigFilePath("/Users/enzo")).toBe("/Users/enzo/.claude.json");
    expect(claudeConfigFilePath("/Users/enzo/.claude-compte-c")).toBe(
      "/Users/enzo/.claude-compte-c/.claude.json",
    );
  });
});
