/**
 * LE DOCTOR — ce qui est cassé, et le GESTE qui le répare.
 *
 * Absorption d'Hermès (`hermes_cli/doctor.py`, 2 770 lignes), chantier n°13.
 * T3 avait des diagnostics de processus et de traces ; personne ne
 * rassemblait les signaux qui mordent vraiment.
 *
 * Module PUR : on lui donne des faits déjà mesurés, il rend des constats.
 * Aucune lecture, aucun appel — donc testable de bout en bout.
 *
 * ── La règle qui distingue un doctor d'une liste de voyants ────────────────
 *
 * Un constat sans geste est un voyant : on apprend à l'ignorer. Chaque
 * constat porte donc TROIS choses (A7) : ce qui a été observé, le seuil
 * franchi, et ce qu'il faut faire. « Compte C à 100 % » ne dit rien ;
 * « compte C épuisé sur 7 jours, il ne servira plus avant le reset — bascule
 * sur B (32 %) » dit tout.
 *
 * ── Et ce qu'il ne fait JAMAIS ─────────────────────────────────────────────
 *
 * Il ne répare rien tout seul. Réauthentifier un compte, choisir de basculer,
 * relancer une migration : ce sont des gestes qui appartiennent à l'humain
 * (M2 « remontent à Enzo : argent, irréversible »). Le doctor dit, l'humain
 * décide.
 */

export type Gravite = "ok" | "attention" | "casse";

export interface Constat {
  readonly sujet: string;
  readonly gravite: Gravite;
  /** Ce qui a été OBSERVÉ — une mesure, jamais une impression. */
  readonly observe: string;
  /** Le geste. Vide seulement quand tout va bien. */
  readonly geste: string;
}

/** L'état d'un compte, tel que les stores de T3 le connaissent déjà. */
export interface CompteObserve {
  readonly nom: string;
  readonly sante: "ok" | "refroidit" | "mort";
  /** Consommation sur la fenêtre de 7 jours, en pourcentage. */
  readonly septJours: number | null;
  /** Consommation sur la fenêtre de 5 heures, en pourcentage. */
  readonly cinqHeures: number | null;
  /** `true` quand la session d'authentification a expiré. */
  readonly authExpiree: boolean;
}

/**
 * Le seuil d'alerte de consommation.
 *
 * 90 % et pas 100 % : à 100 % il est déjà trop tard, le compte a cessé de
 * servir au milieu d'un travail. À 90 % il reste de quoi finir ce qui est en
 * cours et basculer proprement. C'est un fil-piège posé AVANT la panne, pas
 * un constat de décès.
 */
export const SEUIL_QUOTA_ALERTE = 90;

export function diagnostiquerComptes(comptes: ReadonlyArray<CompteObserve>): Constat[] {
  if (comptes.length === 0) {
    return [
      {
        sujet: "comptes",
        gravite: "casse",
        observe: "aucun compte configuré",
        geste: "Ajoute une instance de fournisseur dans les Réglages.",
      },
    ];
  }

  const constats: Constat[] = [];

  for (const compte of comptes) {
    if (compte.authExpiree) {
      constats.push({
        sujet: `compte ${compte.nom}`,
        gravite: "casse",
        observe: "session d'authentification expirée",
        // Le geste appartient à l'humain : on ne peut pas se réauthentifier
        // à sa place, et prétendre le contraire ferait attendre pour rien.
        geste: `Reconnecte-le : \`claude /login\` avec son CLAUDE_CONFIG_DIR.`,
      });
      continue;
    }
    if (compte.sante === "mort") {
      constats.push({
        sujet: `compte ${compte.nom}`,
        gravite: "casse",
        observe: "sorti du pool après échecs répétés",
        geste:
          "Regarde le carnet des pannes non reconnues, puis réveille-le une fois la cause traitée.",
      });
      continue;
    }
    const pire = Math.max(compte.septJours ?? 0, compte.cinqHeures ?? 0);
    if (pire >= 100) {
      constats.push({
        sujet: `compte ${compte.nom}`,
        gravite: "casse",
        observe: `quota épuisé (${pire} %)`,
        geste: "Il ne servira plus avant son reset. Bascule sur un compte qui respire.",
      });
      continue;
    }
    if (pire >= SEUIL_QUOTA_ALERTE) {
      constats.push({
        sujet: `compte ${compte.nom}`,
        gravite: "attention",
        observe: `quota à ${pire} % (seuil ${SEUIL_QUOTA_ALERTE} %)`,
        geste: "Prévois la bascule maintenant : à 100 % il s'arrête au milieu d'un travail.",
      });
      continue;
    }
    if (compte.sante === "refroidit") {
      constats.push({
        sujet: `compte ${compte.nom}`,
        gravite: "attention",
        observe: "en refroidissement après un échec",
        geste: "Rien à faire — il revient seul. Si ça se répète, la cause est dans le carnet.",
      });
    }
  }

  // AUCUN COMPTE UTILISABLE est un constat à part : le détail par compte le
  // dit déjà en pièces détachées, mais personne ne fait l'addition en lisant
  // une liste. C'est pourtant la seule ligne qui explique pourquoi plus rien
  // ne part.
  const utilisables = comptes.filter(
    (compte) =>
      !compte.authExpiree &&
      compte.sante !== "mort" &&
      Math.max(compte.septJours ?? 0, compte.cinqHeures ?? 0) < 100,
  );
  if (utilisables.length === 0) {
    constats.unshift({
      sujet: "pool de comptes",
      gravite: "casse",
      observe: `aucun compte utilisable sur ${comptes.length}`,
      geste: "Plus rien ne peut partir. Reconnecte ou attends un reset de quota.",
    });
  }

  if (constats.length === 0) {
    constats.push({
      sujet: "comptes",
      gravite: "ok",
      observe: `${comptes.length} compte(s), tous utilisables`,
      geste: "",
    });
  }
  return constats;
}

