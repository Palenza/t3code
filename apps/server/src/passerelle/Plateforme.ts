/**
 * AJOUTER UNE PLATEFORME SANS TOUCHER AU CŒUR.
 *
 * Chantier n°41. Les trois fondations précédentes décident : qui peut parler
 * (n°40), comment le flux tient dans le médium (n°38), quoi réessayer (n°39).
 * Aucune ne sait parler à Telegram. Ce contrat est ce qui les relie à une
 * plateforme réelle — et il est écrit pour que la QUATRIÈME plateforme coûte
 * autant que la deuxième.
 *
 * ── Ce que « sans toucher au cœur » veut dire concrètement ────────────────
 *
 * Ajouter Discord après Telegram doit être : un fichier de plus, une entrée
 * dans le registre, zéro ligne modifiée ailleurs. Si l'ajout d'une plateforme
 * demande un `if (plateforme === "discord")` quelque part dans le cœur, le
 * contrat a échoué — et il aura échoué en silence, parce que ça marche quand
 * même. Un test structurel garde ce point.
 *
 * ── Pourquoi le contrat est si PETIT ──────────────────────────────────────
 *
 * Leur `platforms/` porte des adaptateurs de plusieurs milliers de lignes.
 * L'essentiel n'y est pas : il est dans ce que chaque plateforme doit
 * RÉPONDRE aux trois décisions déjà écrites. Tout le reste — la connexion, le
 * format d'API, les particularités de chaque bot — appartient à l'adaptateur
 * et n'a aucune raison de remonter.
 *
 * Un contrat qui grossit à chaque plateforme ajoutée n'est plus un contrat,
 * c'est la somme des cas particuliers.
 */

import type { LimitesDePlateforme } from "./DebiterVersUneMessagerie.ts";
import type { Provenance } from "./QuiPeutParler.ts";

/** Un message entrant, une fois normalisé par l'adaptateur. */
export interface MessageEntrant {
  readonly provenance: Provenance;
  readonly texte: string;
  /** Le fil visé, quand la plateforme en a — Telegram a des sujets. */
  readonly fil?: string | undefined;
}

/** Ce qu'un envoi a donné. L'adaptateur ne juge pas : il rapporte. */
export type Resultat =
  | { readonly ok: true; readonly identifiantDuMessage: string }
  /**
   * L'erreur BRUTE de la plateforme, non interprétée.
   *
   * C'est délibéré : `CibleMorte.ts` sait la classer, et il le sait pour
   * TOUTES les plateformes d'un seul endroit. Un adaptateur qui classerait
   * lui-même ferait diverger les verdicts d'une plateforme à l'autre — et le
   * jour où on corrige un classement, on le corrigerait à un seul endroit sur
   * trois.
   */
  | { readonly ok: false; readonly erreur: string };

/**
 * Ce qu'une plateforme doit fournir. Rien de plus.
 *
 * Chaque membre existe parce qu'une des trois décisions en a besoin :
 * `nom` et `limites` pour le débit, `envoyer`/`editer` pour l'exécuter,
 * `lire` pour alimenter l'autorisation.
 */
export interface Plateforme {
  /** Son nom, celui qui préfixe les autorisations : `telegram:-100999`. */
  readonly nom: string;
  /** Taille max et rythme d'édition. Voir `DebiterVersUneMessagerie.ts`. */
  readonly limites: LimitesDePlateforme;
  /** Normalise un événement brut. `null` = ce n'est pas un message. */
  readonly lire: (evenementBrut: unknown) => MessageEntrant | null;
  readonly envoyer: (canal: string, texte: string, fil?: string) => Promise<Resultat>;
  /** Édite un message déjà envoyé — c'est ce qui rend le streaming visible. */
  readonly editer: (canal: string, identifiant: string, texte: string) => Promise<Resultat>;
}

/**
 * Le registre. Une plateforme s'ajoute ICI et nulle part ailleurs.
 *
 * `ReadonlyMap` et non un objet : une plateforme inconnue rend `undefined`
 * explicitement, là où un objet rendrait `undefined` sur n'importe quelle
 * faute de frappe sans qu'on distingue les deux.
 */
export type Registre = ReadonlyMap<string, Plateforme>;

export function registre(plateformes: ReadonlyArray<Plateforme>): Registre {
  const par = new Map<string, Plateforme>();
  for (const plateforme of plateformes) {
    // Un doublon est une erreur de câblage, pas un cas à arbitrer : deux
    // adaptateurs pour un même nom feraient dépendre le comportement de
    // l'ordre du tableau, et personne ne devinerait lequel répond.
    if (par.has(plateforme.nom)) {
      throw new Error(
        `Deux plateformes déclarent le nom « ${plateforme.nom} ». Le registre ne peut pas trancher, et l'ordre du tableau ne doit jamais décider — renomme l'une des deux.`,
      );
    }
    par.set(plateforme.nom, plateforme);
  }
  return par;
}

/**
 * La plateforme d'un message, ou une explication.
 *
 * On ne rend pas `undefined` en silence : un événement arrivé d'une
 * plateforme non enregistrée est un fait qu'on doit pouvoir lire dans un
 * journal, pas une branche morte (A7).
 */
export function plateformeDe(
  registreDesPlateformes: Registre,
  nom: string,
): { readonly trouvee: Plateforme } | { readonly manque: string } {
  const trouvee = registreDesPlateformes.get(nom);
  if (trouvee !== undefined) return { trouvee };
  const connues = [...registreDesPlateformes.keys()];
  return {
    manque:
      connues.length === 0
        ? `Aucune plateforme n'est enregistrée, et un événement est arrivé de « ${nom} ». La passerelle est branchée sans adaptateur.`
        : `« ${nom} » n'est pas une plateforme enregistrée. Connues : ${connues.join(", ")}.`,
  };
}
