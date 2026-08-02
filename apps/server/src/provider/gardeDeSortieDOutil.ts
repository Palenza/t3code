/**
 * LA PORTE DE SORTIE, ÉTENDUE AUX OUTILS QU'ON NE POSSÈDE PAS.
 *
 * Chantier n°71. Le trou qu'il ferme a été trouvé le 01/08 en instruisant
 * leurs hooks de plugin, et il était béant.
 *
 * ── Le trou ───────────────────────────────────────────────────────────────
 *
 * `mcp/SortieDOutil.ts` s'appelle « PORTE OBLIGATOIRE ». Son en-tête dit
 * qu'une transformation qu'on peut oublier de brancher finit par être
 * oubliée, et un test structurel vérifie que nos six toolkits la traversent
 * tous.
 *
 * Sauf qu'elle ne gardait que NOS 23 outils MCP. Les outils du SDK — `Bash`,
 * `Read`, `Grep`, `WebFetch`, `Glob` — rendent leur sortie au modèle sans
 * jamais la croiser. Ce sont pourtant EUX qui rapportent le plus de contenu
 * tiers : un `.env` lu par mégarde, un jeton dans une sortie de `curl`, une
 * page web récupérée par `WebFetch`. La porte gardait la petite moitié du
 * trafic.
 *
 * ── Pourquoi c'est branchable sans rien casser ────────────────────────────
 *
 * Parce que `transformerSortie` NE TRONQUE PAS. Elle fait trois choses :
 * caviarder les chaînes en gardant la structure (mêmes clés, même forme),
 * scanner le contenu tiers, et SIGNALER un dépassement de poids sans jamais
 * couper. J'avais d'abord écarté le branchement en croyant qu'elle
 * tronquerait un `Read` de gros fichier — relecture faite, elle ne coupe
 * rien : « couper au milieu d'un JSON rendrait une structure invalide ».
 *
 * Le modèle reçoit donc exactement le même objet, avec les mêmes clés et la
 * même taille — seuls les secrets sont remplacés.
 *
 * ── Où vont les notes ─────────────────────────────────────────────────────
 *
 * Le scan de menaces produit un avertissement, et le SDK a le bon canal :
 * `additionalContext`, ajouté au contexte du modèle À CÔTÉ du résultat. On ne
 * le glisse pas DANS la sortie de l'outil — ça mélangerait notre voix avec
 * celle de l'outil, et un `Read` rendrait un fichier qui ne ressemble plus à
 * ce qu'il y a sur le disque.
 *
 * ── Ce qu'il ne fait pas, volontairement ──────────────────────────────────
 *
 * Il ne BLOQUE rien. Un résultat d'outil n'est pas un endroit où l'humain
 * peut arbitrer, et bloquer y ferait perdre des sorties légitimes — un billet
 * de sécurité parle d'injections, une issue GitHub cite une CVE. On constate,
 * on caviarde, on prévient.
 *
 * Et il ne DÉBORDE pas sur disque : `porteDeSortie` le fait pour nos outils
 * MCP parce qu'on maîtrise leur schéma de retour. Ici on ne le maîtrise pas,
 * et remplacer une sortie par un pointeur casserait l'outil.
 */

import { transformerSortie } from "../mcp/SortieDOutil.ts";

/** Ce que le SDK attend d'un rappel `PostToolUse`. */
export interface SortieDeHook {
  readonly hookSpecificOutput: {
    readonly hookEventName: "PostToolUse";
    /** Remplace la sortie de l'outil AVANT qu'elle parte au modèle. */
    readonly updatedToolOutput?: unknown;
    /** Ajouté au contexte À CÔTÉ du résultat, jamais dedans. */
    readonly additionalContext?: string;
  };
}

/**
 * Le verdict sur une sortie d'outil.
 *
 * Rend `null` quand il n'y a RIEN à changer — et c'est le cas de l'écrasante
 * majorité. Un rappel qui renvoie toujours un objet ferait recopier chaque
 * sortie sans raison ; rendre `null` laisse le SDK garder l'originale, à
 * l'octet près.
 */
/**
 * LES OUTILS QUI LISENT LE DISQUE LOCAL — on les SCANNE, on ne les RÉÉCRIT pas.
 *
 * Décision du 03/08, et c'est la moitié la plus importante du correctif.
 * Ce garde a été écrit pour les JOURNAUX : empêcher un secret d'atteindre une
 * trace, un export, une sortie qui part chez un tiers. On l'avait branché sur
 * TOUT ce qu'un agent reçoit, y compris la lecture de ses propres fichiers.
 *
 * Or caviarder un fichier local ne protège de RIEN : le secret est déjà sur la
 * machine où l'agent tourne, et il peut le relire autrement. En échange, ça
 * abîme la matière sur laquelle il travaille — mesuré : 800 fichiers du dépôt
 * altérés sur 15 255, 459 lignes perdues, sans qu'aucun ne contienne le moindre
 * secret. Un agent recevait du code dont les numéros de ligne ne collaient plus
 * au disque.
 *
 * Aucune expression régulière, si fine soit-elle, ne répare ça : c'est
 * l'ENDROIT qui était faux. Le scan de menaces, lui, reste actif sur tous les
 * outils — il ne modifie rien, il alerte.
 */
const OUTILS_DE_LECTURE_LOCALE = new Set(["Read", "Grep", "Glob", "NotebookRead"]);

export function garderLaSortie(sortie: unknown, nomDOutil?: string): SortieDeHook | null {
  const transformee = transformerSortie(sortie);

  // On se fie aux NOTES, pas à une comparaison de valeurs : `transformerSortie`
  // reconstruit les objets qu'elle parcourt, donc `!==` serait vrai même quand
  // rien n'a changé — et on remplacerait chaque sortie d'outil du produit pour
  // rien.
  const aCaviarde = transformee.notes.some((note) => note.includes("caviardé"));

  // SEULE l'alerte de contenu tiers passe. L'autre note de la porte annonce un
  // dépassement du plafond de 40 000 — c'est NOTRE budget de sortie MCP, une
  // règle qu'on s'est donnée pour des outils qu'on écrit. La servir sur un
  // `Read` de gros fichier reviendrait à reprocher à l'outil de faire son
  // travail, et à apprendre au modèle à ignorer nos avertissements.
  const alertes = transformee.notes.filter((note) => note.includes("CONTENU TIERS SUSPECT"));

  // Rien de caviardé et rien à dire : on ne touche pas, et le SDK garde
  // l'originale à l'octet près.
  // La lecture d'un fichier LOCAL n'est jamais réécrite : on garde l'alerte,
  // on rend l'original à l'octet près.
  const reecritureAutorisee = nomDOutil === undefined || !OUTILS_DE_LECTURE_LOCALE.has(nomDOutil);
  const reecrit = aCaviarde && reecritureAutorisee;

  if (!reecrit && alertes.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      ...(reecrit ? { updatedToolOutput: transformee.valeur } : {}),
      ...(alertes.length > 0 ? { additionalContext: alertes.join(" ") } : {}),
    },
  };
}