/** L'état de l'index de rappel, tel que la base le connaît. */
export interface IndexObserve {
  readonly existe: boolean;
  readonly messagesIndexes: number;
  readonly messagesStabilises: number;
}

/**
 * L'écart toléré entre les messages stabilisés et ceux qui sont indexés.
 *
 * Zéro serait faux : entre la lecture des deux compteurs, un message peut se
 * stabiliser. On tolère donc un petit décalage, et on n'alerte que sur une
 * DÉRIVE — le signe qu'un déclencheur ne se déclenche plus.
 */
export const DERIVE_INDEX_TOLEREE = 5;

export function diagnostiquerIndex(index: IndexObserve): Constat {
  if (!index.existe) {
    return {
      sujet: "index de rappel",
      gravite: "casse",
      observe: "la table d'index n'existe pas",
      geste: "Relance le serveur pour que la migration 036 s'applique.",
    };
  }
  const manquants = index.messagesStabilises - index.messagesIndexes;
  if (manquants > DERIVE_INDEX_TOLEREE) {
    return {
      sujet: "index de rappel",
      gravite: "attention",
      observe: `${manquants} messages stabilisés absents de l'index (toléré : ${DERIVE_INDEX_TOLEREE})`,
      // Une dérive ne se répare pas en attendant : les déclencheurs ne
      // rattrapent que les écritures FUTURES.
      geste: "Les déclencheurs ne rattrapent pas le passé. Reconstruis l'index.",
    };
  }
  return {
    sujet: "index de rappel",
    gravite: "ok",
    observe: `${index.messagesIndexes} messages indexés`,
    geste: "",
  };
}

/** Une panne dont le motif n'a été reconnu par aucun classement. */
export interface PanneInconnue {
  readonly signature: string;
  readonly occurrences: number;
}

/**
 * Lit le carnet des pannes non reconnues, quelle que soit sa forme.
 *
 * Sur disque, la racine est une LISTE — pas un objet à clé `entrees`. Lire la
 * mauvaise forme ne lève rien : on obtient zéro panne, et le doctor annonce
 * « aucune » alors qu'il y en a. Un diagnostic faussement rassurant est pire
 * que pas de diagnostic, donc on accepte les deux formes plutôt que de parier
 * sur une.
 */
export function lirePannes(brut: unknown): PanneInconnue[] {
  const liste = Array.isArray(brut)
    ? brut
    : typeof brut === "object" &&
        brut !== null &&
        Array.isArray((brut as { entrees?: unknown }).entrees)
      ? (brut as { entrees: unknown[] }).entrees
      : [];
  const pannes: PanneInconnue[] = [];
  for (const entree of liste) {
    if (typeof entree !== "object" || entree === null) continue;
    const objet = entree as { signature?: unknown; occurrences?: unknown };
    if (typeof objet.signature !== "string" || objet.signature.length === 0) continue;
    pannes.push({
      signature: objet.signature,
      occurrences: typeof objet.occurrences === "number" ? objet.occurrences : 1,
    });
  }
  return pannes;
}

/**
 * Deux occurrences, et c'est un bug prioritaire — pas une fatalité.
 *
 * C'est la règle de la LOI, reprise telle quelle : « 2 occurrences = bug
 * prioritaire ». Une panne vue une fois peut être un accident ; vue deux
 * fois, c'est une classe, et une classe se mécanise.
 */
export const SEUIL_RECIDIVE = 2;

export function diagnostiquerPannes(pannes: ReadonlyArray<PanneInconnue>): Constat {
  if (pannes.length === 0) {
    return {
      sujet: "pannes non reconnues",
      gravite: "ok",
      observe: "aucune",
      geste: "",
    };
  }
  const recidives = pannes.filter((panne) => panne.occurrences >= SEUIL_RECIDIVE);
  if (recidives.length > 0) {
    return {
      sujet: "pannes non reconnues",
      gravite: "attention",
      observe: `${recidives.length} motif(s) revus au moins ${SEUIL_RECIDIVE} fois sur ${pannes.length}`,
      geste: `Ajoute le motif dans comptePool.ts — le plus fréquent : « ${recidives[0]?.signature ?? ""} ».`,
    };
  }
  return {
    sujet: "pannes non reconnues",
    gravite: "attention",
    observe: `${pannes.length} motif(s) vus une fois`,
    geste: "Rien d'urgent. Une seconde occurrence en ferait une classe à mécaniser.",
  };
}

/**
 * Le verdict d'ensemble — la gravité la plus haute l'emporte.
 *
 * On ne moyenne JAMAIS : un « cassé » noyé dans dix « ok » disparaîtrait, et
 * c'est exactement le constat qu'on avait besoin de voir.
 */
export function verdictGeneral(constats: ReadonlyArray<Constat>): Gravite {
  if (constats.some((constat) => constat.gravite === "casse")) return "casse";
  if (constats.some((constat) => constat.gravite === "attention")) return "attention";
  return "ok";
}
