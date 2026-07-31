/**
 * LES BLUEPRINTS — une automatisation définie UNE fois, rendue partout.
 *
 * Absorption d'Hermès (`cron/blueprint_catalog.py`), chantier n°14. Leur
 * décision fondatrice, qu'on reprend telle quelle : **on ne tape jamais de
 * cron brut**. Un blueprint porte sa récurrence et ne paramètre que ce qu'un
 * humain sait dire — une heure, des jours.
 *
 * Une seule source de vérité, trois rendus :
 *
 *   · FORMULAIRE — un champ par emplacement, pour une interface
 *   · COMMANDE   — une ligne pré-remplie, pour la frappe
 *   · AMORCE     — une phrase pour l'agent, qui demandera ce qui manque
 *
 * Sans ça, la même automatisation existe en trois exemplaires qui divergent :
 * le formulaire accepte un champ que la commande ignore, l'agent en invente
 * un troisième. C'est la même maladie que les types dupliqués entre serveur
 * et interface.
 *
 * Module PUR.
 */

import { refusDeCycleDeVie } from "./GardeDeCycleDeVie.ts";

export type TypeEmplacement = "heure" | "jours" | "texte" | "nombre";

export interface Emplacement {
  readonly nom: string;
  readonly type: TypeEmplacement;
  readonly libelle: string;
  readonly defaut?: string;
  /** Un emplacement sans défaut DOIT être rempli. */
  readonly requis: boolean;
}

export interface Blueprint {
  readonly id: string;
  readonly titre: string;
  readonly aQuoiCaSert: string;
  /** La récurrence, avec `{nom}` pour les emplacements. */
  readonly recurrence: string;
  /** Ce que l'automatisation demandera à l'agent, avec `{nom}`. */
  readonly consigne: string;
  readonly emplacements: ReadonlyArray<Emplacement>;
}

/** `08:30` — vingt-quatre heures, jamais d'AM/PM. */
const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/u;

const JOURS_CONNUS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"] as const;

export interface Refus {
  readonly emplacement: string;
  /** Ce qui a été reçu, ce qui était attendu — A7. */
  readonly pourquoi: string;
}

export type Remplissage =
  | { readonly ok: true; readonly recurrence: string; readonly consigne: string }
  | { readonly ok: false; readonly refus: ReadonlyArray<Refus> };

/**
 * Valide les valeurs et rend l'automatisation prête, ou la LISTE des refus.
 *
 * On rend TOUS les refus d'un coup, jamais le premier seul : corriger un
 * champ pour découvrir le suivant, puis le suivant, est la façon la plus sûre
 * de faire abandonner quelqu'un devant un formulaire.
 */
export function remplir(
  blueprint: Blueprint,
  valeurs: Readonly<Record<string, string>>,
): Remplissage {
  const refus: Refus[] = [];
  const retenues = new Map<string, string>();

  for (const emplacement of blueprint.emplacements) {
    const brut = (valeurs[emplacement.nom] ?? emplacement.defaut ?? "").trim();

    if (brut.length === 0) {
      if (emplacement.requis) {
        refus.push({
          emplacement: emplacement.nom,
          pourquoi: `« ${emplacement.libelle} » est obligatoire et n'a pas été donné.`,
        });
      }
      retenues.set(emplacement.nom, "");
      continue;
    }

    if (emplacement.type === "heure" && !HEURE.test(brut)) {
      refus.push({
        emplacement: emplacement.nom,
        pourquoi: `« ${emplacement.libelle} » attend une heure sur 24 h au format HH:MM — reçu « ${brut} ».`,
      });
      continue;
    }

    if (emplacement.type === "jours") {
      const jours = brut
        .toLowerCase()
        .split(/[\s,]+/u)
        .filter((jour) => jour.length > 0);
      const inconnus = jours.filter(
        (jour) => !(JOURS_CONNUS as ReadonlyArray<string>).includes(jour),
      );
      if (inconnus.length > 0) {
        refus.push({
          emplacement: emplacement.nom,
          pourquoi: `« ${emplacement.libelle} » n'accepte que ${JOURS_CONNUS.join(", ")} — reçu « ${inconnus.join(", ")} ».`,
        });
        continue;
      }
      retenues.set(emplacement.nom, jours.join(","));
      continue;
    }

    if (emplacement.type === "nombre" && !/^\d+$/u.test(brut)) {
      refus.push({
        emplacement: emplacement.nom,
        pourquoi: `« ${emplacement.libelle} » attend un nombre entier — reçu « ${brut} ».`,
      });
      continue;
    }

    retenues.set(emplacement.nom, brut);
  }

  if (refus.length > 0) return { ok: false, refus };

  const substituer = (gabarit: string) =>
    gabarit.replaceAll(/\{(\w+)\}/gu, (entier, nom: string) => retenues.get(nom) ?? entier);

  const consigne = substituer(blueprint.consigne);

  // Le garde de cycle de vie s'applique APRÈS substitution : c'est la consigne
  // FINALE qui partira, et un emplacement libre peut y avoir glissé la
  // commande. Le contrôler sur le gabarit ne verrait que des accolades.
  const cycleDeVie = refusDeCycleDeVie(consigne);
  if (cycleDeVie !== null) {
    return {
      ok: false,
      refus: [{ emplacement: "consigne", pourquoi: cycleDeVie.pourquoi }],
    };
  }

  return { ok: true, recurrence: substituer(blueprint.recurrence), consigne };
}

