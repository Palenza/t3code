/**
 * LES NORMES D'UNE SKILL — un prompt est un espoir, un contrôle est un fait.
 *
 * Chantier n°4, chaîne B. Aspiré de `agent/learn_prompt.py` d'Hermès, dont le
 * `_AUTHORING_STANDARDS` est une vraie grille de mainteneur.
 *
 * ── L'écart de forme, et pourquoi il vaut mieux ───────────────────────────
 *
 * Chez eux, ces normes vivent dans un PROMPT : on demande au modèle de les
 * suivre. Ça marche souvent. Chez nous elles vivent dans un CONTRÔLE : on
 * vérifie qu'elles sont suivies. La différence se voit le jour où le modèle
 * fatigue — et elle se voit aussi sur les skills qu'on a DÉJÀ écrites, que
 * nul prompt ne peut plus corriger.
 *
 * ── Ce qu'on prend tel quel ───────────────────────────────────────────────
 *
 * - un nom en minuscules-avec-tirets, sans espace ;
 * - une description d'UNE phrase qui dit la CAPACITÉ, pas l'implémentation ;
 * - pas de mots de vitrine (« puissant », « complet », « avancé »…) ;
 * - la description ne répète pas le nom ;
 * - l'auteur ne vient JAMAIS de l'environnement — nom de session, config git,
 *   n'importe quelle identité qu'on peut sonder. Une skill se partage : un
 *   nom pris à la machine est une fuite que personne n'a acceptée ;
 * - on ne référence que des outils qui EXISTENT, jamais leurs équivalents
 *   shell — c'est ce qui fait une skill plutôt qu'une page de documentation ;
 * - ~100 lignes pour une skill simple, ~200 pour une complexe. Les gros
 *   scripts vont dans `scripts/`, pas dans le corps.
 *
 * ── Ce qu'on ADAPTE, et pourquoi ──────────────────────────────────────────
 *
 * Leur règle des « 60 caractères maximum » vient de LEUR troncature : leur
 * index de skills coupe à 60 et charge tout à chaque session, donc au-delà
 * c'est silencieusement perdu. **T3 ne tronque pas** — vérifié, aucun
 * `slice(0, 60)` nulle part. Recopier leur nombre serait recopier la
 * contrainte de quelqu'un d'autre.
 *
 * Ce qui reste vrai chez nous, c'est le COÛT. Mesuré le 31/07 sur les 18
 * skills réelles : **8 000 caractères de description chargés à chaque
 * session**, moyenne 444, la plus longue 895. Une description de 895
 * caractères ne route pas mieux qu'une de 120 — elle coûte juste sept fois
 * plus, à chaque démarrage, pour toujours.
 *
 * D'où notre seuil : **240 caractères**, soit quatre fois leur limite et deux
 * fois notre pire cas raisonnable. C'est un fil-piège, pas un gabarit — il ne
 * touche que ce qui a dérapé.
 *
 * Module PUR.
 */

export type GraviteDeNorme = "erreur" | "avertissement";

export interface Manquement {
  readonly regle: string;
  readonly gravite: GraviteDeNorme;
  /** Nommé pour un AGENT (A7) : ce qui ne va pas ET quoi faire. */
  readonly quoiFaire: string;
}

/**
 * Le fil-piège de description.
 *
 * REÇU (31/07, sur les 18 skills réelles de Palenza) : 8 000 caractères
 * chargés par session, moyenne 444, max 895. À 240, on ne touche que ce qui a
 * vraiment dérapé — et on économise ~1 400 jetons par démarrage.
 */
export const MAX_DESCRIPTION = 240;

/** Une skill simple ~100 lignes, une complexe ~200. Au-delà, c'est un projet. */
export const MAX_LIGNES = 400;

/**
 * Une frontière de mot qui connaît les ACCENTS.
 *
 * `\b` en JavaScript s'appuie sur `[A-Za-z0-9_]` : un « é » n'y est pas un
 * caractère de mot, donc `\bavancé\b` ne matche JAMAIS — la frontière finale
 * ne se produit pas. Trouvé par son test.
 *
 * C'est la même famille que l'apostrophe française qui a mordu deux fois le
 * 31/07 : les outils anglophones traitent notre alphabet comme de la
 * ponctuation. On borne donc sur les LETTRES au sens Unicode.
 */
