// @effect-diagnostics nodeBuiltinImport:off - Le banc LIT le dépôt entier : il lui faut le disque brut.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { assert, describe, it } from "vite-plus/test";

import { caviarder } from "./Caviarder.ts";

/**
 * LE BANC À TROIS SENS — le seul juge du caviardage.
 *
 * Une relecture ne peut pas prouver qu'un caviardage est bon : il doit être
 * juste dans DEUX directions opposées, et une correction qui améliore l'une
 * dégrade souvent l'autre. Vécu le 03/08 : en réparant les faux positifs
 * (800 fichiers du dépôt abîmés), j'ai fait passer DEUX vrais secrets au
 * travers sans m'en apercevoir. Seul un banc qui mesure les deux sens à
 * chaque exécution attrape ça.
 *
 *   SENS 1 — le dépôt est un corpus SANS SECRET. Toute altération y est un
 *            faux positif, par construction. C'est la mesure la plus
 *            exhaustive possible et elle ne demande aucun jugement.
 *   SENS 2 — un corpus de secrets RÉELS, un par forme rencontrée en vrai.
 *            Chacun doit tomber.
 *   SENS 3 — l'idempotence. Un caviardage qui n'est pas stable finit par
 *            tout effacer, un passage après l'autre.
 *
 * Les plafonds ci-dessous sont des FILS-PIÈGES : posés au-dessus de la mesure
 * du jour, pour que seule une régression les touche. Ils ne descendent que
 * lorsqu'on améliore, jamais pour faire passer un rouge.
 */

const RACINE = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../../..",
);

/**
 * Plafond de fichiers altérés, mesuré le 03/08 : 26 sur 2 828.
 *
 * Le reliquat est presque entièrement composé de FIXTURES DE TEST qui
 * imitent de vraies clés (`sk-ant-…`, `https://user:password@…`) — les
 * masquer est le comportement JUSTE. Descendre à zéro exigerait de
 * distinguer une vraie clé d'une fausse, ce que personne ne sait faire.
 */
const PLAFOND_FICHIERS_ALTERES = 40;

/**
 * Zéro. Pas un fil-piège : un INVARIANT.
 *
 * Perdre une ligne veut dire que le texte hors secret a été réécrit — donc
 * que les numéros de ligne d'un agent ne collent plus au disque. C'est la
 * corruption qui a motivé toute la réécriture ; elle ne se négocie pas.
 */
const LIGNES_PERDUES_TOLEREES = 0;

/** Un secret par forme rencontrée en vrai. Chacun DOIT tomber. */
const SECRETS_REELS: ReadonlyArray<readonly [string, string]> = [
  ["clé Anthropic", "ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGh12345678901234567890"],
  ["jeton GitHub", "le jeton ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 traîne ici"],
  ["mot de passe d'URL", "https://enzo:Sup3rS3cretPassw0rd@git.exemple.com/repo.git"],
  ["chaîne Postgres", "postgres://admin:Tr0ub4dor3xKcd99@db.interne:5432/palenza"],
  [
    "en-tête Bearer",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  ],
  ["client_secret JSON", 'client_secret: "aB3dEf9hIjK2lMnOpQ4rStUvW6xYz8A1"'],
  // Les clés d'objet : c'est la famille du data-lake, et elle sortait EN
  // CLAIR — la liste des noms connaissait `api_key` mais pas `access_key`.
  ["clé R2", "R2_SECRET_ACCESS_KEY=9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c"],
  [
    "clé de rôle Supabase",
    "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop.xyz123456789",
  ],
  ["clé de chiffrement", "ENCRYPTION_KEY=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA=="],
  // Le `@` dans le mot de passe : l'ancienne version ne masquait que jusqu'au
  // PREMIER `@` et laissait la fin en clair — avec un `***` qui certifiait
  // l'inverse. Un demi-masquage est pire que pas de masquage : il se cite.
  ["mot de passe contenant @", "https://u:p@ssw0rd-Tr3s-L0ng-Ici@hote.exemple.com/x"],
  // `$&` : passé en chaîne de remplacement, il se ré-injectait ENTIER, suivi
  // de son masque. Le découpage par bornes le rend inerte.
  ["secret commençant par $&", 'api_key="$&AbCdEf123456789012345678"'],
  ["identifiant AWS", "AKIAIOSFODNN7EXAMPLE"],
  [
    "clé privée PEM",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQ\n-----END RSA PRIVATE KEY-----",
  ],
];

