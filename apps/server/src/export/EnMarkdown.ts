/**
 * EXPORTER UN FIL — en Markdown, sans rien casser ni rien laisser fuir.
 *
 * Absorption d'Hermès (`hermes_cli/session_export_md.py`), chantier n°56.
 * T3 n'avait aucun moyen de sortir une conversation : elle vivait dans la
 * base ou nulle part.
 *
 * Module PUR : il formate, il n'écrit pas et ne touche à aucun état. C'est
 * leur règle et elle est bonne — un exportateur qui peut muter la base est un
 * exportateur qu'on n'ose plus lancer.
 *
 * ── Ce qu'on ajoute à leur version, et qui n'est pas cosmétique ────────────
 *
 * Le texte passe par `caviarder` AVANT d'être écrit. Une conversation
 * contient couramment une clé collée, un jeton dans une trace, un en-tête
 * d'autorisation. Exporter sans caviarder fabrique un fichier qui voyage
 * — dans Téléchargements, en pièce jointe, sur une clé — avec les secrets
 * dedans. C'est la même règle que pour la sauvegarde (S2), appliquée au
 * seul autre endroit où l'état sort de la machine.
 */
import { caviarder } from "../secrets/Caviarder.ts";

export interface MessageAExporter {
  readonly role: string;
  readonly texte: string;
  readonly creeA: string;
}

export interface FilAExporter {
  readonly titre: string;
  readonly filId: string;
  readonly creeA: string;
  readonly messages: ReadonlyArray<MessageAExporter>;
}

/**
 * La clôture d'un bloc de code, dimensionnée sur son CONTENU.
 *
 * Un message qui contient déjà ``` casse un bloc ouvert avec ```. Le fichier
 * exporté devient alors illisible à partir de ce point — et le défaut ne se
 * voit qu'en ouvrant le rendu, jamais dans le texte source. On compte donc la
 * plus longue suite d'accents graves présente et on ouvre avec un de plus.
 */
export function clotureSuffisante(contenu: string): string {
  let plusLongue = 0;
  for (const suite of contenu.matchAll(/`+/gu)) {
    plusLongue = Math.max(plusLongue, suite[0].length);
  }
  return "`".repeat(Math.max(3, plusLongue + 1));
}

/** Le nom affiché d'un rôle, sans jargon. */
function nomDuRole(role: string): string {
  if (role === "user") return "Humain";
  if (role === "assistant") return "Agent";
  return role;
}

/**
 * Un nom de fichier sûr, tiré du titre.
 *
 * On ne fait JAMAIS confiance au titre : il vient d'un modèle et peut
 * contenir des barres obliques, des points de suite, des caractères
 * invisibles. Un nom qui contient `../` écrit ailleurs que là où on croit.
 */
export function nomDeFichier(titre: string, filId: string): string {
  const propre = titre
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .toLowerCase()
    .slice(0, 60);
  const base = propre.length > 0 ? propre : "fil";
  return `${base}-${filId.slice(0, 8)}.md`;
}

/**
 * Le fil entier en Markdown.
 *
 * L'en-tête porte de quoi RETROUVER l'original : identifiant, date, nombre de
 * messages. Un export sans provenance devient anonyme au bout d'une semaine,
 * et on ne sait plus s'il est à jour ni d'où il sort.
 */
export function enMarkdown(fil: FilAExporter): string {
  const lignes: string[] = [];

  lignes.push(`# ${caviarder(fil.titre)}`);
  lignes.push("");
  lignes.push(`> Fil \`${fil.filId}\` · créé le ${fil.creeA} · ${fil.messages.length} message(s)`);
  lignes.push(">");
  // On le DIT : un lecteur qui ignore que le texte a été caviardé prendra
  // « sk-ant***f3a9 » pour la vraie clé et cherchera pourquoi elle ne marche
  // pas.
  lignes.push("> Les secrets ont été masqués à l'export.");
  lignes.push("");

  for (const message of fil.messages) {
    const texte = caviarder(message.texte).trimEnd();
    lignes.push(`## ${nomDuRole(message.role)} — ${message.creeA}`);
    lignes.push("");
    if (texte.length === 0) {
      lignes.push("_(vide)_");
    } else {
      const cloture = clotureSuffisante(texte);
      lignes.push(cloture);
      lignes.push(texte);
      lignes.push(cloture);
    }
    lignes.push("");
  }

  return `${lignes.join("\n").trimEnd()}\n`;
}