const motEntier = (mot: string): RegExp => new RegExp(`(?<!\\p{L})${mot}(?!\\p{L})`, "iu");

/** Mots de vitrine : ils occupent de la place sans rien dire. */
const MOTS_DE_VITRINE = [
  "puissant",
  "complet",
  "avancé",
  "robuste",
  "révolutionnaire",
  "ultime",
  "incontournable",
  "powerful",
  "comprehensive",
  "seamless",
  "advanced",
  "robust",
];

/**
 * Les outils que l'agent A. Une skill qui nomme `cat` au lieu de `Read` décrit
 * un shell, pas un agent — et l'agent ne saura pas qu'elle lui parle.
 *
 * Adapté : chez eux c'est `read_file`/`terminal`/`web_extract` ; chez nous ce
 * sont les outils de Claude Code.
 */
const REMPLACEMENTS: ReadonlyArray<{ readonly shell: RegExp; readonly outil: string }> = [
  { shell: /\b(cat|head|tail)\s+[^\s|]+\.(ts|tsx|md|json|py|sh)\b/u, outil: "Read" },
  // Seulement les drapeaux que l'outil `Grep` REMPLACE vraiment. Une première
  // version mordait sur n'importe quel `grep -`, donc sur ma propre skill
  // `chaines` qui prescrit `grep -rL` — un drapeau que `Grep` ne sait pas
  // faire. Un contrôle qui interdit ce qu'il ne remplace pas est un contrôle
  // faux.
  { shell: /\b(grep|rg|ripgrep|ack)\s+-[rin]{1,3}\s/u, outil: "Grep" },
  { shell: /\b(sed|awk)\s+-i\b/u, outil: "Edit" },
  { shell: /\bfind\s+\.\s+-name\b/u, outil: "Glob" },
  { shell: /\bcurl\s+-[sS]?[Ll]?\s+https?:\/\//u, outil: "WebFetch" },
];

interface Frontmatter {
  readonly nom: string | null;
  readonly description: string | null;
  readonly auteur: string | null;
}

/**
 * Lit le frontmatter, SCALAIRES REPLIÉS COMPRIS.
 *
 * `description: >` puis des lignes indentées est du YAML parfaitement
 * légitime, et trois de nos skills l'utilisent. Une première version lisait la
 * ligne seule et trouvait « > » — une description d'UN caractère, donc une
 * skill qui semble ne jamais router. Le contrôle accusait la skill alors que
 * le bug était chez lui.
 *
 * Le vrai découvreur de T3 (`ClaudeSkills.ts`) passe par la bibliothèque
 * `yaml` et n'a pas ce défaut. Ici on reste sans dépendance — on ne décode que
 * les trois champs qu'on contrôle — mais on gère les deux formes de bloc.
 */
export function lireFrontmatter(texte: string): Frontmatter {
  const bloc = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(texte);
  if (bloc === null) return { nom: null, description: null, auteur: null };
  const lignes = (bloc[1] ?? "").split(/\r?\n/u);

  const champ = (cle: string): string | null => {
    const debut = lignes.findIndex((l) => new RegExp(`^${cle}\\s*:`, "u").test(l));
    if (debut === -1) return null;
    const apres = (lignes[debut] ?? "").replace(new RegExp(`^${cle}\\s*:\\s*`, "u"), "").trim();
    // Forme simple : la valeur est sur la ligne.
    if (apres !== ">" && apres !== "|" && apres !== ">-" && apres !== "|-") {
      return apres.length === 0 ? null : apres.replace(/^["']|["']$/gu, "");
    }
    // Scalaire replié : on prend les lignes INDENTÉES qui suivent.
    const suite: string[] = [];
    for (const l of lignes.slice(debut + 1)) {
      if (l.trim().length === 0) continue;
      if (!/^\s/u.test(l)) break;
      suite.push(l.trim());
    }
    return suite.length === 0 ? null : suite.join(" ");
  };

  return { nom: champ("name"), description: champ("description"), auteur: champ("author") };
}

/**
 * Contrôle une skill contre les normes.
 *
 * Rend les manquements, jamais un verdict binaire : une skill qui rate deux
 * règles n'est pas « invalide », elle est perfectible — et un contrôle qui
 * refuse tout est un contrôle qu'on débranche.
 */
export function controlerSkill(input: {
  readonly texte: string;
  readonly identiteDeLaMachine?: ReadonlyArray<string>;
}): ReadonlyArray<Manquement> {
  const manquements: Manquement[] = [];
  const dire = (regle: string, gravite: GraviteDeNorme, quoiFaire: string) =>
    manquements.push({ regle, gravite, quoiFaire });

  const { nom, description, auteur } = lireFrontmatter(input.texte);

  // ── Le nom ──
  if (nom === null || nom.length === 0) {
    dire(
      "nom-absent",
      "erreur",
      "Ajoute `name:` au frontmatter — sans lui, la skill prend le nom de son dossier et devient impossible à renommer.",
    );
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(nom)) {
    dire(
      "nom-mal-forme",
      "erreur",
      `« ${nom} » doit être en minuscules-avec-tirets, sans espace ni majuscule.`,
    );
  }

  // ── La description ──
  if (description === null || description.length === 0) {
    dire(
      "description-absente",
      "erreur",
      "Ajoute `description:` — c'est ce qui décide si la skill est convoquée. Sans elle, elle ne route jamais.",
    );
  } else {
    if (description.length > MAX_DESCRIPTION) {
      dire(
        "description-trop-longue",
        "avertissement",
        `${description.length} caractères (seuil ${MAX_DESCRIPTION}). Elle est chargée à CHAQUE session : une description de ${description.length} car ne route pas mieux qu'une de 120, elle coûte juste plus, pour toujours. Dis la CAPACITÉ, pas la procédure.`,
      );
    }
    const vitrine = MOTS_DE_VITRINE.filter((mot) => motEntier(mot).test(description));
    if (vitrine.length > 0) {
      dire(
        "mot-de-vitrine",
        "avertissement",
        `« ${vitrine.join(", ")}» n'apprend rien à qui doit décider de convoquer la skill. Dis ce qu'elle FAIT.`,
      );
    }
    if (nom !== null && description.toLowerCase().includes(nom.toLowerCase())) {
      dire(
        "description-repete-le-nom",
        "avertissement",
        `La description répète « ${nom} », qui est déjà là. C'est de la place perdue à chaque session.`,
      );
    }
  }

  // ── L'auteur, et la fuite qu'ils documentent ──
  if (auteur !== null && auteur.length > 0) {
    const identites = input.identiteDeLaMachine ?? [];
    const fuite = identites.find(
      (id) => id.length > 2 && auteur.toLowerCase().includes(id.toLowerCase()),
    );
    if (fuite !== undefined) {
      dire(
        "auteur-pris-a-la-machine",
        "erreur",
        `« ${auteur} » vient de l'environnement (« ${fuite} »). Une skill se PARTAGE : un nom pris au système d'exploitation ou à la config git est une fuite de vie privée que personne n'a acceptée. Mets un nom de projet, ou rien.`,
      );
    }
  }

  // ── Le corps ──
  const lignes = input.texte.split("\n").length;
  if (lignes > MAX_LIGNES) {
    dire(
      "corps-trop-long",
      "avertissement",
      `${lignes} lignes (seuil ${MAX_LIGNES}). Les gros scripts vont dans \`scripts/\` et les références dans \`references/\`, appelés par chemin relatif — pas recopiés dans le corps pour être relus à chaque fois.`,
    );
  }

  for (const { shell, outil } of REMPLACEMENTS) {
    if (shell.test(input.texte)) {
      dire(
        "outil-shell-au-lieu-de-l-outil",
        "avertissement",
        `La skill décrit une commande shell là où l'agent a \`${outil}\`. Nommer l'outil est ce qui fait une skill plutôt qu'une page de documentation : l'agent sait alors qu'on lui parle.`,
      );
      break;
    }
  }

  return manquements;
}

/** La phrase de tête. Compte les erreurs séparément des avertissements. */
export function resumeDeControle(manquements: ReadonlyArray<Manquement>): string {
  if (manquements.length === 0) return "Conforme aux normes.";
  const erreurs = manquements.filter((m) => m.gravite === "erreur").length;
  const avertis = manquements.length - erreurs;
  return `${erreurs} erreur(s), ${avertis} avertissement(s) : ${manquements.map((m) => m.regle).join(", ")}.`;
}
