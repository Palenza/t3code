# La réflexion du modèle, visible dans Raptor

> Demande d'Enzo (02/08) : « quand tu parles à l'IA ou avec tes agents, il n'y a
> pas de texte de réflexion […] je veux la même logique que Claude Code ».

## Où ça meurt aujourd'hui

Le flux de réflexion arrive **vivant et typé** jusqu'à l'orchestration, chez les
trois fournisseurs :

| Étage | Preuve |
|---|---|
| Contrat | `RuntimeContentStreamKind` contient `"reasoning_text"` — `packages/contracts/src/providerRuntime.ts:83` |
| Claude | `streamKindFromDeltaType` : `deltaType.includes("thinking") → "reasoning_text"` — `ClaudeAdapter.ts:1042` |
| Codex | `CodexAdapter.ts:995` |
| OpenCode | `OpenCodeAdapter.ts:403` |
| **Ingestion** | ⛔ `ProviderRuntimeIngestion.ts:1655` |

La coupure, mot pour mot :

```ts
const assistantDelta =
  event.type === "content.delta" && event.payload.streamKind === "assistant_text"
    ? event.payload.delta
    : undefined;
```

Toute autre valeur retombe sur `undefined` et le garde `if (assistantDelta && …)`
l'ignore. **Pas de `else`, pas de TODO, pas de branche commentée : un abandon
silencieux.** Une seule ligne sépare Raptor de la fonctionnalité, et elle sert
les trois fournisseurs d'un coup.

Deuxième porte fermée sur le même sujet, plus discrète : `item.updated` /
`item.completed` / `item.started` commencent tous par
`if (!isToolLifecycleItemType(event.payload.itemType)) return [];`
(`:642`, `:678`, `:701`), et `"reasoning"` n'est pas dans
`TOOL_LIFECYCLE_ITEM_TYPES`. L'item `reasoning` de Codex est jeté lui aussi.

## Le porteur : une ACTIVITÉ, pas un message

Trois voies étaient possibles. Le choix ne s'est pas fait au goût :

**(a) un champ sur le message d'assistant** — `OrchestrationMessage.text` est une
chaîne plate, sans notion de « part ». Ajouter un champ coûte une migration SQL
037, touche 11 fichiers, et **duplique la règle d'append** (`projector.ts:478`
pour le read model mémoire, `ProjectionPipeline.ts:897` pour SQL) : en oublier un
fait diverger les deux modèles. Effet de bord silencieux en prime — le trigger
FTS `AFTER UPDATE ON projection_thread_messages` (`036_ThreadMessagesFts.ts:85`)
réindexerait à chaque jeton de réflexion.

**(b) un rôle de message nouveau** — écartée sèchement. `OrchestrationMessageRole`
est un `Schema.Literals` **fermé** à trois valeurs, partagé avec le mobile. Une
valeur hors énumération fait échouer le décodage Effect Schema **sur tout le
fil**, pas sur le seul message fautif. Un téléphone pas à jour n'affiche plus
rien.

**(c) une activité de fil avec un `kind` nouveau** — retenue. `kind` est un
`TrimmedNonEmptyString` **ouvert** (`orchestration.ts:318`), `payload` est
`Schema.Unknown` (`:320`), `payload_json` est déjà un TEXT libre
(`005_Projections.ts:55`). Zéro schéma élargi, zéro migration. La diffusion
temps réel marche déjà : `thread.activity-appended` est dans `isThreadDetailEvent`
(`ws.ts:281`).

## Ce qui rend le streaming possible sans rien inventer

`projector.ts:738-741` :

```ts
const activities = [
  ...thread.activities.filter((entry) => entry.id !== payload.activity.id),
  payload.activity,
]
```

**Ré-émettre une activité avec le même id la remplace.** `thread.activity.append`
est déjà un upsert. La réflexion coule donc en ré-appendant le même id avec le
texte accumulé — sans nouvelle commande, sans schéma, sans migration.

## Le ton : surtout PAS « thinking »

`OrchestrationThreadActivityTone` est fermé à `info | tool | approval | error`
(`orchestration.ts:307`). Le ton `"thinking"` du journal est **purement client**
et **déjà pris** : `session-logic.ts:758` le fabrique pour `task.progress`,
`BackgroundTasksSection.tsx:105` pour `task.started`, et le mobile fait le même
mappage (`threadActivity.ts:292`). Il signifie « un sous-agent travaille », et il
pilote l'icône `bot` (`MessagesTimeline.tsx:1878`).

Le réutiliser confondrait deux choses distinctes et détournerait le panneau des
agents. On garde donc le ton `info` et on distingue au rendu par
`sourceActivityKind` — précédent déjà en place pour `runtime.warning`
(`MessagesTimeline.tsx:2005`).

## Pourquoi ce sera VISIBLE (les deux filtres vérifiés)

Une ligne peut exister et rester invisible. Les deux filtres du chemin ont été
vérifiés :

1. `MessagesTimeline.logic.ts:478` jette les entrées « neutres ». Une entrée de
   ton `info`, sans commande ni `itemType`, n'est pas *tool-like*
   (`session-logic.ts:154`) — donc `workEntryIndicatesToolNeutralStatus` rend
   `false` et **elle survit**.
2. `MAX_VISIBLE_WORK_LOG_ENTRIES = 1` ne montre que la **dernière** ligne d'un
   groupe. Pendant que la réflexion coule, c'est elle la dernière : elle
   s'affiche. Puis elle se replie quand le travail reprend — exactement le
   comportement de Claude Code, et **sans toucher au repli**.

## Le découpage en blocs

Les deltas de réflexion de Claude ne portent **aucun `itemId`** :
`ClaudeAdapter.ts:2182` ne renseigne `assistantBlockEntry` que si un bloc de
texte existe déjà pour cet index, ce qui n'arrive jamais pour une pensée.

Sans repère, réflexion → outil → réflexion fusionnerait en un seul bloc, et la
seconde pensée remonterait **au-dessus** de l'outil. On tient donc un bloc
« ouvert » par tour, et on le FERME dès qu'autre chose de visible sort : un
delta de texte d'assistant, ou une activité. Le bloc suivant prend l'index
d'après. L'ordre est préservé sans toucher aux adaptateurs.

## Le débit

Ré-appender à chaque jeton envoie le texte **entier** à chaque fois : coût
quadratique. On n'émet donc que tous les `REASONING_FLUSH_CHARS` caractères
accumulés, plus une émission finale à la fermeture du bloc. Seuil en
caractères, pas en millisecondes : déterministe, testable sans horloge simulée.

Plafond par bloc, et il se VOIT (A7) : au-delà, le payload porte `truncated` et
le nombre de caractères réellement produits — une limite silencieuse est pire
que pas de limite.

## Ce que ça ne fait pas

- Le mobile affichera la ligne en générique (icône par défaut) tant qu'il ne
  connaît pas le `kind`. Ce n'est pas une régression — c'est du contenu nouveau
  rendu sobrement — mais ce n'est pas la parité.
- L'item `reasoning` de Codex (la seconde porte fermée) reste fermé : le flux
  `reasoning_text` de Codex passe déjà par le chemin des deltas, l'item est
  redondant. On ne l'ouvre pas pour un problème qu'on n'a pas.
