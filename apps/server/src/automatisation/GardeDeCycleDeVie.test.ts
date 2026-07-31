import { assert, describe, it } from "@effect/vitest";

import { BLUEPRINTS, remplir, type Blueprint } from "./Blueprint.ts";
import { refusDeCycleDeVie } from "./GardeDeCycleDeVie.ts";

describe("ce qui ferait redémarrer l'exécuteur", () => {
  it("attrape les formes d'arrêt et de redémarrage de T3", () => {
    for (const commande of [
      "t3 restart",
      "t3 serve restart",
      "t3 stop",
      "launchctl kickstart -k gui/501/ai.t3code.server",
      "systemctl --user restart t3code",
      "pkill -f t3code",
      "pkill -f claude-agent",
    ]) {
      assert.isNotNull(refusDeCycleDeVie(`Chaque matin à 8h, lance \`${commande}\``), commande);
    }
  });

  it("la mise à jour compte AUSSI, même si elle n'y ressemble pas", () => {
    // Rien dans « mets à jour le serveur » n'évoque un arrêt. C'est pourtant
    // le même piège : la version remplace le processus, la session reprend,
    // le job se rejoue.
    const refus = refusDeCycleDeVie("Tous les lundis, fais `t3 self-update` vers la dernière");
    assert.isNotNull(refus);
    assert.include(refus?.pourquoi ?? "", "MISE À JOUR");
  });

  it("le refus dit POURQUOI la boucle ne s'arrête pas toute seule", () => {
    // Sans ça, le refus ressemble à une pudibonderie et se contourne.
    const refus = refusDeCycleDeVie("relance avec `systemctl --user restart t3code`");
    assert.include(refus?.pourquoi ?? "", "superviseur");
    assert.include(refus?.pourquoi ?? "", "se rejouerait");
  });
});

describe("ce qu'on laisse PASSER, et c'est la moitié du travail", () => {
  it("de la prose qui parle de redémarrage ne déclenche rien", () => {
    // Une consigne d'automatisation part vers un MODÈLE, pas vers un shell.
    // Une correspondance large sur de l'anglais ou du français ferait des
    // faux positifs sans empêcher le vrai piège, qui exige une forme de
    // commande. C'est la leçon que le garde de commandes de ce dépôt a payée
    // le 31/07 : lire une LIGNE comme si c'était une COMMANDE.
    for (const prose of [
      "Analyse le comportement de redémarrage de la passerelle Kong",
      "Rédige un rapport sur les redémarrages du serveur de production",
      "Surveille si un service s'arrête tout seul et préviens-moi",
      "Compare les stratégies de restart des concurrents",
    ]) {
      assert.isNull(refusDeCycleDeVie(prose), prose);
    }
  });

  it("redémarrer AUTRE CHOSE que T3 reste permis", () => {
    // Bloquer `systemctl restart` en général refuserait un job parfaitement
    // légitime qui relance nginx.
    assert.isNull(refusDeCycleDeVie("Chaque nuit, `systemctl restart nginx`"));
    assert.isNull(refusDeCycleDeVie("`launchctl kickstart -k gui/501/com.docker.docker`"));
    assert.isNull(refusDeCycleDeVie("`pkill -f node-exporter`"));
  });

  it("DÉMARRER n'est pas bloqué — c'est bénin", () => {
    // Démarrer depuis un processus déjà démarré donne au pire un « déjà en
    // cours », et une automatisation légitime peut lever un service voisin.
    assert.isNull(refusDeCycleDeVie("`systemctl --user start t3code`"));
  });

  it("les automatisations ordinaires ne sentent jamais ce garde", () => {
    for (const consigne of [
      "Tous les jours à 9h, relance l'usine sur les produits en attente",
      "Chaque lundi, sauvegarde l'état vers R2",
      "Toutes les 4 h, relève les quotas des comptes et préviens si l'un dépasse 90 %",
    ]) {
      assert.isNull(refusDeCycleDeVie(consigne), consigne);
    }
  });
});

describe("le garde est ATTEINT par remplir, pas seulement écrit à côté", () => {
  /**
   * Un blueprint à emplacement LIBRE. Aucun des trois livrés n'en a — leurs
   * emplacements sont tous typés (heure, jours, nombre) et validés. Le type
   * `texte` existe pourtant dans le contrat, et c'est précisément ce cas-là
   * que le garde attend : le jour où un blueprint laisse écrire du texte
   * libre, la commande peut se glisser dans la consigne finale.
   */
  const AVEC_TEXTE_LIBRE: Blueprint = {
    id: "test-texte-libre",
    titre: "Faire une chose",
    aQuoiCaSert: "vérifier le garde",
    recurrence: "chaque jour à {heure}",
    consigne: "Fais ceci : {quoi}",
    emplacements: [
      { nom: "heure", type: "heure", libelle: "Heure", defaut: "08:00", requis: true },
      { nom: "quoi", type: "texte", libelle: "Quoi", requis: true },
    ],
  };

  it("une commande glissée dans un champ libre FAIT ÉCHOUER le remplissage", () => {
    const resultat = remplir(AVEC_TEXTE_LIBRE, { quoi: "`systemctl --user restart t3code`" });
    assert.isFalse(resultat.ok);
    if (!resultat.ok) {
      assert.equal(resultat.refus[0]?.emplacement, "consigne");
      assert.include(resultat.refus[0]?.pourquoi ?? "", "superviseur");
    }
  });

  it("le contrôle a lieu APRÈS substitution — sur le gabarit il ne verrait que des accolades", () => {
    // Le gabarit dit `Fais ceci : {quoi}`. Rien de dangereux là-dedans. Le
    // danger n'existe qu'une fois la valeur posée.
    assert.isNull(refusDeCycleDeVie(AVEC_TEXTE_LIBRE.consigne));
  });

  it("un champ libre ordinaire passe sans rien sentir", () => {
    const resultat = remplir(AVEC_TEXTE_LIBRE, { quoi: "relève les prix et compare à hier" });
    assert.isTrue(resultat.ok);
  });

  it("les trois blueprints LIVRÉS restent tous remplissables", () => {
    // Un garde qui casse l'existant est un garde qu'on retire.
    for (const blueprint of BLUEPRINTS) {
      const resultat = remplir(blueprint, {});
      assert.isTrue(resultat.ok, blueprint.id);
    }
  });
});
