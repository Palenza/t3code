/**
 * LIRE UNE SKILL CANDIDATE SUR DISQUE, SANS RIEN INSTALLER.
 *
 * Chantier n°50, la moitié qui manquait au n°10. Le scanner
 * (`securite/ScanDeSkill.ts`) était complet, testé, et MUET : il décide
 * `installer | demander | refuser` à partir de fichiers déjà lus, et rien
 * dans T3 ne lui en apportait jamais. Un garde sans porte à garder.
 *
 * ── Pourquoi on s'arrête à l'inspection ──────────────────────────────────
 *
 * Installer une skill ÉCRIT dans le home Claude de l'humain — ses
 * identifiants, ses conversations, ses propres skills. C'est précisément
 * l'endroit que notre désinstalleur classe « ne se touche JAMAIS » (n°58).
 * Une écriture là-bas se décide, elle ne se glisse pas dans un outil de
 * lecture. Donc : on lit, on scanne, on DIT ce qui se passerait. La copie
 * est une seconde tranche, avec son palier.
 *
 * Et l'inspection seule vaut déjà : le cas courant n'est pas « installer sans
 * regarder », c'est « on m'a envoyé une skill, est-ce que je peux la lire
 * tranquillement ? ». Cet outil répond à ça, et c'est exactement le moment où
 * la réponse compte — avant la copie, pas après.
 *
 * ── Les bornes de lecture, et pourquoi elles sont ICI ────────────────────
 *
 * Le scanner a ses propres plafonds (50 fichiers, 1 Mo, 256 Ko par fichier)
 * et les traite comme des TROUVAILLES : « 200 fichiers » est en soi un signal.
 * Mais pour qu'il puisse le dire, il faut d'abord ne pas s'être fait avaler
 * par le dossier. On lit donc un peu au-delà de ses limites — assez pour
 * qu'il constate le dépassement, pas assez pour qu'un dossier piégé nous
 * occupe la nuit.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  MAX_FICHIER_KO,
  MAX_FICHIERS,
  type FichierDeSkill,
} from "../../../securite/ScanDeSkill.ts";

/**
 * Combien de fichiers on lit au maximum.
 *
 * `MAX_FICHIERS + 1` et pas `MAX_FICHIERS` : il faut UN fichier de trop pour
 * que le scanner puisse dire « trop de fichiers ». S'arrêter pile à la limite
 * lui ferait voir un dossier exactement conforme, et le dépassement
 * disparaîtrait en silence — une limite silencieuse est pire que pas de
 * limite (A7).
 */
const PLAFOND_DE_LECTURE = MAX_FICHIERS + 1;

/**
 * Combien d'octets on lit par fichier.
 *
 * Même raisonnement : un octet de plus que ce que le scanner tolère, pour
 * qu'il voie le dépassement. Au-delà, lire n'apprend rien de plus et coûte.
 */
const OCTETS_PAR_FICHIER = MAX_FICHIER_KO * 1024 + 1;

/** Profondeur maximale de descente. Une skill est un dossier, pas un dépôt. */
const PROFONDEUR_MAX = 4;

export interface Inspection {
  readonly fichiers: ReadonlyArray<FichierDeSkill>;
  /** Ce que la lecture elle-même a rencontré — jamais tu (H4). */
  readonly notes: ReadonlyArray<string>;
}

/**
 * Lit un dossier candidat, en largeur d'abord.
 *
 * En largeur et non en profondeur : si le plafond tombe, on veut avoir vu les
 * fichiers de la RACINE — `SKILL.md` en tête — plutôt que d'avoir épuisé le
 * budget dans un sous-dossier `node_modules` rencontré en premier.
 */
export const inspecterDossier = Effect.fn("skills.inspecterDossier")(function* (
  racine: string,
): Effect.fn.Return<Inspection, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const fichiers: FichierDeSkill[] = [];
  const notes: string[] = [];
  let aFile: ReadonlyArray<{ readonly chemin: string; readonly profondeur: number }> = [
    { chemin: racine, profondeur: 0 },
  ];

  while (aFile.length > 0 && fichiers.length < PLAFOND_DE_LECTURE) {
    const suivante: Array<{ readonly chemin: string; readonly profondeur: number }> = [];

    for (const { chemin, profondeur } of aFile) {
      if (fichiers.length >= PLAFOND_DE_LECTURE) break;

      const entrees = yield* fileSystem.readDirectory(chemin).pipe(
        Effect.orElseSucceed(() => {
          notes.push(`${path.relative(racine, chemin) || "."} n'a pas pu être lu.`);
          return [];
        }),
      );

      for (const entree of entrees) {
        if (fichiers.length >= PLAFOND_DE_LECTURE) break;
        const complet = path.join(chemin, entree);
        const info = yield* fileSystem.stat(complet).pipe(Effect.orElseSucceed(() => null));
        if (info === null) continue;

        if (info.type === "Directory") {
          if (profondeur + 1 <= PROFONDEUR_MAX) {
            suivante.push({ chemin: complet, profondeur: profondeur + 1 });
          } else {
            notes.push(
              `${path.relative(racine, complet)} est au-delà de ${String(PROFONDEUR_MAX)} niveaux : non descendu. Une skill est un dossier, pas un dépôt.`,
            );
          }
          continue;
        }

        // Un fichier illisible entre quand même dans la liste, avec un contenu
        // vide : le scanner verra son EXTENSION, et c'est souvent l'extension
        // qui parle (un `.dylib` se juge sans être lu). Le sauter le rendrait
        // invisible aux contrôles de forme.
        const contenu = yield* fileSystem
          .readFileString(complet)
          .pipe(Effect.orElseSucceed(() => ""));
        fichiers.push({
          nom: path.relative(racine, complet),
          texte: contenu.slice(0, OCTETS_PAR_FICHIER),
          octets: Number(info.size),
        });
      }
    }
    aFile = suivante;
  }

  if (fichiers.length >= PLAFOND_DE_LECTURE) {
    notes.push(
      `Lecture arrêtée à ${String(PLAFOND_DE_LECTURE)} fichiers (le scanner en tolère ${String(MAX_FICHIERS)}). Le dossier en contient davantage — c'est déjà, en soi, un signal.`,
    );
  }
  return { fichiers, notes };
});