/** Le rendu FORMULAIRE : un champ par emplacement. */
export function enFormulaire(blueprint: Blueprint): ReadonlyArray<{
  readonly nom: string;
  readonly libelle: string;
  readonly type: TypeEmplacement;
  readonly defaut: string;
  readonly requis: boolean;
  readonly aide: string;
}> {
  return blueprint.emplacements.map((emplacement) => ({
    nom: emplacement.nom,
    libelle: emplacement.libelle,
    type: emplacement.type,
    defaut: emplacement.defaut ?? "",
    requis: emplacement.requis,
    aide:
      emplacement.type === "heure"
        ? "Format 24 h, par exemple 08:30"
        : emplacement.type === "jours"
          ? `Parmi ${JOURS_CONNUS.join(", ")}, séparés par des virgules`
          : emplacement.type === "nombre"
            ? "Un nombre entier"
            : "",
  }));
}

/** Le rendu COMMANDE : une ligne pré-remplie, prête à corriger. */
export function enCommande(
  blueprint: Blueprint,
  valeurs: Readonly<Record<string, string>> = {},
): string {
  const parties = blueprint.emplacements.map((emplacement) => {
    const valeur = valeurs[emplacement.nom] ?? emplacement.defaut ?? "";
    return `--${emplacement.nom}=${valeur.includes(" ") ? `"${valeur}"` : valeur}`;
  });
  return [`/blueprint ${blueprint.id}`, ...parties].join(" ");
}

/**
 * Le rendu AMORCE : ce qu'on donne à l'agent.
 *
 * On lui dit explicitement de DEMANDER ce qui manque plutôt que d'inventer.
 * Un agent qui choisit une heure à la place de l'humain fabrique une
 * automatisation qui se déclenche au mauvais moment, et personne ne saura
 * pourquoi.
 */
export function enAmorce(blueprint: Blueprint): string {
  const manquants = blueprint.emplacements
    .filter((emplacement) => emplacement.requis && emplacement.defaut === undefined)
    .map((emplacement) => emplacement.libelle);
  const aDemander =
    manquants.length > 0
      ? ` Demande d'abord : ${manquants.join(", ")}. N'invente aucune valeur.`
      : "";
  return `Mets en place « ${blueprint.titre} » — ${blueprint.aQuoiCaSert}.${aDemander}`;
}

/**
 * Les blueprints livrés.
 *
 * Trois, tirés de ce qui mord vraiment ici : l'usine tourne sans surveillance,
 * l'état n'a jamais été sauvegardé, et les quotas se découvrent au mur.
 */
export const BLUEPRINTS: ReadonlyArray<Blueprint> = [
  {
    id: "etat-usine",
    titre: "Relever l'état de l'usine",
    aQuoiCaSert: "savoir chaque matin combien de fiches sont sorties et si une lane est muette",
    recurrence: "chaque jour à {heure}",
    consigne: "Relève l'état de l'usine et signale toute lane muette ou tout rendement en baisse.",
    emplacements: [
      { nom: "heure", type: "heure", libelle: "Heure du relevé", defaut: "08:00", requis: true },
    ],
  },
  {
    id: "sauvegarde",
    titre: "Sauvegarder l'état",
    aQuoiCaSert: "garder une copie des fils, de l'historique et des pièces jointes",
    recurrence: "chaque semaine, {jours} à {heure}",
    consigne: "Fais une sauvegarde de l'état et dis-moi sa taille et ce qui a été laissé dehors.",
    emplacements: [
      { nom: "jours", type: "jours", libelle: "Jours", defaut: "dim", requis: true },
      { nom: "heure", type: "heure", libelle: "Heure", defaut: "03:00", requis: true },
    ],
  },
  {
    id: "quotas",
    titre: "Surveiller les quotas",
    aQuoiCaSert: "être prévenu AVANT qu'un compte s'arrête au milieu d'un travail",
    recurrence: "chaque jour à {heure}",
    consigne:
      "Passe le doctor et préviens-moi si un compte dépasse {seuil} % ou si une session a expiré.",
    emplacements: [
      { nom: "heure", type: "heure", libelle: "Heure du contrôle", defaut: "09:00", requis: true },
      { nom: "seuil", type: "nombre", libelle: "Seuil d'alerte (%)", defaut: "90", requis: true },
    ],
  },
];
