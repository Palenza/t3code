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
