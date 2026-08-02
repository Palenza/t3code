import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { comptesAttention, delaiAvantReprise, ligneDeRotation } from "./rotationPresentation.logic";

const MAINTENANT = Date.parse("2026-08-02T12:00:00.000Z");
const compte = (instanceId: string, rotation?: ServerProvider["rotation"]): ServerProvider =>
  ({ instanceId, rotation }) as unknown as ServerProvider;

describe("ce que la rotation dit d'un compte", () => {
  it("ne dit rien quand le serveur n'a rien à en dire", () => {
    expect(ligneDeRotation(undefined, MAINTENANT)).toBeNull();
    expect(ligneDeRotation({ state: "ok" }, MAINTENANT)).toBeNull();
  });

  it("annonce une reconnexion pour un compte écarté définitivement", () => {
    const ligne = ligneDeRotation({ state: "dead", reason: "jeton révoqué" }, MAINTENANT);
    expect(ligne?.gravite).toBe("bloque");
    // La raison du serveur passe TELLE QUELLE. La reformuler, c'est perdre le
    // seul indice qui permet de réparer.
    expect(ligne?.raison).toBe("jeton révoqué");
  });

  it("dit le délai restant d'un compte mis de côté", () => {
    const ligne = ligneDeRotation(
      { state: "cooling", reason: "quota atteint", resumesAt: "2026-08-02T12:12:00.000Z" },
      MAINTENANT,
    );
    expect(ligne?.gravite).toBe("attention");
    expect(ligne?.reprise).toBe("resumes in 12 min");
  });

  it("ne raconte plus d'attente une fois l'échéance passée", () => {
    // « resumes in 5 min » affiché une demi-heure après la reprise est un
    // mensonge tranquille : rien ne casse, et l'écran ment.
    const ligne = ligneDeRotation(
      { state: "cooling", resumesAt: "2026-08-02T11:30:00.000Z" },
      MAINTENANT,
    );
    expect(ligne?.reprise).toBeUndefined();
  });

  it("signale un compte reparti après des hoquets", () => {
    // C'est la RÉPÉTITION qui annonce la panne suivante. Taire ces échecs
    // donnerait la même image qu'un compte qui n'a jamais bronché.
    expect(ligneDeRotation({ state: "ok", consecutiveFailures: 1 }, MAINTENANT)?.titre).toBe(
      "Back after 1 failure",
    );
    expect(ligneDeRotation({ state: "ok", consecutiveFailures: 3 }, MAINTENANT)?.titre).toBe(
      "Back after 3 failures",
    );
  });
});

describe("le délai avant reprise", () => {
  it("arrondit vers le HAUT — jamais promettre plus tôt que la vérité", () => {
    // 61 secondes doivent donner « 2 min », pas « 1 min » : un utilisateur qui
    // revient à la minute annoncée doit trouver le compte prêt, pas presque.
    expect(delaiAvantReprise("2026-08-02T12:01:01.000Z", MAINTENANT)).toBe("resumes in 2 min");
  });

  it("passe aux heures au-delà de soixante minutes", () => {
    expect(delaiAvantReprise("2026-08-02T14:00:00.000Z", MAINTENANT)).toBe("resumes in 2 h");
    expect(delaiAvantReprise("2026-08-02T13:25:00.000Z", MAINTENANT)).toBe("resumes in 1 h 25 min");
  });

  it("se tait sur une échéance passée ou illisible", () => {
    expect(delaiAvantReprise("2026-08-02T11:00:00.000Z", MAINTENANT)).toBeUndefined();
    expect(delaiAvantReprise("2026-08-02T12:00:00.000Z", MAINTENANT)).toBeUndefined();
    expect(delaiAvantReprise("pas-une-date", MAINTENANT)).toBeUndefined();
  });
});

describe("la bande « ce qui a besoin d'attention »", () => {
  it("range le bloqué avant le refroidi", () => {
    const bande = comptesAttention(
      [
        compte("claude-b", { state: "cooling", resumesAt: "2026-08-02T12:30:00.000Z" }),
        compte("claude-c", { state: "dead", reason: "jeton révoqué" }),
      ],
      MAINTENANT,
    );
    expect(bande.map((entree) => entree.provider.instanceId)).toEqual(["claude-c", "claude-b"]);
  });

  it("ne crie PAS pour un compte reparti après un hoquet", () => {
    // Une bande qui s'allume pour un ennui déjà résorbé, on apprend à ne plus
    // la lire — et elle ne protège plus le jour où ça compte.
    expect(
      comptesAttention([compte("claude-a", { state: "ok", consecutiveFailures: 2 })], MAINTENANT),
    ).toEqual([]);
  });

  it("reste vide quand tout va bien", () => {
    expect(
      comptesAttention([compte("claude-a"), compte("claude-b", { state: "ok" })], MAINTENANT),
    ).toEqual([]);
  });

  it("laisse sortir un refroidissement dont l'heure est passée", () => {
    // `ligneDeRotation` le garde en « attention » — le serveur le dit encore
    // en refroidissement — mais sans annoncer d'attente. C'est volontaire :
    // c'est le SERVEUR qui décide quand un compte redevient utilisable, pas
    // l'horloge du navigateur.
    const bande = comptesAttention(
      [compte("claude-b", { state: "cooling", resumesAt: "2026-08-02T11:00:00.000Z" })],
      MAINTENANT,
    );
    expect(bande).toHaveLength(1);
    expect(bande[0]?.ligne.reprise).toBeUndefined();
  });
});
