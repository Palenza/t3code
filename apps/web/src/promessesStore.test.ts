import { beforeEach, describe, expect, it } from "vite-plus/test";

import { MAX_PROMESSES_OUVERTES, usePromessesStore } from "./promessesStore";

const reset = () =>
  usePromessesStore.setState({ ouvertes: [], barrees: [], messagesNotes: [] });
let compteur = 0;
const idSuivant = () => `msg-${(compteur += 1)}`;
const MAINTENANT = "2026-07-29T23:00:00.000Z";

describe("promesses ouvertes", () => {
  beforeEach(reset);

  it("retient ce qu'une réponse engage", () => {
    usePromessesStore.getState().noterDepuisReponse({
      sourceMessageId: idSuivant(),
      reponse: "Le socle est posé. J'attaque le relais.",
      threadKey: "env:fil-1",
      maintenant: MAINTENANT,
    });

    const [promesse] = usePromessesStore.getState().ouvertes;
    expect(promesse?.phrase).toBe("J'attaque le relais.");
    expect(promesse?.threadKey).toBe("env:fil-1");
  });

  it("la même promesse répétée n'apparaît qu'une fois", () => {
    // Le cas vécu : « j'attaque le relais » écrit à la fin de quatre
    // réponses successives ne doit pas produire quatre rappels.
    for (let tour = 0; tour < 4; tour += 1) {
      usePromessesStore.getState().noterDepuisReponse({
        sourceMessageId: idSuivant(),
        reponse: "J'attaque le relais.",
        threadKey: "env:fil-1",
        maintenant: MAINTENANT,
      });
    }

    expect(usePromessesStore.getState().ouvertes).toHaveLength(1);
  });

  it("le travail qui tient la promesse la ferme", () => {
    usePromessesStore.getState().noterDepuisReponse({
      sourceMessageId: idSuivant(),
      reponse: "Je branche le pool.",
      threadKey: null,
      maintenant: MAINTENANT,
    });

    usePromessesStore.getState().fermerParTravail(["feat(pool): le relais est BRANCHÉ"]);

    expect(usePromessesStore.getState().ouvertes).toHaveLength(0);
  });

  it("un travail sans rapport ne ferme rien", () => {
    usePromessesStore.getState().noterDepuisReponse({
      sourceMessageId: idSuivant(),
      reponse: "J'attaque le relais.",
      threadKey: null,
      maintenant: MAINTENANT,
    });

    usePromessesStore.getState().fermerParTravail(["docs: mise à jour du README"]);

    expect(usePromessesStore.getState().ouvertes).toHaveLength(1);
  });

  it("l'humain peut barrer une promesse — son dernier mot prime", () => {
    usePromessesStore.getState().noterDepuisReponse({
      sourceMessageId: idSuivant(),
      reponse: "Je vais tester le circuit.",
      threadKey: null,
      maintenant: MAINTENANT,
    });
    const [promesse] = usePromessesStore.getState().ouvertes;
    expect(promesse).toBeDefined();

    usePromessesStore.getState().barrer(promesse?.id ?? "");

    expect(usePromessesStore.getState().ouvertes).toHaveLength(0);
  });

  it("la liste est plafonnée — sans fin, elle cesserait d'être lue", () => {
    for (let index = 0; index < MAX_PROMESSES_OUVERTES + 8; index += 1) {
      usePromessesStore.getState().noterDepuisReponse({
        sourceMessageId: idSuivant(),
        reponse: `Je vais traiter le point ${index}.`,
        threadKey: null,
        maintenant: MAINTENANT,
      });
    }

    expect(usePromessesStore.getState().ouvertes).toHaveLength(MAX_PROMESSES_OUVERTES);
    // Les plus récentes restent en tête.
    expect(usePromessesStore.getState().ouvertes[0]?.phrase).toContain("point 27");
  });

  it("une réponse sans engagement ne crée rien", () => {
    usePromessesStore.getState().noterDepuisReponse({
      sourceMessageId: idSuivant(),
      reponse: "Le pool est branché et prouvé. 47 tests verts.",
      threadKey: null,
      maintenant: MAINTENANT,
    });

    expect(usePromessesStore.getState().ouvertes).toHaveLength(0);
  });
});
