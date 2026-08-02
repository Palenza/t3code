# Qui fait mieux, et qu'est-ce qu'on fusionne — superpowers · gstack · Hermès · nous

Confrontation tête-à-tête, aspect par aspect. Chaque ligne porte un VERDICT
(qui est meilleur, pourquoi) et un GESTE : **fusionner**, **séparer**,
**reconstruire**, ou **garder**.

## L'avertissement qui empêche la comparaison de mentir

Les quatre ne sont pas la même espèce. Comparer sans le dire fausse tout :

|                 | ce que c'est vraiment                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **superpowers** | un FRAMEWORK de méthode — 14 skills markdown, agnostique du modèle                                                                                    |
| **gstack**      | une SUITE d'outils pour agents de code — 59 skills + un moteur de navigateur                                                                          |
| **Hermès**      | un AGENT à skills, celui qu'on a absorbé — méthode + ~284 skills de capacité                                                                          |
| **nous**        | deux choses distinctes : **Raptor** (le HARNAIS, fork de pingdotgg) et **Palenza** (le PRODUIT, dont 18 skills + 17 agents pilotent le développement) |

Donc « nous » sur la MÉTHODE = les skills/agents Palenza ; « nous » sur
l'ARCHITECTURE = Raptor. Je le précise à chaque ligne.

---

# PARTIE 1 — les quatre méthodes convergentes

## 1 · Débogage par cause racine

|                                    | forme                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| superpowers `systematic-debugging` | **Loi de fer** : « AUCUN correctif sans enquête de cause racine ». 4 phases, chacune obligatoire. Générale, tout bug. |
| Hermès `systematic-debugging`      | 4 phases identiques (dérivé de superpowers, ou convergent).                                                           |
| gstack `investigate`               | enquête de cause racine (workflow).                                                                                   |
| **nous** `debug-navigateur`        | ÉTROIT (bug navigateur/runtime) mais PROFOND : pilote un vrai navigateur, reproduit LUI-MÊME, zéro aller-retour.      |

