import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * LA LANGUE DE RAPTOR — pour ce que Raptor possède, et rien d'autre.
 *
 * Décision du 03/08 (Enzo) : la langue devient un réglage, pas un choix
 * gravé. La frontière honnête : ce module ne gouverne que les textes NÉS
 * dans le fork. Traduire l'amont (des milliers de chaînes dans des fichiers
 * que la synchro nocturne réécrit) fabriquerait un conflit quotidien — c'est
 * le modèle VS Code : le pack de langue couvre ce que l'éditeur possède, les
 * extensions restent en anglais.
 *
 * Les deux règles anti « non-sens dans une autre langue » (demande d'Enzo) :
 *   1. On ne livre que des langues qu'on sait RELIRE. FR et EN aujourd'hui ;
 *      une langue s'ajoute avec un relecteur, jamais par traduction aveugle.
 *   2. Un dictionnaire à trous est un rouge : le test exige les MÊMES clés,
 *      non vides, dans chaque langue — une UI mi-traduite est pire que pas
 *      traduite.
 *
 * `t()` lit l'état sans s'abonner : le changement de langue passe par un
 * rechargement de la fenêtre (le geste VS Code), donc aucun composant n'a
 * besoin de se re-rendre en place. C'est ce qui rend la migration d'un
 * texte : `"…"` → `t("cle")`, sans hook ni plomberie.
 */

export const LANGUES_CHOISISSABLES = ["systeme", "en", "fr"] as const;
export type LangueChoisie = (typeof LANGUES_CHOISISSABLES)[number];
export type LangueEffective = "en" | "fr";

/**
 * Le nom de chaque langue DANS SA PROPRE LANGUE.
 *
 * Un menu qui écrirait « French » à un francophone lui demande de traduire
 * pour se retrouver — c'est la convention de tous les systèmes (macOS,
 * VS Code, iOS). « Système » est la seule entrée qui suit la langue courante,
 * puisqu'elle décrit un comportement, pas une langue.
 */
export const ETIQUETTE_DE_LANGUE: Record<LangueChoisie, string> = {
  systeme: "System",
  en: "English",
  fr: "Français",
};

interface EtatLangue {
  langue: LangueChoisie;
  setLangue: (langue: LangueChoisie) => void;
}

export const useLangueStore = create<EtatLangue>()(
  persist(
    (set) => ({
      langue: "systeme",
      setLangue: (langue) => set({ langue }),
    }),
    { name: "raptor-langue" },
  ),
);

/** `systeme` suit la langue de l'OS ; tout ce qui n'est pas français rend `en`. */
export function langueEffective(
  choix: LangueChoisie,
  langueSysteme: string | undefined,
): LangueEffective {
  if (choix === "en" || choix === "fr") return choix;
  return (langueSysteme ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Chaque entrée porte TOUTES les langues — le test le garantit. */
export const DICTIONNAIRE = {
  "langue.titre": { en: "Language", fr: "Langue" },
  "langue.description": {
    en: "Applies to Raptor's own features. The rest of the app follows upstream and stays in English.",
    fr: "S'applique aux fonctionnalités propres de Raptor. Le reste de l'app suit l'amont et reste en anglais.",
  },
  "langue.systeme": { en: "System", fr: "Système" },
  "langue.redemarrage": {
    en: "The window reloads to apply the language.",
    fr: "La fenêtre se recharge pour appliquer la langue.",
  },
  "theme.sidebar.titre": { en: "Sidebar theme", fr: "Thème de la sidebar" },
  "build.commit.titre": {
    en: "The exact commit this build was produced from",
    fr: "Le commit exact à partir duquel ce build a été produit",
  },
  "tableau.acceptes": { en: "Accepted:", fr: "Acceptés :" },
  "tableau.refuses": { en: "Rejected:", fr: "Refusés :" },
  "tableau.aTrancher": { en: "Undecided:", fr: "À trancher :" },
  "tableau.nonDeploye": { en: "Not deployed", fr: "Non déployé" },
  "dictee.titre": { en: "Voice dictation", fr: "Dictée vocale" },
  "dictee.activer": { en: "Enable voice dictation", fr: "Activer la dictée vocale" },
  "dictee.langue": { en: "Dictation language", fr: "Langue de la dictée" },
  "dictee.moteur": { en: "Where dictation runs", fr: "Où tourne la dictée" },
  "dictee.arret": {
    en: "Minutes before the voice engine stops",
    fr: "Minutes avant l'arrêt du moteur vocal",
  },
  "dictee.dictionnaire.titre": {
    en: "Fix the words dictation gets wrong",
    fr: "Corriger les mots que la dictée écorche",
  },
} as const satisfies Record<string, Record<LangueEffective, string>>;

export type CleDeLangue = keyof typeof DICTIONNAIRE;

/** Le texte dans la langue courante. Pur sur ses entrées via `langueEffective`. */
export function t(cle: CleDeLangue): string {
  const effective = langueEffective(
    useLangueStore.getState().langue,
    typeof navigator === "undefined" ? undefined : navigator.language,
  );
  return DICTIONNAIRE[cle][effective];
}
