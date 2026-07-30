/**
 * LE NOYAU PUR DU REPO MAP — l'absorption du mécanisme qui a fait aider.
 *
 * Un agent démarre aveugle dans un dépôt : il greppe au hasard jusqu'à
 * trouver. La carte répond autrement : QUI définit quoi, QUI dépend de qui,
 * classé par importance et par pertinence pour la conversation — la carte,
 * jamais le dump des fichiers.
 *
 * v1 volontairement SANS tree-sitter (choix gravé dans
 * docs/CHANTIER-REPO-MAP.md) : ce dépôt est du TypeScript, un extracteur
 * d'exports/imports en TS pur capture l'essentiel. Le polyglotte attendra un
 * besoin réel — on refuse les problèmes qu'on n'a pas.
 *
 * PUR : aucune lecture disque ici. L'appelant fournit les sources ; tout ce
 * qui peut se tromper (extraction, graphe, classement, budget) se teste sur
 * des chaînes.
 */

export interface SourceFichier {
  /** Chemin relatif au dépôt, séparateur `/`. */
  readonly chemin: string;
  readonly contenu: string;
}

export interface EntreeCarte {
  readonly chemin: string;
  /** Les lignes de définition exportées, telles quelles, tronquées à 120 c. */
  readonly definitions: ReadonlyArray<string>;
  /** Combien de fichiers du lot importent celui-ci. */
  readonly degreEntrant: number;
  readonly score: number;
}

const RE_DEFINITION =
  /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm;
const RE_REEXPORT = /^export\s*\{([^}]+)\}/gm;
const RE_IMPORT = /^import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm;
const RE_IMPORT_NU = /^import\s+['"]([^'"]+)['"]/gm;

/** Extrait les lignes de définition exportées d'un fichier. */
export function extraireDefinitions(contenu: string): ReadonlyArray<string> {
  const lignes: string[] = [];
  for (const m of contenu.matchAll(RE_DEFINITION)) {
    const debut = contenu.lastIndexOf("\n", m.index) + 1;
    const fin = contenu.indexOf("\n", m.index);
    lignes.push(
      contenu
        .slice(debut, fin === -1 ? undefined : fin)
        .trim()
        .slice(0, 120),
    );
  }
  for (const m of contenu.matchAll(RE_REEXPORT)) {
    const noms = (m[1] ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && !n.startsWith("type "));
    if (noms.length > 0) lignes.push(`export { ${noms.join(", ")} }`.slice(0, 120));
  }
  return lignes;
}

/**
 * Résout un spécificateur d'import RELATIF vers un chemin du lot.
 * `../a/b` depuis `src/x/y.ts` → essaie `src/a/b.ts(x)` puis `src/a/b/index.ts(x)`.
 * Les paquets npm (non relatifs) sont ignorés : la carte parle de NOTRE code.
 */
export function resoudreImport(
  depuis: string,
  specificateur: string,
  chemins: ReadonlySet<string>,
): string | null {
  if (!specificateur.startsWith(".")) return null;
  const dossier = depuis.split("/").slice(0, -1);
  const morceaux = specificateur.split("/");
  const pile = [...dossier];
  for (const m of morceaux) {
    if (m === "." || m === "") continue;
    else if (m === "..") pile.pop();
    else pile.push(m);
  }
  const base = pile.join("/");
  const nu = base.replace(/\.(ts|tsx|js|jsx|mjs)$/u, "");
  for (const c of [base, `${nu}.ts`, `${nu}.tsx`, `${nu}/index.ts`, `${nu}/index.tsx`]) {
    if (chemins.has(c)) return c;
  }
  return null;
}

/**
 * Construit la carte classée.
 *
 * Score = degré entrant (l'importance structurelle : ce que tout le monde
 * importe est ce qu'il faut connaître) + boost ×3 si le fichier est cité par
 * la conversation (`focus` : sous-chaînes de chemins ou noms de symboles).
 * Le ×3 est un choix de départ, pas une mesure — il est ISOLÉ ici pour être
 * recalé le jour où l'usage réel donnera un reçu.
 */
export function construireCarte(
  sources: ReadonlyArray<SourceFichier>,
  focus: ReadonlyArray<string> = [],
): ReadonlyArray<EntreeCarte> {
  const chemins = new Set(sources.map((s) => s.chemin));
  const degre = new Map<string, number>();
  for (const s of sources) {
    for (const re of [RE_IMPORT, RE_IMPORT_NU]) {
      for (const m of s.contenu.matchAll(re)) {
        const cible = resoudreImport(s.chemin, m[1] ?? "", chemins);
        if (cible !== null && cible !== s.chemin) degre.set(cible, (degre.get(cible) ?? 0) + 1);
      }
    }
  }
  const focusMin = focus.map((f) => f.toLowerCase()).filter((f) => f.length > 0);
  return sources
    .map((s) => {
      const definitions = extraireDefinitions(s.contenu);
      const degreEntrant = degre.get(s.chemin) ?? 0;
      const texte = (s.chemin + "\n" + definitions.join("\n")).toLowerCase();
      const cible = focusMin.some((f) => texte.includes(f));
      return {
        chemin: s.chemin,
        definitions,
        degreEntrant,
        score: degreEntrant + (cible ? 3 * (degreEntrant + 1) : 0),
      };
    })
    .filter((e) => e.definitions.length > 0 || e.degreEntrant > 0)
    .sort((a, b) => b.score - a.score || a.chemin.localeCompare(b.chemin));
}

/**
 * Rend la carte SOUS le budget (en caractères — jetons ≈ caractères/4, dit
 * tel quel à l'appelant plutôt que déguisé en précision).
 *
 * La troncature est VISIBLE (A7) : la dernière ligne nomme la limite, la
 * demande, et ce qui a été coupé. Une carte silencieusement amputée ferait
 * croire « ce fichier n'existe pas » — exactement le mensonge H4.
 */
export function rendreCarte(carte: ReadonlyArray<EntreeCarte>, maxChars: number): string {
  const blocs: string[] = [];
  let taille = 0;
  let couverts = 0;
  for (const e of carte) {
    const bloc = `${e.chemin}${e.degreEntrant > 0 ? `  ←${e.degreEntrant}` : ""}\n${e.definitions.map((d) => `  ${d}`).join("\n")}\n`;
    if (taille + bloc.length > maxChars) break;
    blocs.push(bloc);
    taille += bloc.length;
    couverts += 1;
  }
  const coupe = carte.length - couverts;
  if (coupe > 0) {
    blocs.push(
      `\n[carte TRONQUÉE : budget ${maxChars} caractères, ${carte.length} fichiers classés, ${coupe} coupés — les moins centraux. Relancer avec un focus ou un budget plus grand.]`,
    );
  }
  return blocs.join("\n");
}
