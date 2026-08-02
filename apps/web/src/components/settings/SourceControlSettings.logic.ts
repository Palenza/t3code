/**
 * L'ÉTAT D'UNE SOURCE DE CODE, NOMMÉ — parce qu'une couleur ne se lit pas.
 *
 * Cet écran affichait un `<Switch checked={…} disabled />` par ligne. Il ne
 * réglait rien : il RAPPORTAIT une disponibilité. Un contrôle qu'on ne peut
 * pas actionner, dessiné comme un contrôle, promet un geste qui n'existe pas —
 * et sur un écran de Réglages, c'est la promesse la plus crédible qui soit.
 *
 * L'information était en plus déjà là : une pastille de couleur à côté de
 * l'icône. Mais elle était `aria-hidden`, donc muette pour un lecteur d'écran,
 * et sa couleur « warning » recouvrait DEUX situations distinctes — l'outil
 * absent de la machine, et l'outil présent mais non authentifié. Deux causes,
 * deux gestes de réparation, une seule teinte.
 *
 * On nomme donc les quatre états. La couleur reste, l'ambiguïté part.
 */

export type EtatSource =
  /** L'outil répond et l'identité est établie. */
  | "disponible"
  /** L'outil est là, mais personne n'est connecté. */
  | "non-authentifie"
  /** L'outil n'a pas été trouvé sur cette machine. */
  | "indisponible"
  /** Raptor ne sait pas encore piloter cette source. */
  | "pas-pris-en-charge";

/**
 * L'ordre des tests compte, et il va du plus général au plus fin : inutile de
 * parler d'authentification pour une source qu'on ne sait pas piloter, ni
 * d'un outil absent.
 */
export function etatDeLaSource(input: {
  readonly prisEnCharge: boolean;
  readonly disponible: boolean;
  /** `null` quand la source n'a pas de notion d'authentification (Git local). */
  readonly authentifie: boolean | null;
}): EtatSource {
  if (!input.prisEnCharge) return "pas-pris-en-charge";
  if (!input.disponible) return "indisponible";
  if (input.authentifie === false) return "non-authentifie";
  return "disponible";
}

/** Ce qu'un lecteur d'écran annonce, et ce qu'une infobulle montre. */
export function libelleEtatSource(etat: EtatSource): string {
  switch (etat) {
    case "disponible":
      return "Available";
    case "non-authentifie":
      return "Not signed in";
    case "indisponible":
      return "Not found on this machine";
    case "pas-pris-en-charge":
      return "Not supported yet";
  }
}

/**
 * La teinte de la pastille. « Non authentifié » et « indisponible » gardent la
 * même couleur d'alerte — ce sont deux ennuis de même gravité — mais ils ne
 * portent plus le même NOM, et c'est le nom qui dit quoi réparer.
 */
export function pastilleEtatSource(etat: EtatSource): string {
  switch (etat) {
    case "disponible":
      return "bg-success";
    case "non-authentifie":
    case "indisponible":
      return "bg-warning";
    case "pas-pris-en-charge":
      return "bg-muted-foreground/35";
  }
}
