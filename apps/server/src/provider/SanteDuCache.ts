/**
 * EST-CE QUE LE CACHE DE PROMPT TIENT, OU SE RECONSTRUIT À CHAQUE TOUR ?
 *
 * L'idée reprise de `t3code/local-usage-analytics` (amont), réduite à ce qui
 * PROTÈGE : détecter qu'une session paie plein tarif là où elle devrait lire
 * son cache. Pas le tableau de bord de coût entier (5 658 lignes sur un tronc
 * vieux de 212 commits) — le DÉTECTEUR, celui dont l'absence coûte cher.
 *
 * ── Le mode de panne visé, et son reçu ───────────────────────────────────
 *
 * Rétro-ingénierie du binaire, relayée sur r/ClaudeCode (999 points, 01/08) :
 * `--resume` casse le cache depuis la v2.1.69. À la reprise, la liste d'outils
 * différés + MCP + skills (~13 Ko) part à la FIN des messages au lieu du
 * début : le préfixe change, le cache entier se reconstruit, **10-20× le
 * coût**. Les deux issues amont sont closes depuis avril — mais nous serions
 * INCAPABLES de le voir, parce que l'adaptateur ADDITIONNE
 * `cache_read_input_tokens` et `cache_creation_input_tokens` en un seul nombre
 * et jette la ventilation. Les deux chiffres qui trahissent la panne sont
 * perdus avant qu'on puisse les lire.
 *
 * ── Le signal, et pourquoi il ne crie pas au loup ────────────────────────
 *
 * Un tour sain qui réutilise son contexte lit BEAUCOUP de cache et n'en crée
 * presque pas. Un tour qui reconstruit tout crée beaucoup et n'en lit rien.
 * Le signal est donc la PART de création dans l'entrée mise en cache.
 *
 * Mais un PREMIER tour crée légitimement tout son cache — l'accuser serait un
 * faux positif garanti. Le détecteur ne juge donc que les tours qui avaient
 * quelque chose à réutiliser : assez de contexte en jeu, et pas le premier.
 *
 * Module PUR : il constate sur des nombres, il ne lit ni réseau ni adaptateur.
 */

/** La ventilation des jetons d'entrée d'un tour, telle que le fournisseur la donne. */
export interface JetonsDeCache {
  /** Jetons LUS depuis le cache — gratuits, ou presque. */
  readonly cacheRead: number;
  /** Jetons ÉCRITS dans le cache — plein tarif, le préfixe reconstruit. */
  readonly cacheCreation: number;
  /** Entrée fraîche, hors cache. */
  readonly inputFrais: number;
}

export type Verdict =
  | { readonly quoi: "sain"; readonly partReutilisee: number }
  | { readonly quoi: "premier-tour"; readonly pourquoi: string }
  | { readonly quoi: "trop-petit"; readonly pourquoi: string }
  | {
      readonly quoi: "CACHE RECONSTRUIT";
      readonly partReconstruite: number;
      readonly aReutiliser: number;
      readonly reconstruit: number;
      readonly pourquoi: string;
    };

/**
 * En dessous, le tour ne brasse pas assez de contexte pour qu'un ratio veuille
 * dire quelque chose. 2 000 jetons ≈ un tour de conversation nu ; une session
 * qui devrait cacher en a bien plus. Fil-piège posé sous l'usage réel, pas
 * cible.
 */
export const CONTEXTE_MINIMUM = 2_000;

/**
 * La part de reconstruction au-delà de laquelle on parle de régression.
 *
 * 0,5 : quand plus de la moitié de l'entrée mise en cache est RÉÉCRITE alors
 * qu'un tour précédent aurait dû la laisser lisible, le cache ne tient pas.
 * Un tour sain est très en dessous — il lit ~100 % et ne réécrit qu'à la
 * marge. La valeur est large exprès : on veut la régression franche (10-20×),
 * pas une fluctuation.
 */
export const SEUIL_RECONSTRUCTION = 0.5;

/**
 * Le cache tient-il sur ce tour ?
 *
 * `estPremierTour` vient de l'appelant : un premier tour crée légitimement
 * tout son cache. Le module ne le devine pas — le deviner à partir des
 * nombres confondrait « premier tour » et « reconstruction totale », qui ont
 * exactement la même signature.
 */
export function santeDuCache(jetons: JetonsDeCache, estPremierTour: boolean): Verdict {
  const enCache = jetons.cacheRead + jetons.cacheCreation;

  if (estPremierTour) {
    return {
      quoi: "premier-tour",
      pourquoi: "un premier tour crée légitimement tout son cache — rien à réutiliser encore.",
    };
  }

  if (enCache < CONTEXTE_MINIMUM) {
    return {
      quoi: "trop-petit",
      pourquoi: `${String(enCache)} jetons en cache, sous le plancher de ${String(CONTEXTE_MINIMUM)} : trop peu pour qu'un ratio ait un sens.`,
    };
  }

  const partReconstruite = jetons.cacheCreation / enCache;
  if (partReconstruite > SEUIL_RECONSTRUCTION) {
    return {
      quoi: "CACHE RECONSTRUIT",
      partReconstruite,
      aReutiliser: jetons.cacheRead,
      reconstruit: jetons.cacheCreation,
      // A7 : la mesure, le seuil, et le geste.
      pourquoi: `${pct(partReconstruite)} du contexte mis en cache a été RÉÉCRIT (${String(jetons.cacheCreation)} créés contre ${String(jetons.cacheRead)} lus) sur un tour qui n'est pas le premier. Le préfixe de cache a changé — coût multiplié. Cause connue : une reprise (--resume) qui déplace la liste d'outils/skills en fin de messages.`,
    };
  }

  return { quoi: "sain", partReutilisee: enCache === 0 ? 0 : jetons.cacheRead / enCache };
}

const pct = (part: number): string => `${String(Math.round(part * 100))} %`;

/**
 * Lire la ventilation depuis un enregistrement de usage brut du fournisseur.
 *
 * Les noms sont ceux de l'API Anthropic (`cache_read_input_tokens`,
 * `cache_creation_input_tokens`, `input_tokens`). C'est EXACTEMENT la ventilation
 * que `claudeUsageInputTokens` additionne et jette : ici on la garde.
 *
 * `null` si l'enregistrement ne porte aucune ventilation de cache — on ne peut
 * alors rien conclure, et on ne fabrique pas de zéros trompeurs.
 */
export function lireVentilation(usage: Record<string, unknown>): JetonsDeCache | null {
  const read = entierNonNegatif(usage.cache_read_input_tokens);
  const creation = entierNonNegatif(usage.cache_creation_input_tokens);
  if (read === null && creation === null) return null;
  return {
    cacheRead: read ?? 0,
    cacheCreation: creation ?? 0,
    inputFrais: entierNonNegatif(usage.input_tokens) ?? 0,
  };
}

function entierNonNegatif(valeur: unknown): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0
    ? Math.round(valeur)
    : null;
}
