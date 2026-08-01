# Analyse notée — 100 % des branches, ce qui est meilleur que chez nous

Dernière passe : au lieu de comparer les `main`, on prend **l'union de tous les
fichiers de toutes les branches**. C'est le seul « 100 % » qui veut dire quelque
chose — le travail non fusionné est justement celui qu'on ne voit jamais.

## La couverture, mesurée

| dépôt                      | fichiers sur `main` | UNION toutes branches | **seulement en branche** |
| -------------------------- | ------------------: | --------------------: | -----------------------: |
| **pingdotgg/t3code** amont |              15 683 |                18 194 |                **2 511** |
| InsForge                   |               1 756 |                 3 028 |                **1 272** |
| pi                         |               1 256 |                 1 542 |                      286 |
| gstack                     |               1 179 |                 1 408 |                      229 |
| superpowers                |                 180 |                   402 |                      222 |
| **TOTAL**                  |          **20 054** |            **24 574** |                **4 520** |

**4 520 fichiers n'existent dans aucun `main`.** Toutes les branches de tous
les dépôts ont été énumérées, aucune n'a échoué.

---

# EXCEPTIONNEL — ça change la façon de travailler

## E1 · `orchestration-v2/` — une v2 de NOTRE cœur, jamais fusionnée

Chez l'amont, en branche seulement, ~1,3 Mo :

| fichier                            |   taille |
| ---------------------------------- | -------: |
| `Adapters/AcpAdapterV2.ts`         | 235,8 ko |
| `Orchestrator.ts`                  | 225,5 ko |
| `Adapters/CodexAdapterV2.ts`       | 211,8 ko |
| `Adapters/ClaudeAdapterV2.ts`      | 177,3 ko |
| `Adapters/OpenCodeAdapterV2.ts`    | 110,5 ko |
| `ProjectionStore.ts`               |  96,9 ko |
| `Adapters/CursorAdapterV2.ts`      |  91,1 ko |
| `contracts/src/orchestrationV2.ts` |  88,8 ko |
| `ProviderSessionManager.ts`        |  67,6 ko |
| **`ClaudeAdapterV2.testkit.ts`**   |  80,2 ko |

Le `testkit` est le détail qui compte : ils ont écrit un **harnais de test dédié
à l'adaptateur**, pas seulement des tests. Nos adaptateurs n'en ont pas.

Et il existe une branche `codex/v1-v2-state-migration` : la migration d'état est
traitée, pas laissée en exercice.

**Pourquoi exceptionnel** : c'est la refonte du module le plus lourd de Raptor
(`ClaudeAdapter.ts` fait déjà des milliers de lignes chez nous), faite par
l'équipe qui connaît le code, et elle attend dans une branche. On est 258
commits devant l'amont — donc plus on attend, plus la reprise coûte.

## E2 · L'enregistrement React Scan AVANT / APRÈS — notre D3, appliqué à la perf

53 fichiers `react-scan` dans l'union, **26 « before » et 26 « after »**,
répartis sur **23 branches distinctes**. Des `.webm` de 800 ko à 2,5 Mo, commités.

Ce n'est pas un outil : c'est une **discipline**. Chaque correctif de
performance de rendu porte sa preuve vidéo avant/après, dans le dépôt.

**Pourquoi exceptionnel** : notre D3 exige déjà « rejouer le cas exact, montrer
AVANT → APRÈS ; pas de diff = pas de fix ». Nous l'appliquons au comportement.
**Eux l'appliquent au RENDU**, là où c'est le plus difficile à prouver et le
plus facile à s'illusionner. Et 26 paires équilibrées disent que la règle tient,
elle n'est pas décorative.

## E3 · Le TDD des skills, et son harnais d'évals

superpowers, déjà décrit dans le plan v2, mais l'union ajoute la preuve
matérielle : `evals/docs/plan.md` (78,7 ko), `evals/docs/design.md`,
`evals/setup_helpers/spec_writing_blind_spot.py`.

Un fichier s'appelle **`spec_writing_blind_spot.py`** : ils outillent la
recherche des angles morts d'une skill.

**Pourquoi exceptionnel** : « si tu n'as pas vu un agent échouer SANS la skill,
tu ne sais pas si la skill enseigne la bonne chose ». C'est la moitié manquante
de notre n°3 livré cette nuit, et c'est la seule méthode vue dans toute la
veille qui juge une skill sans attendre des semaines d'usage.

---

# EXCELLENT — grosse valeur, on ne l'a pas

## X1 · `t3code/local-usage-analytics` — le registre de coût

Déjà décrit (plan v2). L'union confirme qu'il vit entièrement en branche.
Rappel de sa vraie raison d'être : **sans lui, une régression de cache à 10-20×
serait invisible chez nous.**

## X2 · La défense anti-injection en six couches (gstack)

