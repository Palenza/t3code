import { assert, describe, it } from "@effect/vitest";

import {
  malveillantsSeulement,
  paquetALancer,
  verdictDePaquet,
  type PaquetVise,
} from "./PaquetALancer.ts";

describe("reconnaître un lanceur", () => {
  it("npx, uvx, pipx — les leurs", () => {
    assert.equal(paquetALancer("npx", ["cowsay"])?.ecosysteme, "npm");
    assert.equal(paquetALancer("uvx", ["ruff"])?.ecosysteme, "PyPI");
    assert.equal(paquetALancer("pipx", ["black"])?.ecosysteme, "PyPI");
  });

  it("bunx et `pnpm dlx` — les NÔTRES, absents de chez eux", () => {
    // Un contrôle qui ne connaît pas les commandes qu'on tape ne contrôle rien.
    assert.deepEqual(paquetALancer("bunx", ["prettier"]), {
      ecosysteme: "npm",
      nom: "prettier",
      version: null,
    });
    assert.deepEqual(paquetALancer("pnpm", ["dlx", "prettier"]), {
      ecosysteme: "npm",
      nom: "prettier",
      version: null,
    });
  });

  it("`pnpm install` n'est PAS un lanceur — il ne va rien exécuter", () => {
    assert.isNull(paquetALancer("pnpm", ["install", "lodash"]));
  });

  it("le chemin complet et la casse ne cachent pas le lanceur", () => {
    assert.equal(paquetALancer("/usr/local/bin/NPX", ["cowsay"])?.nom, "cowsay");
    assert.equal(paquetALancer("C:\\Program Files\\nodejs\\npx.cmd", ["cowsay"])?.nom, "cowsay");
  });

  it("une commande ordinaire ne rend rien", () => {
    assert.isNull(paquetALancer("git", ["status"]));
    assert.isNull(paquetALancer("node", ["index.js"]));
    assert.isNull(paquetALancer("npx", []));
  });
});

describe("trouver le paquet dans les arguments", () => {
  it("saute les drapeaux", () => {
    assert.equal(paquetALancer("npx", ["--yes", "cowsay"])?.nom, "cowsay");
    assert.equal(paquetALancer("npx", ["-y", "cowsay"])?.nom, "cowsay");
  });

  it("`--package` l'emporte sur le binaire exécuté", () => {
    // Sans ça on interrogerait « outil », qui n'est pas un paquet publié :
    // réponse vide, donc feu vert accordé au mauvais nom. Une vérification
    // qui regarde à côté est pire qu'aucune.
    assert.equal(paquetALancer("npx", ["--package", "@scope/vrai", "outil"])?.nom, "@scope/vrai");
    assert.equal(paquetALancer("npx", ["-p", "@scope/vrai", "outil"])?.nom, "@scope/vrai");
    assert.equal(paquetALancer("npx", ["--package=@scope/vrai", "outil"])?.nom, "@scope/vrai");
  });

  it("`--package` gagne même s'il arrive APRÈS le positionnel", () => {
    // C'est le cas que leur parseur rate : il s'arrête au premier positionnel.
    assert.equal(paquetALancer("npx", ["outil", "--package", "@scope/vrai"])?.nom, "@scope/vrai");
  });
});

describe("lire un nom de paquet npm", () => {
  it("scopé, avec et sans version", () => {
    assert.deepEqual(paquetALancer("npx", ["@scope/outil"]), {
      ecosysteme: "npm",
      nom: "@scope/outil",
      version: null,
    });
    assert.deepEqual(paquetALancer("npx", ["@scope/outil@1.2.3"]), {
      ecosysteme: "npm",
      nom: "@scope/outil",
      version: "1.2.3",
    });
  });

  it("non scopé, avec version", () => {
    assert.deepEqual(paquetALancer("npx", ["cowsay@1.5.0"]), {
      ecosysteme: "npm",
      nom: "cowsay",
      version: "1.5.0",
    });
  });

  it("`@latest` n'est pas une version", () => {
    // L'envoyer à OSV interrogerait une version qui n'existe pas, et une
    // réponse vide se lirait « rien à signaler ». Sans version, OSV répond
    // sur le paquet entier — ce qu'on veut.
    assert.isNull(paquetALancer("npx", ["cowsay@latest"])?.version);
  });
});

describe("lire un nom de paquet PyPI", () => {
  it("version épinglée et extras", () => {
    assert.deepEqual(paquetALancer("uvx", ["ruff==0.5.0"]), {
      ecosysteme: "PyPI",
      nom: "ruff",
      version: "0.5.0",
    });
    assert.deepEqual(paquetALancer("uvx", ["httpx[cli]==0.27.0"]), {
      ecosysteme: "PyPI",
      nom: "httpx",
      version: "0.27.0",
    });
  });
});

