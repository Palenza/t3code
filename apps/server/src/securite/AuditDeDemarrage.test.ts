import { assert, describe, it } from "@effect/vitest";

import {
  aReparer,
  auditer,
  constatDeFichier,
  enLettres,
  MODE_ATTENDU,
  resumeDAudit,
} from "./AuditDeDemarrage.ts";

describe("constatDeFichier · ce qui a été trouvé sur la VRAIE machine", () => {
  it("0666 sur un jeton est GRAVE — modifiable, pas seulement lisible", () => {
    // `~/.t3/userdata/clerk-tokens.json` était en -rw-rw-rw- le 31/07, avec un
    // jeton de 712 caractères dedans. Un autre compte de la machine pouvait le
    // REMPLACER — on ne parle plus de fuite mais de substitution.
    const c = constatDeFichier({
      chemin: "/Users/x/.t3/userdata/clerk-tokens.json",
      mode: 0o666,
      sensibilite: "secret",
    });
    assert.equal(c?.gravite, "grave");
    assert.equal(c?.id, "fichier-modifiable-par-autrui");
    assert.include(c?.quoi ?? "", "MODIFIER");
    assert.include(c?.quoi ?? "", "rw-rw-rw-");
  });

  it("0644 sur la CARTE est un avertissement, pas une fuite", () => {
    // `settings.json` ne porte aucun secret — les jetons vivent au trousseau.
    // Il porte le homePath de chaque compte, donc l'adresse du fichier
    // d'identifiants. Ce n'est pas une fuite, c'est une carte.
    const c = constatDeFichier({
      chemin: "/Users/x/.t3/userdata/settings.json",
      mode: 0o644,
      sensibilite: "carte",
    });
    assert.equal(c?.gravite, "avertissement");
    assert.include(c?.quoi ?? "", "carte de l'installation");
  });

  it("0644 sur un SECRET reste grave", () => {
    assert.equal(
      constatDeFichier({ chemin: "/x", mode: 0o644, sensibilite: "secret" })?.gravite,
      "grave",
    );
  });

  it("0600 ne dit RIEN — c'est ce que fait déjà Claude Code", () => {
    for (const sensibilite of ["secret", "carte"] as const) {
      assert.isNull(constatDeFichier({ chemin: "/x", mode: MODE_ATTENDU, sensibilite }));
    }
  });

  it("un mode inconnu ne fabrique pas de constat", () => {
    // Un système de fichiers sans permissions POSIX ne doit pas produire
    // d'alerte : on ne sait pas, on se tait.
    assert.isNull(constatDeFichier({ chemin: "/x", mode: null, sensibilite: "secret" }));
  });

  it("0640 : le GROUPE compte aussi", () => {
    const c = constatDeFichier({ chemin: "/x", mode: 0o640, sensibilite: "secret" });
    assert.equal(c?.id, "fichier-lisible-par-autrui");
  });
});

describe("enLettres", () => {
  it("rend le mode lisible sans calcul mental", () => {
    assert.equal(enLettres(0o600), "rw-------");
    assert.equal(enLettres(0o644), "rw-r--r--");
    assert.equal(enLettres(0o666), "rw-rw-rw-");
    assert.equal(enLettres(0o755), "rwxr-xr-x");
  });
});

describe("auditer", () => {
  it("signale root, et dit POURQUOI ça compte pour un agent", () => {
    const c = auditer({ estRoot: true, fichiers: [] });
    assert.equal(c[0]?.id, "tourne-en-root");
    assert.include(c[0]?.quoi ?? "", "une page web");
  });

  it("se tait complètement quand tout va bien", () => {
    const c = auditer({
      estRoot: false,
      fichiers: [{ chemin: "/x", mode: 0o600, sensibilite: "secret" }],
    });
    assert.deepEqual(c, []);
    assert.isNull(resumeDAudit(c));
  });

  it("le cas RÉEL du 31/07, bout en bout", () => {
    const constats = auditer({
      estRoot: false,
      fichiers: [
        { chemin: "~/.t3/userdata/clerk-tokens.json", mode: 0o666, sensibilite: "secret" },
        { chemin: "~/.t3/userdata/settings.json", mode: 0o644, sensibilite: "carte" },
        { chemin: "~/.claude/.credentials.json", mode: 0o600, sensibilite: "secret" },
      ],
    });
    assert.equal(constats.length, 2, "le fichier en 0600 ne doit rien produire");
    assert.equal(constats.filter((c) => c.gravite === "grave").length, 1);
    assert.deepEqual(aReparer(constats), [
      "~/.t3/userdata/clerk-tokens.json",
      "~/.t3/userdata/settings.json",
    ]);
  });
});

describe("resumeDAudit", () => {
  it("compte les graves à part — un audit qui parle toujours devient du bruit", () => {
    const texte = resumeDAudit(
      auditer({
        estRoot: true,
        fichiers: [{ chemin: "/x", mode: 0o666, sensibilite: "secret" }],
      }),
    );
    assert.include(texte ?? "", "2 point(s) grave(s)");
    assert.include(texte ?? "", "0 avertissement(s)");
  });
});