**Verdict** : superpowers gagne en GÉNÉRALITÉ (la loi de fer sur tout bug) ;
nous gagnons sur le CAS navigateur (outillage de reproduction réel qu'aucun
autre n'a). **GESTE : fusionner.** Adopter la loi de fer + les 4 phases comme
skill général ; garder `debug-navigateur` comme la spécialisation qui
reproduit. L'un est le principe, l'autre la main.

## 2 · Test avant code

|                                       | forme                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| superpowers `test-driven-development` | **Loi de fer** : « AUCUN code de prod sans test qui échoue d'abord. Écrit du code avant ? Supprime-le. » La plus dure.                                |
| Hermès `test-driven-development`      | RED-GREEN-REFACTOR imposé.                                                                                                                            |
| **nous** M11 + A4 + goldens           | les goldens font foi ; un rouge parle de MON changement. ET — cette nuit — **preuve par mutation** : je casse la règle pour prouver que le test mord. |

**Verdict** : superpowers gagne sur la loi de fer (delete-if-written-first) ;
**nous gagnons sur la preuve par mutation** — vérifier que le test échoue quand
la règle tombe, ce que personne d'autre ne nomme. **GESTE : fusionner.** Leur
loi de fer + notre mutation-preuve = plus fort que chacun seul.

## 3 · Revue avant merge

|             | forme                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gstack      | revue MULTI-LENTILLE au stade PLAN : `plan-ceo-review`, `plan-eng-review`, `plan-design-review`, `plan-devex-review` — AVANT de construire.                                            |
| superpowers | `requesting` + `receiving` SÉPARÉS ; le relecteur reçoit un contexte forgé, jamais l'historique de session ; recevoir = « vérifie avant d'implémenter, pas d'accord de complaisance ». |
| **nous**    | `revue-prevol` (délègue à `revue-tech` + `revue-produit`, multi-lentille) + `challenger` (adversarial steelman + attaque). Au stade CODE.                                              |

**Verdict** : gstack gagne sur le MOMENT (revue au plan, avant de coder — moins
cher) ; superpowers gagne sur la DISCIPLINE DE RÉCEPTION (comment encaisser une
critique) ; **notre unique est `challenger`** (adversarial, personne ne l'a).
**GESTE : fusionner** la revue multi-lentille AU PLAN (gstack) + la discipline
de réception (superpowers), et **garder** `challenger`.

## 4 · Plan / spec

|                                             | forme                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| superpowers `brainstorming`→`writing-plans` | HARD-GATE (rien avant design approuvé), 2-3 approches, spec dans un FICHIER DATÉ, plan avec **File Map** (fichiers à créer décidés d'avance) + cases à cocher, écrit POUR être exécuté par un agent. |
| InsForge (applique superpowers)             | plans de 128 Ko en prod, « REQUIRED: superpowers:subagent-driven-development ».                                                                                                                      |
| **nous** `spec-avant-code`                  | interview 5-7 questions + **grill incorporé** (le contrôle adversarial SORT avec la spec) + goldens à prévoir.                                                                                       |

**Verdict** : superpowers gagne sur l'ARTEFACT (fichier daté + File Map,
exécutable par agent) ; **nous gagnons sur le grill incorporé** (contrôle
adversarial intégré à la spec, pas une étape oubliable). **GESTE : fusionner.**
Leur artefact daté à File Map + notre grill incorporé.

**Le fait qui domine la partie 1 : quatre convergences = les formes sont
justes. On ne prend aucune skill, on prend le meilleur de chaque forme.**

---

# PARTIE 2 — les aspects où l'on DIFFÈRE

## Moat (ce qui protège)

|             | leur moat                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| superpowers | la MÉTHODE elle-même, adoptée (264 k★). Aucun code propriétaire — le moat est l'adhésion.                                                                                                       |
| gstack      | le moteur de NAVIGATEUR intégré + la suite qui verrouille un flux complet.                                                                                                                      |
| Hermès      | les skills de CAPACITÉ (Apple, mlops, créatif) — l'intégration au poste.                                                                                                                        |
| **Raptor**  | **comptes Max personnels en rotation** (économie de tokens que personne d'autre n'a) + le multi-fournisseur natif. **Palenza** : l'honnêteté prouvée des données (H1-H6), le vrai moat produit. |

**Verdict** : nos deux moats sont RÉELS et distincts — l'un économique (Max en
rotation), l'autre de confiance (données prouvées). Aucun des trois ne les a.
**GESTE : garder, ne rien fusionner.** C'est ce qui nous rend uniques ;
l'importation le diluerait.

## Promesses (ce qu'ils vendent)

|             | la promesse                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| pi          | « noyau minimal, tout en extension » — PAS de MCP/sous-agents/permissions.                                                               |
| gstack      | « ship faster with a full agent toolchain ».                                                                                             |
| superpowers | « an agentic skills framework that WORKS ».                                                                                              |
| **nous**    | Raptor : un produit COMPLET (l'inverse du minimalisme de pi). Palenza : « la reco au meilleur rapport qualité-prix, sur de VRAIS avis ». |

**Verdict** : le minimalisme de pi est l'ANTI-nous — l'adopter serait démonter
Raptor. **GESTE : séparer** (rejet net, déjà acté). Notre promesse de complétude
est un choix, pas un retard.

## Updates / versionnage

|             | comment                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gstack      | `gstack-update-check` dans le préambule de CHAQUE skill + VERSION + CHANGELOG. L'agent voit qu'il est périmé.                                                                                               |
| superpowers | RELEASE-NOTES.md, versionné.                                                                                                                                                                                |
| **Raptor**  | `selfUpdate.ts` — le BINAIRE se met à jour (et l'amont vient de corriger un rollback au redémarrage). **Palenza** : skills versionnées (1.0 → 4.0.2), mais **aucun check de péremption affiché à l'agent**. |

**Verdict** : Raptor gagne sur l'auto-update du binaire ; **gstack gagne sur la
péremption VISIBLE d'une skill** — l'agent sait qu'une skill a vieilli. On ne
l'a pas. **GESTE : fusionner** — un check « cette skill a une version plus
récente » dans le préambule, léger, comme gstack.

## Fonctionnalités (ce qui existe et qu'on n'a pas)

Déjà détaillé dans `VEILLE-NOTEE-100.md`. Le tri par GESTE :

- **fusionner** : registre de coût (amont), bac à sable Seatbelt (gemini-cli),
  `freeze` (gstack), surcouches par modèle (gstack).
- **reconstruire chez nous** : la défense anti-injection en couches (on a la L1-L3,
  il manque canari + classifieur) ; le détecteur de cache (fait ce tour).
- **séparer (refus)** : tout InsForge (backend), la couche modèles de pi (on a Max),
  le CBOR (relais mobile déjà là).

## Architecture

|            | forme                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pi         | 9 paquets, noyau + extensions, protocole CBOR distant.                                                                                                                                     |
| gstack     | suite de skills + daemon navigateur.                                                                                                                                                       |
| **Raptor** | Electron + Effect v4 + monorepo (desktop/server/web/mobile) + SDK claude-agent wrappé, comptes en rotation. Et **une v2 d'orchestration non fusionnée** (`orchestration-v2`) chez l'amont. |

**Verdict** : notre architecture est plus lourde MAIS complète et testée
(193 383 lignes de tests, ratio qu'aucun des trois n'approche). **GESTE :
garder**, et **décider** `orchestration-v2` + `subagent-obs` ensemble (un
chantier à deux étages, pas encore tranché).

## Ce qui nous rend uniques (à ne JAMAIS diluer)

1. **Comptes Max en rotation** — l'économie de tokens, absente partout ailleurs.
2. **La preuve par mutation** — on prouve que le test mord, pas juste qu'il passe.
3. **`challenger`** — la revue adversariale steelman+attaque.
4. **Les trois étages de garde** (test → appelant → exécution) construits cette nuit.
5. **L'honnêteté des données prouvée** (côté Palenza) — le moat produit.

**GESTE : garder, et s'en servir comme filtre.** Toute importation qui affaiblit
l'un de ces cinq est refusée d'office.

## Documentation

|                      | forme                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| superpowers/InsForge | le PLAN est la doc — fichier daté, File Map, exécutable.                                                         |
| gstack               | `document-generate` + `document-release` (doc post-ship automatique).                                            |
| **nous**             | DECISIONS.md daté, ADN-PRODUIT, PRINCIPES, + la LOI (CLAUDE.md). Riche en INTENTION, plus pauvre en doc GÉNÉRÉE. |

**Verdict** : nous gagnons sur la doc de DÉCISION (pourquoi) ; gstack gagne sur
la doc GÉNÉRÉE (post-ship, automatique). **GESTE : fusionner** l'idée d'une
doc post-livraison générée, MAIS sous notre règle H1 (rien d'affiché comme un
fait sans preuve — donc doc générée = brouillon, jamais publiée telle quelle).

## Process

|             | forme                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| superpowers | le process EST le produit : brainstorm→plan→exécute→revue→finit, chaque étage une skill, avec loi de fer.                                                              |
| gstack      | `ship` / `land-and-deploy` / `canary` — un pipeline de livraison verrouillé.                                                                                           |
| **nous**    | la LOI (CLAUDE.md) + paliers deploy (D1-D5) + anti-erreur (stop-the-line) + `livraison-propre`. Process fort, mais **oral/textuel** là où eux le mécanisent en skills. |

**Verdict** : match nul sur la rigueur ; **eux gagnent sur la MÉCANISATION** —
leur process est une skill qui s'exécute, le nôtre est une règle qu'on doit se
rappeler. C'est exactement ce que notre propre doctrine anti-erreur demande
(« mécanisable → hook, la règle texte est interdite si un hook est possible »).
**GESTE : reconstruire** nos process-clés en skills exécutables plutôt qu'en
règles à mémoriser — en commençant par `verification-before-completion` (la
plus chère, cf. `RECHERCHE-CLOSE.md`).

---

# LA SYNTHÈSE — le tableau des gestes

| aspect                | qui gagne                                                      | geste                                               |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| débogage cause racine | superpowers (général) + nous (navigateur)                      | **fusionner**                                       |
| test avant code       | superpowers (loi de fer) + nous (mutation)                     | **fusionner**                                       |
| revue                 | gstack (au plan) + superpowers (réception) + nous (challenger) | **fusionner + garder**                              |
| plan/spec             | superpowers (artefact) + nous (grill)                          | **fusionner**                                       |
| moat                  | nous (Max + honnêteté)                                         | **garder**                                          |
| promesse              | nous (complétude)                                              | **séparer** du minimalisme                          |
| updates               | Raptor (binaire) + gstack (péremption skill)                   | **fusionner**                                       |
| fonctionnalités       | variable                                                       | fusionner / reconstruire / refuser (voir NOTEE-100) |
| architecture          | nous (testée)                                                  | **garder** + décider orchestration-v2               |
| unicité               | nous (5 points)                                                | **garder**, filtre de refus                         |
| documentation         | nous (décision) + gstack (générée)                             | **fusionner** sous H1                               |
| process               | eux (mécanisé)                                                 | **reconstruire** en skills exécutables              |

**Le fil qui traverse tout** : on ne gagne presque jamais en IMPORTANT — on
gagne en FUSIONNANT leur forme la plus dure avec notre preuve la plus stricte,
et en REFUSANT ce qui dilue nos cinq unicités. Le seul aspect où l'on est
franchement derrière, c'est la MÉCANISATION du process : nos règles sont
justes mais vivent en texte là où eux les font tourner. C'est le chantier le
plus rentable, et il commence par la porte de vérification.
