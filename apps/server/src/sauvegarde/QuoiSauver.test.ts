import { assert, describe, it } from "@effect/vitest";

import { deciderPour, planifier, type Entree } from "./QuoiSauver.ts";

describe("deciderPour", () => {
  it("passe la base par un INSTANTANÉ, jamais par une copie", () => {
    // Copier le fichier principal seul omet le WAL déjà validé. C'est
    // l'erreur que j'ai commise moi-même en mesurant, le 31/07.
    assert.equal(deciderPour("userdata/state.sqlite").traitement, "instantane-sqlite");
    assert.include(deciderPour("userdata/state.sqlite").pourquoi, "WAL");
  });

  it("laisse DEHORS les annexes SQLite", () => {
    // Les livrer avec un instantané frais apparie du neuf avec du périmé :
    // la restauration se déchire à la première ouverture.
    for (const annexe of [
      "userdata/state.sqlite-wal",
      "userdata/state.sqlite-shm",
      "userdata/state.db-wal",
    ]) {
      assert.equal(deciderPour(annexe).traitement, "exclu", annexe);
    }
  });

  it("teste les annexes AVANT de reconnaître une base", () => {
    // Sans cet ordre, `state.sqlite-wal` serait pris pour une base et on
    // tenterait d'en faire un instantané.
    assert.notEqual(deciderPour("userdata/state.sqlite-wal").traitement, "instantane-sqlite");
  });

  it("laisse les secrets dehors, et le DIT", () => {
    const d = deciderPour("userdata/secrets/oauth.json");
    assert.equal(d.traitement, "exclu");
    assert.include(d.pourquoi, "reconnecter");
  });

  it("laisse ce qui se refabrique", () => {
    for (const chemin of [
      "userdata/logs/serveur.log",
      "userdata/caches/x",
      "worktrees/a/b",
      "node_modules/paquet/index.js",
      // Trouvé en planifiant sur le vrai arbre : 257 Mo de modèle qui se
      // retéléchargent. Aucune liste écrite de tête ne l'aurait attrapé.
      "dev/voice-models/whisper-small-Q8_0.gguf",
    ]) {
      assert.equal(deciderPour(chemin).traitement, "exclu", chemin);
    }
  });

  it("EMPORTE ce qui ne se refabrique pas", () => {
    // Les pièces jointes pèsent 353 Mo et sont irremplaçables : les exclure
    // pour gagner de la place perdrait ce qu'on est venu sauver.
    for (const chemin of [
      "userdata/attachments/2026/img.png",
      "userdata/settings.json",
      "userdata/keybindings.json",
      "userdata/environment-id",
      "userdata/carnet-inconnus.json",
    ]) {
      assert.equal(deciderPour(chemin).traitement, "copie", chemin);
    }
  });

  it("ne confond pas un dossier avec un préfixe de nom", () => {
    // `logsomething/` n'est pas `logs/`, et `secretsanta.json` n'est pas
    // dans `secrets/`. Le test porte sur des SEGMENTS de chemin.
    assert.equal(deciderPour("userdata/logsomething/a.json").traitement, "copie");
    assert.equal(deciderPour("userdata/secretsanta.json").traitement, "copie");
  });

  it("supporte les séparateurs Windows", () => {
    assert.equal(deciderPour("userdata\\logs\\serveur.log").traitement, "exclu");
  });
});

describe("planifier", () => {
  const reel: ReadonlyArray<Entree> = [
    { chemin: "userdata/state.sqlite", octets: 416 * 1_048_576 },
    { chemin: "userdata/state.sqlite-wal", octets: 5 * 1_048_576 },
    { chemin: "userdata/attachments/a.png", octets: 353 * 1_048_576 },
    { chemin: "userdata/logs/serveur.log", octets: 713 * 1_048_576 },
    { chemin: "userdata/secrets/oauth.json", octets: 12 * 1024 },
    { chemin: "userdata/settings.json", octets: 2521 },
  ];

  it("sur la vraie composition, garde l'irremplaçable et jette le reste", () => {
    const plan = planifier(reel);
    assert.deepEqual(
      plan.aPrendre.map((e) => e.chemin),
      ["userdata/state.sqlite", "userdata/attachments/a.png", "userdata/settings.json"],
    );
    // 713 Mo de journaux économisés sur 1,8 Go : sans cette exclusion,
    // l'archive double pour du contenu qui se refabrique.
    assert.isAbove(plan.octetsLaisses, 700 * 1_048_576);
  });

  it("ANNONCE ce qu'elle ne contient pas — une sauvegarde muette se lit comme complète", () => {
    const plan = planifier(reel);
    assert.isAbove(plan.avertissements.length, 0);
    assert.isTrue(plan.avertissements.some((a) => a.includes("secrets")));
    assert.isTrue(plan.avertissements.some((a) => a.includes("reconnecte")));
  });

  it("chiffre ce qui a été économisé", () => {
    const plan = planifier(reel);
    assert.isTrue(plan.avertissements.some((a) => a.includes("Mo économisés")));
  });

  it("n'invente aucun avertissement quand il n'y a rien à signaler", () => {
    const plan = planifier([{ chemin: "userdata/settings.json", octets: 10 }]);
    assert.deepEqual(plan.avertissements, []);
    assert.equal(plan.octetsLaisses, 0);
  });

  it("supporte le vide", () => {
    const plan = planifier([]);
    assert.deepEqual(plan.aPrendre, []);
    assert.equal(plan.octetsPris, 0);
  });
});
