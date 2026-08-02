import { describe, expect, it } from "vite-plus/test";

import {
  appendReasoningDelta,
  markReasoningFlushed,
  MAX_REASONING_CHARS,
  openReasoningBlock,
  REASONING_ACTIVITY_KIND,
  REASONING_FLUSH_CHARS,
  reasoningActivity,
  reasoningActivityId,
  shouldFlushReasoning,
  type ReasoningBlock,
} from "./reasoningBlocks.ts";

const bloc = (surcharge: Partial<ReasoningBlock> = {}): ReasoningBlock => ({
  ...openReasoningBlock({
    openingEventId: "evt-42",
    createdAt: "2026-08-02T10:00:00.000Z",
    sequence: 7,
  }),
  ...surcharge,
});

describe("les blocs de réflexion", () => {
  it("accumule les deltas dans l'ordre où ils arrivent", () => {
    let etat = bloc();
    for (const morceau of ["Je ", "cherche ", "la cause."]) {
      etat = appendReasoningDelta(etat, morceau);
    }
    expect(etat.text).toBe("Je cherche la cause.");
    expect(etat.truncated).toBe(false);
  });

  it("ignore un delta vide sans rien changer", () => {
    const avant = appendReasoningDelta(bloc(), "abc");
    expect(appendReasoningDelta(avant, "")).toBe(avant);
  });

  it("émet dès le PREMIER caractère, sinon une réflexion courte n'apparaîtrait jamais", () => {
    // Le cas qui motive la règle : une pensée plus courte que le seuil. Sans
    // cette sortie anticipée, elle resterait invisible jusqu'à la fermeture.
    const court = appendReasoningDelta(bloc(), "Court.");
    expect(court.text.length).toBeLessThan(REASONING_FLUSH_CHARS);
    expect(shouldFlushReasoning(court)).toBe(true);
  });

  it("n'émet rien tant qu'il n'y a pas un seul caractère", () => {
    expect(shouldFlushReasoning(bloc())).toBe(false);
  });

  it("ne ré-émet qu'une fois le seuil franchi", () => {
    const premier = markReasoningFlushed(appendReasoningDelta(bloc(), "a".repeat(10)));
    expect(shouldFlushReasoning(premier)).toBe(false);

    const presque = appendReasoningDelta(premier, "b".repeat(REASONING_FLUSH_CHARS - 1));
    expect(shouldFlushReasoning(presque)).toBe(false);

    const franchi = appendReasoningDelta(presque, "b");
    expect(shouldFlushReasoning(franchi)).toBe(true);
  });

  describe("le plafond, qui doit se VOIR", () => {
    it("garde le début, coupe la fin, et compte ce qu'il a refusé", () => {
      const plein = appendReasoningDelta(bloc(), "x".repeat(MAX_REASONING_CHARS - 5));
      const deborde = appendReasoningDelta(plein, "y".repeat(25));

      expect(deborde.text.length).toBe(MAX_REASONING_CHARS);
      // Le début est intact : c'est là que le modèle pose son raisonnement.
      expect(deborde.text.startsWith("x")).toBe(true);
      expect(deborde.text.endsWith("yyyyy")).toBe(true);
      expect(deborde.truncated).toBe(true);
      expect(deborde.droppedChars).toBe(20);
    });

    it("continue de compter les caractères refusés une fois plein", () => {
      const plein = appendReasoningDelta(bloc(), "x".repeat(MAX_REASONING_CHARS));
      const encore = appendReasoningDelta(appendReasoningDelta(plein, "abc"), "de");

      expect(encore.text.length).toBe(MAX_REASONING_CHARS);
      expect(encore.droppedChars).toBe(5);
    });

    it("dit sa limite ET la demande dans la charge — un agent doit pouvoir réparer", () => {
      const deborde = appendReasoningDelta(
        appendReasoningDelta(bloc(), "x".repeat(MAX_REASONING_CHARS)),
        "y".repeat(12),
      );
      const charge = reasoningActivity({ turnId: null, block: deborde }).payload as Record<
        string,
        unknown
      >;

      expect(charge.truncated).toBe(true);
      expect(charge.limit).toBe(MAX_REASONING_CHARS);
      expect(charge.droppedChars).toBe(12);
    });

    it("ne parle pas de troncature quand il n'y en a pas", () => {
      const charge = reasoningActivity({
        turnId: null,
        block: appendReasoningDelta(bloc(), "court"),
      }).payload as Record<string, unknown>;

      expect(charge.truncated).toBeUndefined();
      expect(charge.limit).toBeUndefined();
      expect(charge.charCount).toBe(5);
    });
  });

  describe("l'identité de l'activité", () => {
    it("garde le MÊME id d'un flux au suivant — c'est ce qui fait le streaming", () => {
      // Ré-émettre le même id REMPLACE l'activité au lieu de l'empiler
      // (projector.ts filtre sur l'id avant d'ajouter). Si cet id bougeait, le
      // fil se remplirait d'une ligne par flux.
      const debut = appendReasoningDelta(bloc(), "Je ");
      const suite = appendReasoningDelta(markReasoningFlushed(debut), "cherche.");

      const a = reasoningActivity({ turnId: null, block: debut });
      const b = reasoningActivity({ turnId: null, block: suite });

      expect(a.id).toBe(b.id);
      expect(b.payload).toMatchObject({ detail: "Je cherche." });
    });

    it("se range là où la PENSÉE a commencé, pas par ordre alphabétique", () => {
      // La morsure du 02/08 : personne n'écrit `sessionSequence` dans ce dépôt,
      // donc l'ordre retombe sur createdAt puis sur l'ID. Un id inventé
      // (« reasoning:… ») se rangeait alphabétiquement parmi les ids
      // d'événements, et une pensée sautait par-dessus l'outil qu'elle suivait.
      // Hériter de l'id du premier delta remet la ligne à sa place.
      const avant = reasoningActivityId("evt-100");
      const outil = "evt-200";
      const apres = reasoningActivityId("evt-300");

      expect([apres, outil, avant].toSorted()).toEqual([avant, outil, apres]);
    });

    it("donne des id DIFFÉRENTS à deux blocs ouverts sur des événements différents", () => {
      expect(reasoningActivityId("evt-1")).not.toBe(reasoningActivityId("evt-2"));
    });

    it("fige createdAt et sequence, sinon la ligne saute à chaque flux", () => {
      // L'ordre se joue sur sequence puis createdAt. Les rafraîchir à chaque
      // ré-émission ferait redescendre la réflexion sous des outils déjà
      // affichés — elle doublerait le travail qu'elle a précédé.
      const debut = appendReasoningDelta(bloc(), "a");
      const plusTard = appendReasoningDelta(markReasoningFlushed(debut), "b".repeat(200));

      const a = reasoningActivity({ turnId: null, block: debut });
      const b = reasoningActivity({ turnId: null, block: plusTard });

      expect(b.createdAt).toBe(a.createdAt);
      expect(b.sequence).toBe(a.sequence);
    });

    it("omet sequence quand le flux n'en fournit pas, plutôt que d'en inventer un", () => {
      // Une activité SANS sequence se trie avant toutes celles qui en ont. Un
      // faux numéro la placerait au mauvais endroit ; un zéro serait un chiffre
      // inventé.
      const sansNumero = openReasoningBlock({
        openingEventId: "evt-42",
        createdAt: "2026-08-02T10:00:00.000Z",
        sequence: undefined,
      });
      const activite = reasoningActivity({
        turnId: null,
        block: appendReasoningDelta(sansNumero, "a"),
      });

      expect(activite.sequence).toBeUndefined();
    });

    it("porte le ton info et le kind qui sert au rendu — jamais le ton thinking", () => {
      // « thinking » est DÉJÀ le ton des sous-agents (task.progress) côté client
      // et il pilote l'icône bot. Le réutiliser confondrait « le modèle pense »
      // et « un sous-agent travaille ».
      const activite = reasoningActivity({
        turnId: null,
        block: appendReasoningDelta(bloc(), "a"),
      });

      expect(activite.tone).toBe("info");
      expect(activite.kind).toBe(REASONING_ACTIVITY_KIND);
    });
  });
});