describe("ne garder QUE la malveillance", () => {
  it("une CVE ordinaire est ignorée", () => {
    // Une CVE dans une dépendance est un risque qu'on arbitre ; un paquet
    // malveillant est du code hostile qu'on s'apprête à exécuter. Une alerte
    // qui crie sur la moitié de npm est une alerte qu'on éteint.
    assert.deepEqual(
      malveillantsSeulement([{ id: "GHSA-xxxx", summary: "prototype pollution" }]),
      [],
    );
    assert.deepEqual(malveillantsSeulement([{ id: "CVE-2024-1234" }]), []);
  });

  it("un MAL-* est retenu, avec son résumé", () => {
    assert.deepEqual(
      malveillantsSeulement([
        { id: "MAL-2024-0001", summary: "vole les jetons npm" },
        { id: "CVE-2024-9999" },
      ]),
      [{ id: "MAL-2024-0001", resume: "vole les jetons npm" }],
    );
  });

  it("un avis sans résumé porte au moins son identifiant", () => {
    assert.equal(malveillantsSeulement([{ id: "MAL-2024-0002" }])[0]?.resume, "MAL-2024-0002");
  });

  it("une réponse malformée ne devient pas un vert", () => {
    // Un `vulns` absent ou tordu ne doit pas se lire « rien trouvé » par
    // accident ; c'est l'appelant qui distingue, et il reçoit une liste vide
    // dans les deux cas — mais jamais une exception qui coupe le tour.
    assert.deepEqual(malveillantsSeulement(undefined), []);
    assert.deepEqual(malveillantsSeulement("bonjour"), []);
    assert.deepEqual(malveillantsSeulement([null, 42, { pasDId: true }]), []);
  });
});

describe("sur une VRAIE réponse d'OSV", () => {
  // Relevée en direct le 01/08 :
  //   curl -s -X POST https://api.osv.dev/v1/query -H "Content-Type: application/json" \
  //     -d '{"package":{"name":"noblox.js-proxy","ecosystem":"npm"}}'
  // Un golden pris au réel plutôt qu'inventé : c'est le seul moyen que le
  // filtre corresponde à ce que l'API rend VRAIMENT, et pas à l'idée que je
  // m'en fais.
  const REPONSE_REELLE = {
    vulns: [
      {
        id: "MAL-2022-4874",
        summary: "Malicious code in noblox.js-proxy (npm)",
        modified: "2026-01-01T00:00:00Z",
        affected: [{ package: { name: "noblox.js-proxy", ecosystem: "npm" } }],
      },
    ],
  };

  it("extrait l'avis de malveillance sans se perdre dans le reste de la charge", () => {
    assert.deepEqual(malveillantsSeulement(REPONSE_REELLE.vulns), [
      { id: "MAL-2022-4874", resume: "Malicious code in noblox.js-proxy (npm)" },
    ]);
  });

  it("un paquet sain rend un objet SANS clé `vulns` — pas une liste vide", () => {
    // Mesuré aussi : `cowsay` rend littéralement `{}`. Un code qui suppose la
    // clé présente lèverait sur le cas le plus fréquent de tous.
    const sain: { vulns?: unknown } = {};
    assert.deepEqual(malveillantsSeulement(sain.vulns), []);
  });
});

describe("la phrase du verdict", () => {
  const paquet: PaquetVise = { ecosysteme: "npm", nom: "cowsay", version: "1.5.0" };

  it("rien trouvé se dit « OSV n'a rien », pas « le paquet est sain »", () => {
    // H4 : un fait sur NOUS. Un paquet publié il y a une heure n'y figure pas.
    const verdict = verdictDePaquet(paquet, []);
    assert.isFalse(verdict.malveillant);
    assert.include(verdict.phrase, "Aucun avis de malveillance connu chez OSV");
    assert.include(verdict.phrase, "ne veut pas dire que le paquet est sain");
  });

  it("trouvé se dit en impératif, avec les identifiants et la cause probable", () => {
    const verdict = verdictDePaquet(paquet, [{ id: "MAL-2024-0001", resume: "vole les jetons" }]);
    assert.isTrue(verdict.malveillant);
    assert.include(verdict.phrase, "NE LANCE PAS cowsay@1.5.0");
    assert.include(verdict.phrase, "MAL-2024-0001");
    assert.include(verdict.phrase, "faute de frappe");
  });
});