Déjà décrite. Rétrogradée en priorité (notre exposition mesurée : 0,44 % des
appels d'outil), mais la PIÈCE reste excellente — surtout le canari et le
classifieur volontairement aveugle aux résultats d'outil.

## X3 · `subagent-obs/01→05` — l'observabilité des sous-agents

Cinq branches empilées proprement : contrats → adaptateurs → réutilisation →
panneau d'agents → visibilité des fils. Un chantier entier, découpé pour être
relu.

**Pourquoi excellent** : Raptor lance des sous-agents et ne montre presque rien
de ce qu'ils font. Et le découpage lui-même est un modèle de tranche verticale
(notre M4).

## X4 · `docs/superpowers/plans/` — le plan daté comme artefact, validé par DEUX équipes

Découverte de l'union : **InsForge utilise la méthode superpowers**.
`docs/superpowers/plans/2026-04-22-s3-compatible-storage-gateway.md` fait
**127,9 ko**. Plus `2026-03-16-custom-smtp.md` (62,3 ko),
`2026-04-18-compute-cloud-provider.md` (61,9 ko).

**Pourquoi excellent** : ce n'est plus une méthode qu'un dépôt vend, c'est une
méthode qu'un AUTRE dépôt applique en production sur des chantiers de 128 ko de
plan. Et ça rejoint notre `spec-avant-code` — mais chez eux le plan est un
FICHIER DATÉ dans le dépôt, pas une étape de conversation.

---

# TRÈS BON — à prendre quand le moment vient

| #      | quoi                                                          | source                                          | pourquoi                                                                                       |
| ------ | ------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **T1** | Modèle de confiance de projet (`trust-manager`)               | pi `approvals`                                  | Un dépôt cloné exécute hooks et skills. Notre R2 — toujours non instruit                       |
| **T2** | Le juge anti-hedging sur AskUserQuestion                      | gstack, 12 branches                             | Mécanise « une reco, jamais un menu ». Ils épinglent CHAQUE tournure d'esquive par une fixture |
| **T3** | Surcouches de prompt par modèle                               | gstack `model-overlays` + `overlay-fanout-eval` | On route 5 fournisseurs avec un seul jeu d'instructions. Et eux ÉVALUENT l'effet               |
| **T4** | Normaliser aux frontières d'ingestion                         | pi `content-hardening`                          | Trois points d'étranglement plutôt qu'un garde par consommateur. Un principe, pas un correctif |
| **T5** | Compiler une skill pour PLUSIEURS runtimes                    | gstack `.factory/` + `.agents/` + `.claude/`    | La même skill servie à Factory, Codex, Claude. Notre `SKILL.md.tmpl` équivalent n'existe pas   |
| **T6** | `.reference/` — une implémentation de référence dans le dépôt | amont, 39 fichiers                              | Un serveur/web de référence à comparer, versionné                                              |

---

# BON — utile, sans urgence

- **B1** · Replier les groupes d'appels d'outil (`pi/compact-groups`, 234 l.)
- **B2** · Le verrou de session rendu à l'écran (vidéo ICOR) — on a le moteur
  et le reçu (85,2 min sur 583 tours), il manque l'affichage
- **B3** · Export HTML d'une session (`pi/export-html`, 316 l.)
- **B4** · Import de cookies pour les pages authentifiées (`gstack/browse`)
- **B5** · Arbre de session étiqueté et filtrable (`pi/session-manager`, 1 712 l.)
- **B6** · Bancs d'essai d'agents (`AgentBench`) pour chiffrer nos adaptateurs

---

# BONUS · NICE TO HAVE

- Sélecteur de thème au premier lancement, rembourrage de chat configurable,
  curseur natif, repeinte limitée du TUI (`pi` : `theme-selector`, `flex-pad`,
  `native-only-cursor`, `limited-repaint`)
- Annoter une image ou une **frame** de vidéo au lieu de la décrire (vidéo ICOR)
- `npx t3 pair` — un QR code depuis un serveur qui tourne (amont, déjà sur main)
- Le reçu papier après chaque session (r/ClaudeCode, 1 771 points) — inutile,
  mais l'idée que **chaque session laisse un reçu** est la nôtre (A2)

---

# CE QU'ON REFUSE — et R4 est enfin clos pour de bon

## R4, le squelette de skills : mort, et voici la mesure qui le tue

|                                                     | corps de skill |
| --------------------------------------------------- | -------------: |
| gstack `.factory/gstack-ship/SKILL.md`              |   **97 900 o** |
| gstack `plan-ceo-review`                            |       95 200 o |
| superpowers, la plus grosse                         |       28 077 o |
| **Palenza, la plus grosse** (`video-comprehension`) |   **14 489 o** |
| **Palenza, LES 18 RÉUNIES**                         |   **96 907 o** |

**Nos dix-huit skills réunies pèsent moins qu'UNE seule des leurs.** Ils ont
inventé « squelette + sections à la demande » (−59 %) parce qu'ils ont une skill
de 98 ko. Nous n'avons pas cette maladie ; leur remède ne nous soigne de rien.

C'est la deuxième fois que R4 meurt, et cette fois la cause est nette : ce
n'était pas la bonne comparaison. La description (toujours chargée) et le corps
(chargé à l'invocation) sont deux problèmes différents — sur les deux, nous
sommes déjà sous leurs seuils.

## Le reste des refus, inchangé

Tout InsForge en tant que produit · les 1 195 forks (0 commit inconnu) · le
minimalisme de pi · sa couche modèles (55 347 l.) · le protocole CBOR · le
tableau de bord de la vidéo · un `canvas.json` par dossier · les extensions
tierces exécutables · installer Agent-Reach (c'est R2 en chair et en os).

---

# L'ORDRE FINAL

1. **Rattraper l'amont** (16 commits, dont `selfUpdate.ts` que j'ai touché
   cette nuit — conflit certain sur de la logique).
2. **X1 · `local-usage-analytics`** — pas un tableau de bord : le seul détecteur
   d'une facture qui décuple.
3. **E2 · la discipline React Scan avant/après** — la moins chère des trois
   exceptionnelles, et elle étend une règle qu'on a déjà (D3) au seul domaine
   où l'on se ment le plus facilement : le rendu.
4. **E3 · le TDD des skills** — donne à notre n°3 sa moitié manquante.
5. **T1 · instruire la confiance de projet** — une heure, risque asymétrique.
6. **E1 · `orchestration-v2`** — le plus gros morceau. À décider APRÈS le
   rattrapage, parce que sa valeur dépend de ce que l'amont en fera.

**Rien n'est commencé.**
