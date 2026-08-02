// @effect-diagnostics nodeBuiltinImport:off - Ce repère doit lire le DISQUE BRUT : il sert aux fils-pièges, qui tournent avant toute couche Effect et n'en ont pas besoin.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * LA RACINE DU DÉPÔT, TROUVÉE SANS SUPPOSER D'OÙ ON A ÉTÉ LANCÉ.
 *
 * Les fils-pièges de ce dépôt lisent des fichiers d'AUTRES paquets — le garde
 * de marque relit `apps/desktop/src` et `scripts/`, celui des pastilles relit
 * `apps/web/src/components/chat`. Ils avaient tous le même défaut : ils
 * partaient de `process.cwd()` en supposant la racine du dépôt.
 *
 * Ça marche quand on lance `vp test apps/web/src` depuis la racine. Ça CASSE
 * sous `vp run test` — la commande canonique, celle de la CI — parce qu'elle
 * exécute chaque paquet DEPUIS SON PROPRE DOSSIER. Le chemin doublait alors :
 * `.../apps/web/apps/web/src/...`, et le test échouait en ENOENT.
 *
 * Le 02/08, trois gardes étaient dans ce cas. Ils passaient au vert dans la
 * seule façon de les lancer que j'employais, et ils auraient été ROUGES dans
 * le pipeline — un garde qu'on ne peut pas exécuter là où il compte ne garde
 * rien. `moduleSansAppelant.test.ts` faisait déjà juste, en partant de
 * `import.meta.url` : c'est ce patron-là qu'on généralise.
 *
 * Le repère est `pnpm-workspace.yaml` : il n'existe qu'à la racine d'un
 * monorepo pnpm, et il y est par construction.
 */
export function racineDuDepot(): string {
  let dossier = NodePath.dirname(new URL(import.meta.url).pathname);

  // Bornée : une remontée sans fin sur un disque inattendu tournerait jusqu'à
  // `/` sans rien dire. Douze niveaux couvrent largement un monorepo.
  for (let remontee = 0; remontee < 12; remontee += 1) {
    if (NodeFS.existsSync(NodePath.join(dossier, "pnpm-workspace.yaml"))) {
      return dossier;
    }
    const parent = NodePath.dirname(dossier);
    if (parent === dossier) {
      break;
    }
    dossier = parent;
  }

  throw new Error(
    `Racine du dépôt introuvable : aucun pnpm-workspace.yaml en remontant depuis ` +
      `${NodePath.dirname(new URL(import.meta.url).pathname)}. ` +
      `Si la structure du dépôt a changé, c'est ce repère qu'il faut mettre à jour.`,
  );
}
