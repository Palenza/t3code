/**
 * LA RÉFLEXION DU MODÈLE DOIT ARRIVER JUSQU'AU PIXEL.
 *
 * Le serveur sait l'émettre depuis le 02/08 — ce n'est pas ce que ce fichier
 * garde. Il garde la moitié qu'on ne voit pas dans un diff : une ligne peut
 * exister dans le modèle de données et rester INVISIBLE à l'écran, sans qu'un
 * seul test ne rougisse.
 *
 * Deux filtres se tiennent sur ce chemin, et aucun ne parle de réflexion :
 *
 *   1. `deriveMessagesTimelineRows` jette les entrées « neutres »
 *      (`workEntryIndicatesToolNeutralStatus`). Une entrée de ton `info` sans
 *      commande ni `itemType` n'est pas *tool-like*, donc elle survit — mais
 *      il suffirait qu'on donne un `itemType` à la réflexion, ou qu'on la
 *      passe en ton `tool`, pour qu'elle disparaisse en silence.
 *   2. `MAX_VISIBLE_WORK_LOG_ENTRIES` ne montre que la DERNIÈRE ligne d'un
 *      groupe. Pendant que la pensée coule, c'est elle la dernière : elle
 *      s'affiche, puis se replie quand le travail reprend.
 *
 * Ces tests exercent le chemin RÉEL — les fonctions que l'écran appelle — et
 * pas une reconstitution.
 */
import {
  EventId,
  REASONING_ACTIVITY_KIND,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveMessagesTimelineRows } from "./components/chat/MessagesTimeline.logic.ts";
import {
  deriveTimelineEntries,
  deriveWorkLogEntries,
  workEntryIndicatesToolNeutralStatus,
} from "./session-logic.ts";

const PENSEE = "Je relis le diff avant de toucher au golden.";

/** Le fil tel que l'écran le calcule, sans tour en cours ni diff. */
function lignesDuFil(entrees: ReturnType<typeof deriveTimelineEntries>) {
  return deriveMessagesTimelineRows({
    timelineEntries: entrees,
    latestTurn: null,
    isWorking: false,
    activeTurnStartedAt: null,
    turnDiffSummaryByAssistantMessageId: new Map(),
    revertTurnCountByUserMessageId: new Map(),
  });
}

function activiteDeReflexion(
  surcharge: { readonly id?: string; readonly createdAt?: string; readonly detail?: string } = {},
): OrchestrationThreadActivity {
  return {
    id: EventId.make(surcharge.id ?? "evt-pensee#reasoning"),
    createdAt: surcharge.createdAt ?? "2026-08-02T00:00:01.000Z",
    kind: REASONING_ACTIVITY_KIND,
    summary: "Thinking",
    tone: "info",
    // Le texte voyage sous `detail` : c'est le champ que le client extrait
    // déjà pour l'aperçu de ligne et pour le corps repliable.
    payload: { detail: surcharge.detail ?? PENSEE, charCount: (surcharge.detail ?? PENSEE).length },
    turnId: null,
  };
}

describe("la réflexion arrive jusqu'à l'écran", () => {
  it("devient une entrée de journal qui PORTE le texte", () => {
    const [entree] = deriveWorkLogEntries([activiteDeReflexion()]);

    expect(entree?.label).toBe("Thinking");
    expect(entree?.detail).toBe(PENSEE);
    // Le rendu se branche sur le kind, pas sur le ton : c'est ce qui lui donne
    // son icône propre sans réutiliser « thinking », déjà pris par les agents.
    expect(entree?.sourceActivityKind).toBe(REASONING_ACTIVITY_KIND);
    expect(entree?.tone).toBe("info");
  });

  it("échappe au filtre des entrées neutres, qui l'effacerait sans un mot", () => {
    const [entree] = deriveWorkLogEntries([activiteDeReflexion()]);
    expect(entree).toBeDefined();
    expect(workEntryIndicatesToolNeutralStatus(entree!)).toBe(false);
  });

  it("ressort bien comme une LIGNE VISIBLE du fil, pas seulement du modèle", () => {
    const entrees = deriveTimelineEntries([], [], deriveWorkLogEntries([activiteDeReflexion()]));
    const lignes = lignesDuFil(entrees);

    const ligne = lignes.find((candidate) => candidate.kind === "work");
    expect(ligne, "la réflexion n'a produit aucune ligne visible").toBeDefined();
    expect(
      ligne?.kind === "work" ? ligne.groupedEntries.map((entree) => entree.detail) : [],
    ).toEqual([PENSEE]);
  });

  it("reste la DERNIÈRE ligne quand elle coule, donc celle qu'on voit", () => {
    // MAX_VISIBLE_WORK_LOG_ENTRIES vaut 1 : d'un groupe de lignes de travail,
    // seule la dernière s'affiche. Une pensée en cours est la dernière — c'est
    // ce qui la rend visible sans toucher au repli.
    const entrees = deriveTimelineEntries(
      [],
      [],
      deriveWorkLogEntries([
        activiteDeReflexion({ id: "evt-tot#reasoning", createdAt: "2026-08-02T00:00:01.000Z" }),
        activiteDeReflexion({
          id: "evt-tard#reasoning",
          createdAt: "2026-08-02T00:00:09.000Z",
          detail: "La plus récente.",
        }),
      ]),
    );
    const lignes = lignesDuFil(entrees);

    const visibles = lignes.flatMap((ligne) =>
      ligne.kind === "work" ? ligne.groupedEntries.map((entree) => entree.detail) : [],
    );
    expect(visibles).toContain("La plus récente.");
  });
});
