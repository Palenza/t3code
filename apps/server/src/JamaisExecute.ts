/**
 * LIVRÉ NE VEUT RIEN DIRE. OBSERVÉ, SI.
 *
 * Le troisième étage, et le dernier qui manquait.
 *
 *   1. un TEST prouve que le code est correct ;
 *   2. un APPELANT prouve qu'il est atteignable — c'est
 *      `modulesMuets.chaine.test.ts`, et son en-tête le dit lui-même :
 *      « un import n'est pas une exécution » ;
 *   3. rien ne prouvait qu'il ait DÉJÀ TOURNÉ.
 *
 * ── Ce qui a rendu cet étage nécessaire ──────────────────────────────────
 *
 * Le 01/08, après une campagne d'absorption : 36 lignes de catalogue
 * annoncées livrées, 7 305 tests verts, types et lint propres — et **zéro
 * appel** à un seul des outils MCP livrés. Pas « peu ». Zéro.
 *
 * La cause était banale et invisible : l'application qui tourne était un
 * paquet construit CINQ HEURES avant le premier commit. Le code existait, il
 * était juste dans un binaire que personne n'exécutait. Les deux premiers
 * étages passaient au vert sans broncher, parce qu'ils ont raison tous les
 * deux : le code est correct, et il est atteignable.
 *
 * ── Pourquoi ce module refuse de crier au loup ───────────────────────────
 *
 * « Jamais observé » a DEUX causes qui ne se ressemblent pas :
 *
 *   · la surface est morte, et c'est la trouvaille ;
 *   · on n'a rien observé du tout — projection vide, fenêtre trop courte,
 *     surface déclarée après le dernier relevé. Ce n'est alors pas un fait
 *     sur la SURFACE, c'est un fait sur NOUS (H4).
 *
 * Le module sépare les deux, et se tait quand il ne peut pas trancher. Une
 * surface déclarée APRÈS la fin des observations ne peut pas avoir été vue :
 * l'accuser serait un faux positif garanti.
 *
 * Module PUR : il constate, il ne lit ni base ni disque.
 */

/** Une surface livrée — un outil MCP, une commande, un chemin d'entrée. */
export interface Surface {
  readonly nom: string;
  /**
   * Quand elle est devenue appelable, en millisecondes epoch.
   *
   * PAS la date du commit : la date à partir de laquelle un appel aurait pu
   * l'atteindre. Pour un binaire, c'est la construction ; pour un service,
   * le démarrage. C'est cette date qui rend le verdict honnête.
   */
  readonly appelableDepuis: number;
}

/** La fenêtre réellement couverte par les observations. */
export interface Fenetre {
  readonly debut: number;
  readonly fin: number;
}

export type Verdict =
  | { readonly quoi: "observé"; readonly appels: number; readonly dernier: number }
  | { readonly quoi: "jamais-vu-assumé"; readonly pourquoi: string }
  | { readonly quoi: "JAMAIS VU"; readonly pourquoi: string; readonly depuisJours: number }
  | { readonly quoi: "trop-récent"; readonly pourquoi: string }
  | { readonly quoi: "hors-fenêtre"; readonly pourquoi: string };

export interface Ligne {
  readonly surface: string;
  readonly verdict: Verdict;
}

const JOUR = 86_400_000;

/**
 * Le délai avant qu'un silence devienne une accusation.
 *
 * Une surface appelable depuis moins d'un jour n'a rien à prouver : personne
 * n'a encore eu l'occasion de s'en servir. Au-delà, un silence total commence
 * à vouloir dire quelque chose.
 *
 * Un jour, pas une heure : la valeur est un fil-piège posé au-delà de l'usage
 * sain, pas une cible. Ce qu'on cherche à attraper — un binaire qui date de
 * cinq heures avant le code — le dépasse de très loin.
 */
export const DELAI_DE_GRACE_MS = JOUR;

/**
 * Ce qui a été livré, et ce qui a réellement tourné.
 *
 * `assumes` porte les silences ACCEPTÉS, avec leur raison. Sans lui, la seule
 * façon de faire taire le garde serait de supprimer la surface — et on
 * supprimerait alors du travail valide qui attend juste son heure.
 */
