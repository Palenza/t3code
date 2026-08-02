// @effect-diagnostics nodeBuiltinImport:off - Ce garde LIT les fichiers de workflow et l'arbre du dépôt : il lui faut le disque brut, pas une couche Effect.
/**
 * UN CHEMIN APPELÉ PAR UN WORKFLOW EST UN CONTRAT.
 *
 * Le 02/08, `raptor-release.yml` appelait `scripts/verifier-dmg.ts` — un
 * fichier bien réel, mais commité sur une AUTRE branche. Sur `main`, où le
 * workflow tourne, il n'existait pas. La release aurait construit le DMG
 * pendant vingt minutes, puis serait morte sur un `MODULE_NOT_FOUND`.
 *
 * C'est la pire forme d'échec : tard, cher, et pour une raison qui n'a rien à
 * voir avec ce qu'on essayait de faire. Attrapé avant le premier tir, mais
 * seulement parce que j'ai pensé à regarder — ce test remplace la vigilance.
 *
 * Il ne lit que NOS workflows (`raptor-*.yml`). Ceux de l'amont sont
 * désactivés dans ce fork et référencent leur propre outillage : les juger
 * ferait rougir ce test pour des chemins qui ne nous concernent pas.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

/** La racine, trouvée sans supposer d'où le test a été lancé. */
function racineDuDepot(): string {
  let dossier = NodePath.dirname(new URL(import.meta.url).pathname);
  for (let remontee = 0; remontee < 12; remontee += 1) {
    if (NodeFS.existsSync(NodePath.join(dossier, "pnpm-workspace.yaml"))) {
      return dossier;
    }
    const parent = NodePath.dirname(dossier);
    if (parent === dossier) break;
    dossier = parent;
  }
  throw new Error("Racine du dépôt introuvable : aucun pnpm-workspace.yaml en remontant.");
}

/** `node scripts/x.ts`, `npx tsx scripts/x.ts`, `bash scripts/x.sh`… */
const APPEL_DE_SCRIPT = /(?:node|npx tsx|tsx|bash|sh)\s+(scripts\/[\w.\-/]+\.(?:ts|mjs|js|sh))/g;

describe("les workflows de Raptor", () => {
  const racine = racineDuDepot();
  const dossierWorkflows = NodePath.join(racine, ".github/workflows");
  const nôtres = NodeFS.existsSync(dossierWorkflows)
    ? NodeFS.readdirSync(dossierWorkflows).filter(
        (nom) => nom.startsWith("raptor-") && nom.endsWith(".yml"),
      )
    : [];

  it("il y a bien des workflows à nous à vérifier", () => {
    // Sans ce garde, le test suivant passerait triomphalement sur une liste
    // vide — un vert qui ne prouve rien, et qui se cite.
    expect(
      nôtres.length,
      `Aucun workflow « raptor-*.yml » trouvé dans ${dossierWorkflows}. ` +
        `Soit ils ont été renommés, soit ce test regarde au mauvais endroit.`,
    ).toBeGreaterThan(0);
  });

  it("n'appellent que des scripts qui existent VRAIMENT sur cette branche", () => {
    const manquants: string[] = [];

    for (const nom of nôtres) {
      const contenu = NodeFS.readFileSync(NodePath.join(dossierWorkflows, nom), "utf8");
      for (const trouvaille of contenu.matchAll(APPEL_DE_SCRIPT)) {
        const chemin = trouvaille[1];
        if (chemin === undefined) continue;
        if (!NodeFS.existsSync(NodePath.join(racine, chemin))) {
          manquants.push(`${nom} → ${chemin}`);
        }
      }
    }

    expect(
      manquants,
      manquants.length === 0
        ? ""
        : `Ces workflows appellent des fichiers absents de cette branche :\n` +
            `${manquants.join("\n")}\n\n` +
            `Un workflow ne voit QUE la branche sur laquelle il tourne. Un script ` +
            `commité ailleurs n'existe pas pour lui — et l'échec arrive après le build, ` +
            `pas avant.`,
    ).toEqual([]);
  });
});
