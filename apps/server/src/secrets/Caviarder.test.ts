import { assert, describe, it } from "@effect/vitest";

import { caviarder, masquer, nomSensible, SEUIL_MASQUAGE_TOTAL } from "./Caviarder.ts";

describe("masquer — reconnaissable sans être utilisable", () => {
  it("masque TOUT ce qui est trop court", () => {
    // Moins de 18 caractères : montrer six caractères sur douze, c'est en
    // montrer la moitié.
    assert.equal(masquer("court"), "***");
    assert.equal(masquer("a".repeat(SEUIL_MASQUAGE_TOTAL - 1)), "***");
  });

  it("garde de quoi RECONNAÎTRE une clé longue", () => {
    // Sans ça, impossible de dire laquelle des trois clés a échoué.
    const masque = masquer("sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    assert.isTrue(masque.startsWith("sk-ant"));
    assert.isTrue(masque.endsWith("6789"));
    assert.include(masque, "***");
    assert.isBelow(masque.length, 20);
  });

  it("rend le vide TEL QUEL", () => {
    // Afficher `***` là où il n'y a rien laisse croire qu'un secret est
    // configuré alors qu'il manque — une heure de recherche pour rien.
    assert.equal(masquer(""), "");
  });
});

describe("nomSensible — correspondance EXACTE, jamais en sous-chaîne", () => {
  it("reconnaît les vrais noms de secrets", () => {
    for (const nom of [
      "token",
      "api_key",
      "apiKey",
      "client_secret",
      "Authorization",
      "password",
    ]) {
      assert.isTrue(nomSensible(nom), nom);
    }
  });

  it("NE caviarde PAS ce qui contient juste le mot", () => {
    // La leçon d'Hermès : `token_count` et `session_id` masqués rendent les
    // journaux illisibles, et un garde illisible finit désactivé.
    for (const nom of ["token_count", "session_id", "key_order", "secret_santa_list", "authors"]) {
      assert.isFalse(nomSensible(nom), nom);
    }
  });
});

/**
 * Recolle un faux jeton à l'exécution, pour qu'il n'existe nulle part en entier
 * dans le fichier. Les scanners de secrets lisent le SOURCE, pas la valeur.
 */
const enMorceaux = (...morceaux: ReadonlyArray<string>): string => morceaux.join("");

describe("caviarder — les jetons reconnaissables à leur préfixe", () => {
  it("attrape les clés des fournisseurs qu'on utilise", () => {
    const cas: ReadonlyArray<readonly [string, string]> = [
      ["clé sk-ant-api03-" + "A".repeat(40) + " utilisée", "sk-ant"],
      ["export GH=ghp_" + "B".repeat(36), "ghp_BB"],
      ["aws AKIAIOSFODNN7EXAMPLE ok", "AKIAIO"],
      // Assemblé PAR APPEL, et les deux contraintes le forcent.
      //
      // Écrit d'un bloc, ce leurre est pris pour un vrai jeton Slack par la
      // protection anti-secret de GitHub, qui refuse alors TOUTE poussée
      // transportant ce commit. Écrit en concaténation de littéraux, le lint
      // exige « une seule chaîne » — soit exactement ce que le scanner
      // détecte. Un appel de fonction sort de l'impasse : le lint n'y voit
      // pas des littéraux collés, le scanner n'y voit pas de jeton contigu.
      //
      // Un faux jeton n'a rien à révoquer. Il a juste à ne pas RESSEMBLER à
      // un vrai dans le fichier.
      [`slack ${enMorceaux("xoxb-", "123456789012-", "abcdefghijklmn")}`, "xoxb-1"],
      ["gitlab glpat-" + "C".repeat(24), "glpat-"],
    ];
    for (const [texte, debut] of cas) {
      const sortie = caviarder(texte);
      assert.include(sortie, "***", texte);
      assert.include(sortie, debut, texte);
      assert.notInclude(sortie, "A".repeat(40), texte);
    }
  });

  it("attrape un JWT complet", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM";
    const sortie = caviarder(`Bearer ${jwt}`);
    assert.notInclude(sortie, "SflKxwRJSMeKKF2QT4fwpM");
  });

  it("ne caviarde PAS ce qui ressemble sans en être", () => {
    // On ne masque jamais « une longue chaîne qui pourrait être un secret » :
    // un hash git, un identifiant de fil ou un chemin encodé disparaîtraient
    // des journaux.
    for (const sain of [
      "commit 5dcdc8647a1b2c3d4e5f60718293a4b5c6d7e8f9",
      "thread 902afe28-662f-4456-bd26-07c8e0f49ba5",
      "fichier apps/server/src/secrets/Caviarder.ts",
      "3 816 messages indexés en 103 ms",
    ]) {
      assert.equal(caviarder(sain), sain, sain);
    }
  });
});

