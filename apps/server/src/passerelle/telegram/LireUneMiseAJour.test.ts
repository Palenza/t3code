import { assert, describe, it } from "@effect/vitest";

import { quiPeutParler } from "../QuiPeutParler.ts";
import { lireUneMiseAJour } from "./LireUneMiseAJour.ts";

describe("le cas courant", () => {
  it("un message de groupe donne canal, expéditeur et texte", () => {
    const lu = lireUneMiseAJour({
      update_id: 1,
      message: {
        message_id: 7,
        chat: { id: -1001234567890, type: "supergroup" },
        from: { id: 42, first_name: "Enzo" },
        text: "relance l'usine",
      },
    });
    assert.deepEqual(lu, {
      provenance: { plateforme: "telegram", canal: "-1001234567890", expediteur: "42" },
      texte: "relance l'usine",
    });
  });

  it("un identifiant reste une CHAÎNE, jamais un nombre", () => {
    // Les identifiants de canal approchent 2^53 : un `number` perdrait de la
    // précision, et deux canaux différents deviendraient le même.
    const lu = lireUneMiseAJour({
      message: { chat: { id: -1002123456789012 }, from: { id: 1 }, text: "x" },
    });
    assert.isString(lu?.provenance.canal);
    assert.equal(lu?.provenance.canal, "-1002123456789012");
  });
});

describe("les trois façons de n'avoir PAS d'expéditeur", () => {
  it("une diffusion de canal n'a pas de `from`", () => {
    const lu = lireUneMiseAJour({
      channel_post: { chat: { id: -100999, type: "channel" }, text: "annonce" },
    });
    assert.equal(lu?.provenance.expediteur, null);
    assert.equal(lu?.provenance.canal, "-100999");
  });

  it("un administrateur anonyme non plus", () => {
    const lu = lireUneMiseAJour({
      message: {
        chat: { id: -100999 },
        sender_chat: { id: -100999, type: "supergroup" },
        text: "message anonyme",
      },
    });
    assert.equal(lu?.provenance.expediteur, null);
  });

  it("on ne se rabat JAMAIS sur l'identifiant du groupe", () => {
    // Faire passer « le groupe » pour une personne accorderait à tout le
    // groupe une autorisation posée sur une personne.
    const lu = lireUneMiseAJour({
      message: { chat: { id: -100999 }, sender_chat: { id: -100999 }, text: "x" },
    });
    assert.notEqual(lu?.provenance.expediteur, "-100999");
  });

  it("et l'autorisation par CANAL les rattrape — les deux modules se tiennent", () => {
    const lu = lireUneMiseAJour({
      channel_post: { chat: { id: -100999 }, text: "annonce" },
    });
    assert.isNotNull(lu);
    const verdict = quiPeutParler(
      lu?.provenance ?? { plateforme: "", canal: "", expediteur: null },
      {
        canaux: new Set(["telegram:-100999"]),
        personnes: new Set(),
      },
    );
    assert.isTrue(verdict.passe);
  });
});

describe("les sujets de forum", () => {
  it("le fil est lu SÉPARÉMENT du canal", () => {
    // Le n°39 en dépend : un sujet supprimé ne tue pas le groupe.
    const lu = lireUneMiseAJour({
      message: { chat: { id: -100999 }, from: { id: 42 }, message_thread_id: 88, text: "x" },
    });
    assert.equal(lu?.provenance.canal, "-100999");
    assert.equal(lu?.fil, "88");
  });

  it("un message hors sujet n'a pas de fil", () => {
    const lu = lireUneMiseAJour({
      message: { chat: { id: -100999 }, from: { id: 42 }, text: "x" },
    });
    assert.isUndefined(lu?.fil);
  });
});

describe("un message CORRIGÉ compte comme neuf", () => {
  it("parce que corriger sa demande veut dire qu'elle doit compter", () => {
    const lu = lireUneMiseAJour({
      edited_message: { chat: { id: -100999 }, from: { id: 42 }, text: "en fait, non" },
    });
    assert.equal(lu?.texte, "en fait, non");
  });
});

describe("ce qu'on ne lit PAS", () => {
  it("une réaction, un départ, une forme inconnue rendent null", () => {
    // Un événement incompris ne doit jamais devenir un message vide adressé
    // à l'agent.
    for (const brut of [
      { message_reaction: { chat: { id: -1 } } },
      { my_chat_member: { chat: { id: -1 } } },
      { inline_query: { query: "x" } },
      {},
      null,
      "texte brut",
      42,
    ]) {
      assert.isNull(lireUneMiseAJour(brut), JSON.stringify(brut));
    }
  });

  it("un message SANS texte ni légende rend null", () => {
    // Une photo sans légende, un autocollant : rien à donner à l'agent.
    assert.isNull(lireUneMiseAJour({ message: { chat: { id: -1 }, from: { id: 1 } } }));
    assert.isNull(lireUneMiseAJour({ message: { chat: { id: -1 }, text: "" } }));
  });

  it("mais une LÉGENDE de photo est un texte", () => {
    const lu = lireUneMiseAJour({
      message: { chat: { id: -100999 }, from: { id: 42 }, photo: [], caption: "regarde ça" },
    });
    assert.equal(lu?.texte, "regarde ça");
  });

  it("un message sans canal rend null — il n'y a nulle part où répondre", () => {
    assert.isNull(lireUneMiseAJour({ message: { from: { id: 1 }, text: "x" } }));
  });
});
