import { describe, expect, it } from "vite-plus/test";

import { aviserOuSeTaire } from "./useNotificationsDeBureau";

/**
 * Ce qui se teste ici n'est pas « ça notifie » — c'est SURTOUT « ça se tait ».
 * Une notification de trop apprend à ignorer le canal, et le jour où elle
 * compte, personne ne regarde plus. Les silences sont les vrais gardiens.
 */
const rien = {
  approbationsEnAttente: 0,
  saisiesEnAttente: 0,
  tourEnCours: false,
  erreur: null,
};
const enArrierePlan = { fenetreRegardee: false, permissionAccordee: true };

describe("aviserOuSeTaire", () => {
  it("prévient quand une approbation arrive et que la fenêtre n'est pas regardée", () => {
    const avis = aviserOuSeTaire({
      avant: rien,
      apres: { ...rien, approbationsEnAttente: 1, saisiesEnAttente: 0 },
      ...enArrierePlan,
    });
    expect(avis?.titre).toBe("Approbation attendue");
  });

  // LE CAS QUI COMPTE LE PLUS : l'interface montre déjà la demande.
  it("se TAIT quand la fenêtre est regardée", () => {
    const avis = aviserOuSeTaire({
      avant: rien,
      apres: { ...rien, approbationsEnAttente: 1, saisiesEnAttente: 0 },
      fenetreRegardee: true,
      permissionAccordee: true,
    });
    expect(avis).toBeNull();
  });

  // Sans ce garde, la moindre mise à jour d'état re-sonnerait.
  it("ne sonne pas quand le compte ne MONTE pas", () => {
    const stable = { ...rien, approbationsEnAttente: 1, saisiesEnAttente: 0 };
    expect(aviserOuSeTaire({ avant: stable, apres: stable, ...enArrierePlan })).toBeNull();
    expect(aviserOuSeTaire({ avant: stable, apres: rien, ...enArrierePlan })).toBeNull();
  });

  it("se tait sans permission accordée", () => {
    const avis = aviserOuSeTaire({
      avant: rien,
      apres: { ...rien, approbationsEnAttente: 1, saisiesEnAttente: 0 },
      fenetreRegardee: false,
      permissionAccordee: false,
    });
    expect(avis).toBeNull();
  });

  it("distingue une saisie attendue d'une approbation", () => {
    const avis = aviserOuSeTaire({
      avant: rien,
      apres: { ...rien, approbationsEnAttente: 0, saisiesEnAttente: 1 },
      ...enArrierePlan,
    });
    expect(avis?.titre).toBe("Saisie attendue");
  });

  // Une approbation et une saisie montent ensemble : l'approbation prime,
  // c'est elle qui BLOQUE l'agent. Une seule notification, jamais deux.
  it("donne la priorité à l'approbation quand les deux montent", () => {
    const avis = aviserOuSeTaire({
      avant: rien,
      apres: { ...rien, approbationsEnAttente: 1, saisiesEnAttente: 1 },
      ...enArrierePlan,
    });
    expect(avis?.titre).toBe("Approbation attendue");
  });

  it("prévient à la RETOMBÉE du tour, pas pendant", () => {
    const enCours = { ...rien, tourEnCours: true };
    expect(aviserOuSeTaire({ avant: enCours, apres: rien, ...enArrierePlan })?.titre).toBe(
      "Réponse prête",
    );
    // Pendant que ça tourne : rien.
    expect(aviserOuSeTaire({ avant: rien, apres: enCours, ...enArrierePlan })).toBeNull();
  });

  // AU REPOS, `tourEnCours` est faux en PERMANENCE. Si on notifiait sur l'état
  // au lieu de la transition, ça sonnerait sans fin.
  it("reste muet au repos, tour après tour", () => {
    expect(aviserOuSeTaire({ avant: rien, apres: rien, ...enArrierePlan })).toBeNull();
  });

  it("prévient à l'APPARITION d'une erreur, et une seule fois", () => {
    const enEchec = { ...rien, erreur: "le fournisseur a coupé" };
    const avis = aviserOuSeTaire({ avant: rien, apres: enEchec, ...enArrierePlan });
    expect(avis?.titre).toBe("Tour en échec");
    expect(avis?.corps).toBe("le fournisseur a coupé");
    // L'erreur reste affichée : elle ne doit plus re-sonner.
    expect(aviserOuSeTaire({ avant: enEchec, apres: enEchec, ...enArrierePlan })).toBeNull();
  });

  // Un tour qui échoue retombe AUSSI. Sans priorité, on annoncerait « réponse
  // prête » pour un tour qui vient de planter — le pire message possible.
  it("annonce l'échec, pas la réponse prête, quand un tour plante", () => {
    const avis = aviserOuSeTaire({
      avant: { ...rien, tourEnCours: true },
      apres: { ...rien, erreur: "boum" },
      ...enArrierePlan,
    });
    expect(avis?.titre).toBe("Tour en échec");
  });
});