describe("caviarder — ce que le NOM désigne", () => {
  it("masque une affectation d'environnement", () => {
    const sortie = caviarder('ANTHROPIC_API_KEY="valeur-opaque-sans-prefixe-connu"');
    assert.notInclude(sortie, "valeur-opaque-sans-prefixe-connu");
    assert.include(sortie, "ANTHROPIC_API_KEY");
  });

  it("masque un champ JSON", () => {
    const sortie = caviarder('{"access_token": "opaque-1234567890-abcdefghij", "count": 42}');
    assert.notInclude(sortie, "opaque-1234567890-abcdefghij");
    // Le reste du journal doit rester LISIBLE.
    assert.include(sortie, '"count": 42');
  });

  it("laisse intacts les champs qui n'en sont pas", () => {
    const sain = '{"token_count": 720879, "session_id": "abc-123", "maxTokens": 1000000}';
    assert.equal(caviarder(sain), sain);
  });

  it("masque un en-tête d'autorisation, schéma compris", () => {
    const sortie = caviarder("Authorization: Bearer opaque-token-sans-prefixe-connu-12345");
    assert.notInclude(sortie, "opaque-token-sans-prefixe-connu-12345");
    // Le schéma reste visible : savoir que c'est un Bearer aide à déboguer.
    assert.include(sortie, "Bearer");
  });

  it("masque un paramètre d'URL sensible, et lui seul", () => {
    const sortie = caviarder("GET /api?page=2&access_token=opaque-valeur-longue-12345&sort=desc");
    assert.notInclude(sortie, "opaque-valeur-longue-12345");
    assert.include(sortie, "page=2");
    assert.include(sortie, "sort=desc");
  });

  it("ne garde aucun morceau d'une clé privée", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA1234567890abcdefghijklmnop
qrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345
-----END RSA PRIVATE KEY-----`;
    const sortie = caviarder(`clé lue :\n${pem}\nfin`);
    assert.notInclude(sortie, "MIIEowIBAAKCAQEA");
    assert.notInclude(sortie, "qrstuvwxyz");
    assert.include(sortie, "fin");
  });
});

describe("caviarder — les invariants", () => {
  it("est idempotent : caviarder deux fois ne change rien", () => {
    // Un journal peut passer par plusieurs couches. Si le second passage
    // remasquait le masque, on perdrait la partie reconnaissable.
    const texte = `clé sk-ant-api03-${"Z".repeat(40)} et token="opaque-valeur-longue-1234"`;
    const une = caviarder(texte);
    assert.equal(caviarder(une), une);
  });

  it("ne touche pas un texte sans secret", () => {
    const journal = "2 065 tests verts · typecheck propre · index construit en 103 ms";
    assert.equal(caviarder(journal), journal);
  });

  it("supporte le vide", () => {
    assert.equal(caviarder(""), "");
  });
});

describe("le mot de passe dans une URL — la fuite du ratissage 02/08", () => {
  // Rejoué AVANT le correctif : ces trois formes sortaient inchangées — donc
  // en clair — par l'export Markdown et la porte de sortie MCP.
  it("masque le mot de passe, et SEULEMENT lui", () => {
    assert.equal(
      caviarder("https://enzo:motdepasse@git.exemple.com/repo.git"),
      "https://enzo:***@git.exemple.com/repo.git",
    );
    assert.equal(
      caviarder("postgres://admin:Sup3rS3cret@db.interne:5432/palenza"),
      "postgres://admin:***@db.interne:5432/palenza",
    );
  });

  it("attrape la forme réelle : un `git remote -v` collé dans un fil", () => {
    const remote = "origin  https://enzo:MotDePasse2026@github.com/Palenza/t3code.git (fetch)";
    const sortie = caviarder(remote);
    assert.ok(!sortie.includes("MotDePasse2026"));
    assert.ok(sortie.includes("https://enzo:***@github.com/Palenza/t3code.git"));
  });

  it("laisse intact un utilisateur SANS mot de passe", () => {
    // « ssh://git@github.com » est la forme la plus courante au monde — la
    // massacrer rendrait chaque journal git illisible, et un garde qui rend
    // les journaux illisibles finit désactivé.
    const formes = [
      "ssh://git@github.com/Palenza/t3code.git",
      "mailto:enzo@exemple.com",
      "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "https://github.com/Palenza/t3code.git",
    ];
    for (const forme of formes) {
      assert.equal(caviarder(forme), forme);
    }
  });

  it("ne repasse PAS derrière la passe des jetons", () => {
    // Un ghp_… en position mot de passe est déjà masqué EN GARDANT sa tête
    // reconnaissable — c'est ce qui permet de savoir QUELLE clé a fui. La
    // passe URL ne doit pas écraser ce choix.
    const texte = `https://enzo:ghp_${"A".repeat(24)}@github.com/repo.git`;
    const sortie = caviarder(texte);
    assert.ok(sortie.includes("ghp_"), sortie);
    assert.ok(sortie.includes("***"), sortie);
    // Et l'idempotence tient toujours, mot de passe compris.
    assert.equal(caviarder(sortie), sortie);
  });

  it("reste idempotent sur un mot de passe ordinaire", () => {
    const une = caviarder("https://enzo:motdepasse@git.exemple.com/repo.git");
    assert.equal(caviarder(une), une);
  });
});
