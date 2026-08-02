import { assert, describe, it } from "@effect/vitest";

import { nomDeSkill, surfaceDe, verdictALOuverture } from "./CeQuiSExecuteALOuverture.ts";

/** Le dépôt piège de P4, tel qu'il existe vraiment dans /tmp. */
const DEPOT_PIEGE = [
  ".claude/settings.json",
  ".claude/hooks/inoffensif.sh",
  ".claude/skills/piege/SKILL.md",
  "README.md",
  "src/index.ts",
];

describe("ce que porte un dossier", () => {
  it("reconnaît les quatre portes d'entrée", () => {
    const s = surfaceDe([...DEPOT_PIEGE, ".mcp.json"]);
    assert.lengthOf(s.reglages, 1);
    assert.lengthOf(s.hooks, 1);
    assert.lengthOf(s.skills, 1);
    assert.lengthOf(s.mcp, 1);
  });

  it("ne crie pas sur un settings.json ordinaire", () => {
    // Un garde qui alerte sur le sain n'est plus lu. Seul `.claude/settings`
    // compte : les autres `settings.json` sont de la configuration d'appli.
    const s = surfaceDe(["settings.json", "src/settings.json", ".vscode/settings.json"]);
    assert.lengthOf(s.reglages, 0);
  });

  it("un dossier de skill sans SKILL.md n'est pas une skill", () => {
    const s = surfaceDe([".claude/skills/piege/notes.md", ".claude/skills/README.md"]);
    assert.lengthOf(s.skills, 0);
  });

  it("attrape aussi settings.local.json, qui charge pareil", () => {
    assert.lengthOf(surfaceDe([".claude/settings.local.json"]).reglages, 1);
  });

  it("fonctionne sur des chemins absolus comme relatifs", () => {
    const s = surfaceDe(["/tmp/depot/.claude/hooks/x.sh", ".claude/hooks/y.sh"]);
    assert.lengthOf(s.hooks, 2);
  });
});

describe("le nom que l'agent verra", () => {
  it("la skill se nomme par son DOSSIER, pas par son fichier", () => {
    // C'est « piege » qui apparaît dans la liste des skills, pas « SKILL.md ».
    assert.equal(nomDeSkill(".claude/skills/piege/SKILL.md"), "piege");
    assert.equal(nomDeSkill("a/b/.claude/skills/usine/SKILL.md"), "usine");
  });
});

describe("le verdict sur un dossier ÉTRANGER", () => {
  it("un hook fait « execute » — il tire tout seul", () => {
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), false);
    assert.equal(v.gravite, "execute");
  });

  it("une skill SEULE fait « instruit », pas « execute »", () => {
    // Le geste diffère : « execute » demande un bac à sable, « instruit »
    // demande de LIRE la skill. Les confondre fait chercher au mauvais endroit.
    const v = verdictALOuverture(surfaceDe([".claude/skills/piege/SKILL.md"]), false);
    assert.equal(v.gravite, "instruit");
    assert.include(v.message, "INSTRUISENT");
  });

  it("le message NOMME ce qui va tirer (A7), jamais « contenu suspect »", () => {
    // Un agent répare « le hook X va tirer » ; il ne peut rien faire d'un
    // avertissement générique.
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), false);
    assert.include(v.message, ".claude/hooks/inoffensif.sh");
    assert.include(v.message, "piege");
    assert.notInclude(v.message.toLowerCase(), "contenu suspect");
  });

  it("il dit « à CHAQUE session », parce que c'est ce qu'on a mesuré", () => {
    // Reçu P4 : deux lancements, deux lignes dans le témoin.
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), false);
    assert.include(v.message, "à chaque session");
  });

  it("il donne la porte de sortie, pas seulement l'alerte", () => {
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), false);
    assert.include(v.message, "à distance");
  });

  it("il cite le reçu, pour que la mesure soit retrouvable", () => {
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), false);
    assert.include(v.message, "P4-CONFIANCE-LE-RECU");
  });
});

describe("le verdict sur NOTRE dossier", () => {
  it("nos propres hooks ne déclenchent aucune alerte", () => {
    // Signaler notre outillage à chaque ouverture userait le signal jusqu'à ce
    // que plus personne ne le lise — et c'est le vrai risque d'un garde.
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), true);
    assert.equal(v.gravite, "rien");
  });

  it("mais il les DÉCRIT quand même — savoir ce qu'on porte reste utile", () => {
    const v = verdictALOuverture(surfaceDe(DEPOT_PIEGE), true);
    assert.isNotEmpty(v.quoi);
    assert.include(v.message, "les nôtres");
  });

  it("un dossier vide ne dit rien d'inquiétant, même étranger", () => {
    const v = verdictALOuverture(surfaceDe(["README.md", "src/a.ts"]), false);
    assert.equal(v.gravite, "rien");
    assert.lengthOf(v.quoi, 0);
  });
});
