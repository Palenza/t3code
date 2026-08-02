import type { ServerProvider, ServerProviderRotation } from "@t3tools/contracts";

/**
 * CE QUE LA ROTATION MONTRE À L'ÉCRAN.
 *
 * Le moteur savait déjà tout — qui est écarté, pourquoi, jusqu'à quand — et
 * rien n'en sortait. La rotation automatique, qui est la raison d'être de
 * Raptor, était invisible dans ses propres réglages : un compte pouvait être
 * mis de côté depuis une heure et l'utilisateur ne voyait que « ça ne répond
 * plus ».
 *
 * Ce module ne décide rien. Il traduit un état en phrase, et il range les
 * comptes par ce qui a besoin d'attention — volé à Cursor, dont l'écran
 * « Tools & MCPs » extrait ce qui est cassé EN HAUT de page, avant la liste
 * normale.
 */

/**
 * L'ancre DOM d'une carte de compte.
 *
 * Vit ici, et non dans les deux composants, parce que la bande du haut et la
 * carte du bas doivent tomber d'accord : deux `id` écrits séparément se
 * décalent au premier renommage, et le clic ne mène plus nulle part — un clic
 * mort qui ne casse aucun test.
 */
export const ancreDuCompte = (instanceId: string): string => `compte-${instanceId}`;

export type GraviteRotation = "sain" | "attention" | "bloque";

/*
 * Les noms d'ici sont en français — c'est la langue du code de ce dépôt. Les
 * TEXTES rendus sont en anglais, parce que c'est la langue de l'interface de
 * Raptor. Un « Mis de côté un moment » au milieu de « Session · Weekly »
 * ajouterait une langue de plus à un écran qui en mélange déjà trop.
 */

/** Ce qu'on affiche pour un compte, ou `null` s'il n'y a rien à dire. */
export interface LigneRotation {
  readonly gravite: GraviteRotation;
  readonly titre: string;
  /** La raison brute du serveur, jamais reformulée. Absente si le serveur n'en donne pas. */
  readonly raison?: string;
  /** « reprend dans 12 min », calculé au moment du rendu. */
  readonly reprise?: string;
}

/**
 * Le délai restant, en clair.
 *
 * On rend `undefined` — donc rien — quand l'échéance est passée. Annoncer une
 * attente déjà terminée est un mensonge tranquille : la ligne dirait « reprend
 * dans 5 min » longtemps après la reprise.
 */
export function delaiAvantReprise(repriseA: string, maintenant: number): string | undefined {
  const reprise = Date.parse(repriseA);
  if (Number.isNaN(reprise)) return undefined;
  const restant = reprise - maintenant;
  if (restant <= 0) return undefined;

  // Arrondi vers le HAUT : qui revient à la minute annoncée doit trouver le
  // compte prêt, pas presque prêt.
  const minutes = Math.ceil(restant / 60_000);
  if (minutes < 60) return `resumes in ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `resumes in ${heures} h` : `resumes in ${heures} h ${reste} min`;
}

export function ligneDeRotation(
  rotation: ServerProviderRotation | undefined,
  maintenant: number,
): LigneRotation | null {
  if (rotation === undefined) return null;

  if (rotation.state === "dead") {
    return {
      gravite: "bloque",
      titre: "Out of rotation — sign in again",
      ...(rotation.reason === undefined ? {} : { raison: rotation.reason }),
    };
  }

  if (rotation.state === "cooling") {
    const reprise =
      rotation.resumesAt === undefined
        ? undefined
        : delaiAvantReprise(rotation.resumesAt, maintenant);
    return {
      gravite: "attention",
      titre: "Paused — skipped for now",
      ...(rotation.reason === undefined ? {} : { raison: rotation.reason }),
      ...(reprise === undefined ? {} : { reprise }),
    };
  }

  // `ok` avec des échecs comptés : le compte marche, mais il a trébuché. Le
  // taire donnerait la même image qu'un compte qui n'a jamais bronché — et
  // c'est justement la répétition qui annonce la panne suivante.
  const echecs = rotation.consecutiveFailures ?? 0;
  if (echecs > 0) {
    return {
      gravite: "sain",
      titre: echecs === 1 ? "Back after 1 failure" : `Back after ${echecs} failures`,
    };
  }

  return null;
}

/**
 * Les comptes qui ont besoin d'attention, les plus graves d'abord.
 *
 * Volé à Cursor : ce qui est cassé se lit AVANT la liste normale. Chez nous,
 * ça résout le cas le plus dur d'un coup — un compte au mur cesse d'être une
 * ligne parmi trois.
 */
export function comptesAttention(
  providers: ReadonlyArray<ServerProvider>,
  maintenant: number,
): ReadonlyArray<{ readonly provider: ServerProvider; readonly ligne: LigneRotation }> {
  const rang: Record<GraviteRotation, number> = { bloque: 0, attention: 1, sain: 2 };
  return providers
    .flatMap((provider) => {
      const ligne = ligneDeRotation(provider.rotation, maintenant);
      // Un compte « reparti après un échec » n'appelle pas d'attention : c'est
      // une note sur sa carte, pas une alerte en tête d'écran. Sans ce filtre,
      // la bande crierait pour un hoquet déjà résorbé — et une bande qui crie
      // pour rien, on apprend à ne plus la lire.
      return ligne === null || ligne.gravite === "sain" ? [] : [{ provider, ligne }];
    })
    .toSorted((a, b) => rang[a.ligne.gravite] - rang[b.ligne.gravite]);
}