export function confronter(
  surfaces: ReadonlyArray<Surface>,
  appels: ReadonlyMap<string, { readonly compte: number; readonly dernier: number }>,
  fenetre: Fenetre | null,
  assumes: ReadonlyMap<string, string>,
): ReadonlyArray<Ligne> {
  return [...surfaces]
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .map((surface): Ligne => {
      const vu = appels.get(surface.nom);
      if (vu !== undefined && vu.compte > 0) {
        return {
          surface: surface.nom,
          verdict: { quoi: "observé", appels: vu.compte, dernier: vu.dernier },
        };
      }

      // Rien observé DU TOUT : on ne sait rien, on ne conclut rien.
      if (fenetre === null) {
        return {
          surface: surface.nom,
          verdict: {
            quoi: "hors-fenêtre",
            pourquoi:
              "aucune observation disponible. « Jamais appelé » serait une affirmation sur la surface ; la vérité est qu'on n'a rien regardé.",
          },
        };
      }

      // Déclarée APRÈS la fin des observations : l'accuser est un faux
      // positif garanti, aucun appel n'aurait pu être enregistré.
      if (surface.appelableDepuis > fenetre.fin) {
        return {
          surface: surface.nom,
          verdict: {
            quoi: "hors-fenêtre",
            pourquoi:
              "devenue appelable APRÈS la dernière observation connue. Aucun appel n'aurait pu être vu, quel que soit son usage réel.",
          },
        };
      }

      const observable = fenetre.fin - Math.max(surface.appelableDepuis, fenetre.debut);
      if (observable < DELAI_DE_GRACE_MS) {
        return {
          surface: surface.nom,
          verdict: {
            quoi: "trop-récent",
            pourquoi: `appelable depuis ${enJours(observable)} seulement, sous le délai de grâce de ${enJours(DELAI_DE_GRACE_MS)}. Attendre suffit.`,
          },
        };
      }

      const assume = assumes.get(surface.nom);
      if (assume !== undefined) {
        return { surface: surface.nom, verdict: { quoi: "jamais-vu-assumé", pourquoi: assume } };
      }

      return {
        surface: surface.nom,
        verdict: {
          quoi: "JAMAIS VU",
          // A7 : la limite, sa valeur ET l'observation.
          pourquoi: `appelable depuis ${enJours(observable)} d'observation continue, jamais appelée une seule fois. Soit elle n'est pas atteignable depuis l'application qui tourne, soit personne n'en a l'usage.`,
          depuisJours: Math.floor(observable / JOUR),
        },
      };
    });
}

const enJours = (ms: number): string => `${(ms / JOUR).toFixed(1)} j`;

/**
 * Les assomptions PÉRIMÉES : inscrites comme jamais vues, désormais observées.
 *
 * Le pendant indispensable. Une dérogation qu'on n'enlève jamais finit par
 * couvrir un vrai problème — et pire, elle raconte une histoire fausse à qui
 * la lit. Vérifié cette nuit sur le garde d'appelants : il m'a attrapé trois
 * fois avec des dérogations devenues fausses.
 */
export function assomptionsPerimees(
  lignes: ReadonlyArray<Ligne>,
  assumes: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  return lignes
    .filter((ligne) => ligne.verdict.quoi === "observé" && assumes.has(ligne.surface))
    .map((ligne) => ligne.surface);
}

/**
 * Le compte-rendu, écrit pour un agent qui doit AGIR.
 *
 * Il commence par le nombre jamais vu, parce que c'est la seule ligne qui
 * demande quelque chose. Le reste est du contexte.
 */
export function raconter(lignes: ReadonlyArray<Ligne>): string {
  const compte = (quoi: Verdict["quoi"]) => lignes.filter((l) => l.verdict.quoi === quoi).length;
  const muettes = compte("JAMAIS VU");

  if (lignes.length === 0) {
    return "Aucune surface déclarée. Rien à confronter — et rien à en conclure.";
  }
  if (muettes === 0) {
    return `${String(lignes.length)} surface(s) : ${String(compte("observé"))} observée(s), ${String(compte("jamais-vu-assumé"))} silence(s) assumé(s), ${String(compte("trop-récent"))} trop récente(s), ${String(compte("hors-fenêtre"))} hors fenêtre. Aucune surface muette sans raison.`;
  }
  return `**${String(muettes)} surface(s) LIVRÉE(S) ET JAMAIS APPELÉE(S)** sur ${String(lignes.length)}. Un test prouve que le code est correct, un appelant qu'il est atteignable — ni l'un ni l'autre ne prouve qu'il a tourné. C'est ce que cette ligne mesure.`;
}
