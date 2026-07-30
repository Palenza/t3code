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
  /** Cité par la conversation (focus) — l'ÉTAGE de tri, avant la centralité. */
  readonly cible: boolean;
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
 * L'extraction d'UN fichier, sans contexte : définitions + spécificateurs
 * d'import bruts. C'est CETTE forme que l'écorce disque met en cache par
 * mtime — quelques lignes par fichier, jamais les contenus (des mégaoctets).
 * La résolution des imports, elle, dépend du LOT (quels chemins existent) et
 * se rejoue à chaque carte.
 */
export interface ExtraitFichier {
  readonly chemin: string;
  readonly definitions: ReadonlyArray<string>;
  readonly specificateurs: ReadonlyArray<string>;
}

export function extraireFichier(chemin: string, contenu: string): ExtraitFichier {
  const specificateurs: string[] = [];
  for (const re of [RE_IMPORT, RE_IMPORT_NU]) {
    for (const m of contenu.matchAll(re)) {
      const s = m[1] ?? "";
      if (s.length > 0) specificateurs.push(s);
    }
  }
  return { chemin, definitions: extraireDefinitions(contenu), specificateurs };
}

/**
 * Construit la carte classée depuis des extraits.
 *
 * Le focus est un ÉTAGE, pas un bonus : les fichiers cités par la
 * conversation passent DEVANT, puis chacun des deux étages se classe par
 * degré entrant (ce que tout le monde importe est ce qu'il faut connaître).
 * La v1 additive (+3×) a été RÉFUTÉE par la preuve E2E sur ce dépôt même :
 * un fichier de centralité 104 écrasait tout focus — la carte répondait à
 * côté de la question posée.
 */
export function construireCarteDepuisExtraits(
  extraits: ReadonlyArray<ExtraitFichier>,
  focus: ReadonlyArray<string> = [],
): ReadonlyArray<EntreeCarte> {
  const chemins = new Set(extraits.map((e) => e.chemin));
  const degre = new Map<string, number>();
  for (const e of extraits) {
    for (const s of e.specificateurs) {
      const cible = resoudreImport(e.chemin, s, chemins);
      if (cible !== null && cible !== e.chemin) degre.set(cible, (degre.get(cible) ?? 0) + 1);
    }
  }
  const focusMin = focus.map((f) => f.toLowerCase()).filter((f) => f.length > 0);
  return extraits
    .map((e) => {
      const degreEntrant = degre.get(e.chemin) ?? 0;
      const texte = (e.chemin + "\n" + e.definitions.join("\n")).toLowerCase();
      const cible = focusMin.some((f) => texte.includes(f));
      return { chemin: e.chemin, definitions: e.definitions, degreEntrant, cible };
    })
    .filter((e) => e.definitions.length > 0 || e.degreEntrant > 0)
    .sort(
      (a, b) =>
        Number(b.cible) - Number(a.cible) ||
        b.degreEntrant - a.degreEntrant ||
        a.chemin.localeCompare(b.chemin),
    );
}

/** La même carte, depuis des sources brutes — le chemin des tests purs. */
export function construireCarte(
  sources: ReadonlyArray<SourceFichier>,
  focus: ReadonlyArray<string> = [],
): ReadonlyArray<EntreeCarte> {
  return construireCarteDepuisExtraits(
    sources.map((s) => extraireFichier(s.chemin, s.contenu)),
    focus,
  );
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