/** Ce qui ne DOIT jamais bouger : ni secret, ni matière à abîmer. */
const TEXTES_SAINS: ReadonlyArray<readonly [string, string]> = [
  ["mot de configuration", "id-token: none"],
  ["interpolation GitHub", "token: ${{ secrets.EXPO_TOKEN }}"],
  ["expression de code", "Authorization: mcpSession.authorizationHeader,"],
  ["appel de fonction", "const token = Encoding.encodeHex(bytes);"],
  ["slug lisible", 'const secret = "unrelated-browser-payload-secret";'],
  ["utilisateur sans mot de passe", "ssh://git@github.com/Palenza/t3code.git"],
  ["variable d'environnement citée", "$ANTHROPIC_API_KEY"],
  ["compteur", "token_count: 4096"],
];

function fichiersDuDepot(): string[] {
  const EXCLUS = new Set([
    "node_modules",
    ".git",
    "dist",
    "release",
    ".turbo",
    "coverage",
    ".repos",
  ]);
  const sortie: string[] = [];
  const marcher = (dossier: string) => {
    for (const entree of NodeFS.readdirSync(dossier, { withFileTypes: true })) {
      if (EXCLUS.has(entree.name)) continue;
      const chemin = NodePath.join(dossier, entree.name);
      if (entree.isDirectory()) marcher(chemin);
      else if (/\.(ts|tsx|js|mjs|json|md|yml|yaml|sh)$/u.test(entree.name)) sortie.push(chemin);
    }
  };
  marcher(RACINE);
  return sortie;
}

describe("SENS 1 — le dépôt est un corpus sans secret", () => {
  const fichiers = fichiersDuDepot();

  it("il y a bien un dépôt à inspecter", () => {
    // Sans ce plancher, tout ce qui suit passerait sur zéro fichier — un vert
    // qui ne prouve rien, et qui se cite quand même.
    assert.isAbove(fichiers.length, 1500, `seulement ${fichiers.length} fichiers trouvés`);
  });

  it("ne PERD jamais une ligne — l'invariant qui ne se négocie pas", () => {
    const coupables: string[] = [];
    let perdues = 0;
    for (const fichier of fichiers) {
      let source: string;
      try {
        source = NodeFS.readFileSync(fichier, "utf8");
      } catch {
        continue;
      }
      const sortie = caviarder(source);
      if (sortie === source) continue;
      const ecart = source.split("\n").length - sortie.split("\n").length;
      if (ecart !== 0) {
        perdues += ecart;
        if (coupables.length < 5) coupables.push(`${fichier.slice(RACINE.length + 1)} (${ecart})`);
      }
    }
    assert.strictEqual(
      perdues,
      LIGNES_PERDUES_TOLEREES,
      `Des lignes ont disparu : ${coupables.join(", ")}. Le texte hors secret a été ` +
        `réécrit — les numéros de ligne d'un agent ne collent plus au disque.`,
    );
  });

  it("n'altère qu'une poignée de fichiers, tous porteurs d'une forme de secret", () => {
    let alteres = 0;
    const exemples: string[] = [];
    for (const fichier of fichiers) {
      let source: string;
      try {
        source = NodeFS.readFileSync(fichier, "utf8");
      } catch {
        continue;
      }
      if (caviarder(source) === source) continue;
      alteres += 1;
      if (exemples.length < 8) exemples.push(fichier.slice(RACINE.length + 1));
    }
    assert.isAtMost(
      alteres,
      PLAFOND_FICHIERS_ALTERES,
      `${alteres} fichiers altérés (plafond ${PLAFOND_FICHIERS_ALTERES}). ` +
        `Premiers : ${exemples.join(", ")}`,
    );
  });
});

describe("SENS 2 — tout secret réel tombe", () => {
  for (const [nom, entree] of SECRETS_REELS) {
    it(`masque : ${nom}`, () => {
      const sortie = caviarder(entree);
      assert.notStrictEqual(sortie, entree, "rien n'a été masqué");
      assert.include(sortie, "***", "aucun masque posé");
    });
  }
});

describe("les textes sains traversent INTACTS", () => {
  for (const [nom, entree] of TEXTES_SAINS) {
    it(`ne touche pas : ${nom}`, () => {
      assert.strictEqual(caviarder(entree), entree);
    });
  }
});

describe("SENS 3 — idempotence", () => {
  it("un second passage ne change plus rien", () => {
    // Sans ça, le masque grossit à chaque passage et finit par tout manger.
    const instables = SECRETS_REELS.filter(
      ([, entree]) => caviarder(caviarder(entree)) !== caviarder(entree),
    ).map(([nom]) => nom);
    assert.deepStrictEqual(instables, [], `instables : ${instables.join(", ")}`);
  });
});
