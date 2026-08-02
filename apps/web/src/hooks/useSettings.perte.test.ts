/**
 * UN RÉGLAGE QUI NE PART NULLE PART DOIT LE DIRE.
 *
 * `useUpdateSettingsTarget` routait les patches serveur vers le RPC — et,
 * quand aucun environnement n'était joint, il ne faisait RIEN. Pas de toast,
 * pas de journal, pas de retour en arrière visuel. L'interrupteur basculait,
 * l'utilisateur croyait avoir réglé quelque chose, et rien n'était écrit.
 *
 * Tous les réglages serveur étaient concernés : le streaming de l'assistant,
 * le mode des nouveaux fils, la politique d'activité de fond, le modèle de
 * génération de texte.
 *
 * C'est la pire panne possible sur un écran de Réglages, parce qu'elle
 * ressemble exactement à un succès : elle ne laisse ni rouge, ni exception,
 * ni trace. Ces tests figent la règle qui la rend bruyante.
 */
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { clesDeReglagePerdues } from "./useSettings";

const UN_ENVIRONNEMENT = EnvironmentId.make("env-1");

describe("les réglages qui ne peuvent pas être enregistrés", () => {
  it("nomme CHAQUE clé perdue quand aucun environnement n'est joint", () => {
    // Le message doit permettre de réparer. « Ça n'a pas marché » ne se répare
    // pas ; « enableAssistantStreaming n'a pas été enregistré », si.
    expect(
      clesDeReglagePerdues({
        serverPatch: { enableAssistantStreaming: true, newWorktreesStartFromOrigin: false },
        environmentId: null,
      }),
    ).toEqual(["enableAssistantStreaming", "newWorktreesStartFromOrigin"]);
  });

  it("ne crie pas quand un environnement est joint", () => {
    expect(
      clesDeReglagePerdues({
        serverPatch: { enableAssistantStreaming: true },
        environmentId: UN_ENVIRONNEMENT,
      }),
    ).toEqual([]);
  });

  it("ne crie pas pour un patch serveur VIDE, même sans environnement", () => {
    // Régler un réglage purement client sans backend est parfaitement normal —
    // le thème, le retour à la ligne. Crier là-dessus apprendrait à ignorer
    // l'alerte, et une alerte qu'on ignore ne protège plus rien.
    expect(clesDeReglagePerdues({ serverPatch: {}, environmentId: null })).toEqual([]);
    expect(clesDeReglagePerdues({ serverPatch: {}, environmentId: UN_ENVIRONNEMENT })).toEqual([]);
  });

  it("compte une clé mise à `false` ou à zéro comme une vraie perte", () => {
    // Un patch qui éteint quelque chose est un patch. Filtrer sur la
    // VÉRACITÉ des valeurs plutôt que sur leur présence laisserait passer
    // exactement les gestes qu'on fait le plus : décocher, remettre à zéro.
    expect(
      clesDeReglagePerdues({
        serverPatch: { enableAssistantStreaming: false },
        environmentId: null,
      }),
    ).toEqual(["enableAssistantStreaming"]);
    expect(
      clesDeReglagePerdues({
        serverPatch: { addProjectBaseDirectory: "" },
        environmentId: null,
      }),
    ).toEqual(["addProjectBaseDirectory"]);
  });

  it("rend les clés dans l'ordre du patch, pour un message stable", () => {
    const patch = {
      defaultThreadEnvMode: "worktree" as const,
      enableProviderUpdateChecks: true,
      addProjectBaseDirectory: "~/code",
    };
    expect(clesDeReglagePerdues({ serverPatch: patch, environmentId: null })).toEqual([
      "defaultThreadEnvMode",
      "enableProviderUpdateChecks",
      "addProjectBaseDirectory",
    ]);
  });
});
