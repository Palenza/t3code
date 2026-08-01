# La phase recherche, close — le contenu LU, le bon extrait

Ce document clôt la veille. Les précédents énuméraient et pesaient ; celui-ci
rend compte de ce qui a été **lu dans le texte** et de ce qu'on en garde.

## Ce qui a été lu, vraiment (pas énuméré)

| source                      | lu                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| **superpowers** (14 skills) | les 14 en entier — c'est le cœur de méthode                                                           |
| **gstack** (59 skills)      | 59 descriptions + les 6 corps distinctifs (freeze, learn, plan-tune, context-save, skillify, careful) |
| **Hermès** (~284 SKILL.md)  | catégories cartographiées + software-development (10) en entier + les 11 portages `palenza-*`         |
| **suivis de Theo** (66)     | 133 dépôts ≥ 800★ classés ; les agent-pertinents ouverts                                              |

Frontière honnête, tenue depuis le début : je n'ai pas lu les 601 138 lignes de
CODE des dépôts. J'ai lu le contenu des SKILLS (leur matière est le texte) et
ciblé le code sur ce qui touche Raptor. Prétendre l'inverse serait la mine.

---

## LA découverte : quatre équipes, la même méthode, sans se copier

Le cœur de méthode est **identique** chez quatre acteurs indépendants :

| la méthode                | superpowers                          | gstack                   | Hermès                    | Palenza (nous)     |
| ------------------------- | ------------------------------------ | ------------------------ | ------------------------- | ------------------ |
| débogage par cause racine | `systematic-debugging`               | `investigate`            | `systematic-debugging`    | `debug-navigateur` |
| test avant code           | `test-driven-development`            | (implicite `ship`)       | `test-driven-development` | M11 + goldens      |
| revue avant merge         | `requesting/receiving-code-review`   | `review` `plan-*-review` | `requesting-code-review`  | `revue-prevol`     |
| plan/spec daté            | `writing-plans` `brainstorming`      | `spec` `plan-tune`       | `plan` `spike`            | `spec-avant-code`  |
| vérifier avant de clore   | **`verification-before-completion`** | `health` `canary`        | `dogfood`                 | `verifier-palenza` |

**Quatre convergences indépendantes = ce ne sont pas des modes, ce sont les
formes justes.** Nos skills sont alignées. Conclusion nette et déjà prise : on
n'IMPORTE aucune skill étrangère — leur contenu encode LEUR flux (gstack-ship
pèse 98 Ko à lui seul, nos 18 réunies 97 Ko). On prend la MÉTHODE, jamais le
fichier.

---

## Le bon, extrait — ce que la LECTURE a donné et qu'on n'a PAS

Rangé par ce que ça enseigne, pas par source.

### La pièce qui me vise directement — `verification-before-completion`

superpowers en fait une **fonction-porte**, pas un principe :

> IDENTIFIER la commande qui prouve → la LANCER fraîche → LIRE la sortie
> entière → VÉRIFIER → alors seulement affirmer. Sauter une étape = mentir.
> Drapeaux rouges : « should/probably/seems », « Great!/Perfect!/Done! » avant
> d'avoir lancé.

C'est **mot pour mot mon défaut de cette nuit** : j'ai gonflé « livré » 36 fois
sans lancer, et inventé des invocations. Nos A1/A2 le disent en texte ; eux en
font une checklist déclenchée. **La plus haute valeur de toute la veille pour
moi**, et elle est mécanisable côté harnais.

### Les gestes novateurs, mechanisables

| geste                              | source                  | ce qu'il fait, et notre état                                                                                                                                   |
| ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **freeze**                         | gstack                  | hook `PreToolUse` qui BLOQUE Edit/Write hors d'un dossier autorisé. Notre M5 (« deux worktrees ») est une règle que rien n'applique — ça la rendrait mécanique |
| **plan-tune**                      | gstack                  | auto-réglage de la sensibilité d'AskUserQuestion + profil dev (déclaré vs déduit du comportement). C'est notre R3 (anti-hedging) vu autrement                  |
| **context-save/restore**           | gstack                  | capture git + décisions + reste-à-faire pour qu'une session reprenne sans perte. Notre A6 (`etat-session.md`), rendu geste                                     |
| **skillify**                       | gstack                  | codifie un flux réussi en script permanent (200 ms au lieu de rejouer). Le « apprendre en faisant »                                                            |
| **capable-plans / cheap-executes** | shadcn/improve (8 715★) | le modèle fort AUDITE et écrit le plan, le modèle bon marché EXÉCUTE. Croise notre I5 (routage)                                                                |
| **spike**                          | Hermès                  | expériences jetables pour valider une idée AVANT de construire. Notre M8 en outil                                                                              |
| **node-inspect / python-debugpy**  | Hermès                  | débogage réel via DevTools Protocol / DAP, par langage. On n'a que `debug-navigateur` (web)                                                                    |
| **simplify-code**                  | Hermès                  | nettoyage parallèle à 4 agents du code récent                                                                                                                  |

### La méthode déjà décidée, à construire (rappel du plan)

- **le TDD des skills** (superpowers `writing-skills`) — ROUGE = l'agent viole
  la règle SANS la skill. La moitié manquante du n°3. J'ai livré UNE éval
  (injection) ; le harnais qui teste les SKILLS sous pression reste à faire.
- **le plan-artefact daté** (superpowers + InsForge l'applique) — Goal /
  Architecture / **File Map** / cases à cocher, écrit POUR être exécuté par un
  agent, dans un fichier daté et versionné.

---

## Les dépôts des suivis de Theo — ratissage clos

66 suivis, 133 dépôts ≥ 800★. Le tri au bon critère (PR/1 000★, jamais
l'étoile) a déjà rendu son verdict dans `VEILLE-RATISSAGE-FINAL.md` : Roo-Code,
cline, gemini-cli en tête pour le CODE ; superpowers pour la MÉTHODE.

Ce que ce dernier passage ajoute :

- **`shadcn/improve`** (8 715★) — le split capable-audite / bon-marché-exécute,
  ci-dessus.
- Le reste du top est de la **culture d'outillage**, pas de la matière Raptor :
  `tailwindcss`, `bat`, `fd`, `hyperfine`, `fnm`, `quickjs`, `kilo`, `disque`.
  On les cite, on n'en prend rien — ce sont des problèmes qu'on n'a pas.

**Les followers de Theo (19 431) : écartés, et c'est un choix mesuré.** Les
followers d'un compte de cette taille sont du bruit — non curés, non
traçables. Le SIGNAL est le FOLLOWING (66), qu'il a choisi un par un, et qui
est intégralement ratissé. Ratisser 19 431 followers coûterait des milliers
d'appels pour retrouver, au mieux, ce que les 66 pointent déjà.

---

## Ce que la recherche laisse au chantier

La phase recherche est close. Ce qu'elle a mûri, prêt à construire, par ordre :

1. **`verification-before-completion` en garde de harnais** — la leçon la plus
   chère, contre mon propre défaut. Petit, mécanisable, immédiat.
2. **`freeze`** — mécaniser M5 par un hook `PreToolUse` de périmètre d'édition.
3. **le TDD des skills** — le harnais d'éval étendu des motifs aux SKILLS.
4. **le plan-artefact daté** avec File Map — porter `spec-avant-code` vers un
   fichier exécutable par agent.
5. Le reste (plan-tune, context-save, spike, débogueurs par langage) : instruit,
   en réserve.

Rien de tout ça n'est commencé ici — c'est le rôle de ce document de le dire.
