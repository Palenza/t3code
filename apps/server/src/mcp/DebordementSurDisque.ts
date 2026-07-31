/**
 * LE DÉBORDEMENT SUR DISQUE — le plafond cesse d'avertir et se met à agir.
 *
 * Chantier n°24b (`tools/tool_result_storage.py`, `hook_output_spill.py`),
 * maillon suivant de la chaîne A (le contexte).
 *
 * ── Ce qui n'allait pas ───────────────────────────────────────────────────
 *
 * `PLAFOND_SORTIE` existait déjà et il DISAIT le dépassement :
 *
 *     ⚠️ Sortie de N caractères, au-dessus du plafond 120 000.
 *     L'outil doit borner sa charge en amont.
 *
 * …puis laissait passer les N caractères. Un voyant, pas un garde. Or la
 * mesure du 31/07 place les résultats d'outils au PREMIER poste de dépense de
 * la fenêtre : 700 k jetons sur une session, 54 % du total.
 *
 * (Première mesure fausse, corrigée le soir même : j'avais compté les images
 * en OCTETS de transcript alors qu'une image se tokenise à la SURFACE
 * — ≈ surface/750. Surestimation d'un facteur 46 ; les 17 captures de la
 * session pèsent 32 810 jetons, pas 1,5 million. Les résultats d'outils ne
 * sont donc pas deuxièmes derrière les images : ils sont premiers, et de
 * loin.)
 *
 * ── Ce qu'on ne pouvait PAS faire ─────────────────────────────────────────
 *
 * Tronquer. La LOI l'interdit deux fois : H6 (« rien ne se jette ; la
 * troncature est une contrainte d'appel LLM, jamais de stockage ») et la
 * forme même de nos sorties — couper une sérialisation JSON en deux rend une
 * structure invalide, et l'outil sait mieux que la porte ce qu'il faut
 * sacrifier.
 *
 * ── Ce qu'on fait ─────────────────────────────────────────────────────────
 *
 * L'intégral part sur disque, le contexte reçoit une tête utile et un
 * POINTEUR. Rien n'est perdu, rien ne déborde. Le nom du fichier est une
 * empreinte du contenu : deux sorties identiques réécrivent le même fichier
 * au lieu d'en accumuler mille.
 *
 * ── Fail-soft, et c'est délibéré ──────────────────────────────────────────
 *
 * Si l'écriture échoue — disque plein, dossier interdit — on retombe sur le
 * comportement d'avant : la sortie passe entière, avec son avertissement. Une
 * porte qui fait échouer un outil parce qu'elle n'a pas su écrire un fichier
 * de confort serait pire que le trou qu'elle bouche.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  alleger,
  avecNotes,
  empreinteCourte,
  PLAFOND_SORTIE,
  serialiser,
  transformerSortie,
} from "./SortieDOutil.ts";

/** Où atterrit l'intégral. Sous le home de T3, jamais dans un dépôt de l'humain. */
export const DOSSIER_DEBORDEMENT = "sorties-outils";

const racine = Effect.fn("DebordementSurDisque.racine")(function* () {
  const path = yield* Path.Path;
  return path.join(
    process.env["HOME"] ?? process.env["USERPROFILE"] ?? ".",
    ".t3",
    DOSSIER_DEBORDEMENT,
  );
});

/**
 * LA PORTE DE SORTIE, dans sa forme complète.
 *
 * Remplace `avecNotes(transformerSortie(x))` : caviardage, puis débordement,
 * puis notes. Un seul appel pour que personne n'en oublie une moitié — c'est
 * exactement la moitié oubliée qui a laissé deux toolkits sans caviardage
 * pendant huit heures le 31/07.
 */
export const porteDeSortie = Effect.fn("porteDeSortie")(function* <
  T extends { readonly note?: string },
>(valeur: T) {
  return avecNotes(yield* passerLaPorte(valeur));
});

/**
 * Le cœur de la porte, SANS coller de note.
 *
 * Pour les sorties dont le schéma n'a pas de champ `note` — les quinze
 * poignées de `preview` rendent `null`, `void`, des objets stricts. Le
 * pointeur n'est pas perdu pour autant : `alleger` l'écrit À L'INTÉRIEUR de la
 * chaîne tronquée, donc il arrive au modèle quoi qu'il arrive. Les notes, elles,
 * sont journalisées par l'appelant.
 */
export const passerLaPorte = Effect.fn("passerLaPorte")(function* <T>(valeur: T) {
  const transformee = transformerSortie(valeur);
  const serialise = serialiser(transformee.valeur);
  if (serialise.length <= PLAFOND_SORTIE) return transformee;

  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dossier = yield* racine();
  const chemin = path.join(dossier, `${empreinteCourte(serialise)}.json`);

  const ecrit = yield* fileSystem.makeDirectory(dossier, { recursive: true }).pipe(
    Effect.andThen(() => fileSystem.writeFileString(chemin, serialise)),
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

  if (!ecrit) {
    // On DIT l'échec : sans ça, le pointeur promettrait un fichier absent, et
    // l'agent irait le lire pour rien (A7).
    return {
      ...transformee,
      notes: [
        ...transformee.notes,
        `Le débordement sur disque a échoué (${chemin} non écrit) : la sortie passe entière, ${serialise.length} caractères.`,
      ],
    };
  }

  const allegement = alleger(transformee.valeur, PLAFOND_SORTIE, chemin);
  return {
    valeur: allegement.valeur,
    notes: [
      ...transformee.notes,
      allegement.allege
        ? `Sortie de ${serialise.length} caractères, au-dessus du plafond ${PLAFOND_SORTIE} : ${allegement.retires} caractères retirés du contexte. L'INTÉGRAL est sur disque, rien n'est perdu : ${chemin}`
        : `Sortie de ${serialise.length} caractères au-dessus du plafond, mais aucun champ assez gros pour être allégé sans casser la forme. L'intégral est tout de même sur disque : ${chemin}`,
    ],
  };
});
