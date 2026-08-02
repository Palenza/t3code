# Plan v2 — après re-vérification : la meilleure source, c'était notre amont

Cette révision existe parce que la v1 avait un trou béant : **j'ai analysé trois
dépôts étrangers et oublié le nôtre.** `pingdotgg/t3code` est l'AMONT de Raptor.
C'est, de très loin, la source la plus pertinente qui existe — et elle n'était
pas dans le plan.

## Ce que la re-vérification a couvert

| source                       |                        volume | couverture                          |
| ---------------------------- | ----------------------------: | ----------------------------------- |
| **`pingdotgg/t3code`** amont |   792 branches, 790 en avance | **790 diffs · 0 échec**             |
| **`obra/superpowers`**       |        95 branches, 14 skills | **95 diffs · 0 échec**              |
| **org `t3-oss`**             |                      8 dépôts | tous listés                         |
| **abonnements de `t3dotgg`** | 66 comptes → **4 129 dépôts** | tous collectés · 1 compte à 0 dépôt |

Le compte muet est `charliemarsh-oai` : **0 dépôt public**, vérifié. Pas une
panne de collecte.

---

# LA DÉCOUVERTE PRINCIPALE — on est en retard sur notre propre amont

```
travail est DEVANT   upstream/main de 258 commits
travail est DERRIÈRE upstream/main de  16 commits
```

Et parmi les 16 qui nous manquent, il y en a un qui n'attend pas :

> **`ef4ec2ad4` fix(server): self-update no longer rolls itself back on restart (#5095)**
> `apps/server/src/cloud/selfUpdate.ts | 17 ++++++----`

**C'est le fichier que j'ai modifié cette nuit** (n°57, le verdict sur le
travail en vol avant de couper). Ils corrigent le comportement au redémarrage,
je garde le travail en vol — deux changements sur le même fichier, sur le même
sujet. **Le conflit est certain, et il portera sur de la logique, pas sur de la
mise en forme.**

Les 15 autres, dont plusieurs comptent :

| commit                                                           | pourquoi ça compte                         |
| ---------------------------------------------------------------- | ------------------------------------------ |
| `ca72e381c` bound thread catch-up replay, stop full-DB hydration | **performance** — on hydrate toute la base |
| `acf761b2f` render terminals with libghostty-vt                  | gros changement de rendu terminal          |
| `bfc31507f` search threads from the sidebar                      | fonctionnalité visible                     |
| `e5c754706` settings sidebar search                              | idem                                       |
| `61514c129` `npx t3 pair` — QR code depuis un serveur qui tourne | pairage mobile                             |
| `a04198127` / `916cff733` snoozing + fils repliables (mobile)    | idem                                       |
| `491219bf1` les fils avec PR ouverte ne s'auto-classent plus     | correctif de comportement                  |

**Action, et c'est la n°1 du plan : rattraper l'amont, en commençant par
`selfUpdate.ts`** — parce que c'est le seul endroit où mon travail de cette
nuit et le leur se croisent.

---

## Ce que l'amont a DÉJÀ CONSTRUIT et qu'on n'a pas — 790 branches

Répartition thématique, comptée :

| thème                  | branches |
| ---------------------- | -------: |
| fournisseurs & modèles |  **501** |
| performance / mémoire  |  **104** |
| worktree / git / PR    |       99 |
| terminal / ghostty     |       43 |
| mobile                 |       40 |
| checkpoint / reprise   |       25 |
| sécurité / permissions |       18 |
| voix                   |    **0** |

Trois branches valent chacune un chantier :

### A · `t3code/local-usage-analytics` — le suivi de coût, déjà écrit

> « feat(usage): local usage analytics — **durable ledger**, `usage.getSummary`
> RPC, settings page. Records token/cost usage facts from live provider events
> into a **replayable projection** […] exact cost in **integer micro-USD** […]
> projector → `projection_usage_facts` (migration 033). **Deliberately does NOT
> prune on `thread.reverted` (billing history is immutable)** ; thread deletion
> redacts linkage. »

C'est fait, c'est testé, c'est chez nous à un merge près. Et la décision
« l'historique de facturation est immuable » est exactement notre H6 (data lake
à vie, rien ne se jette).

**Ça remplace la moitié de ce que je proposais ailleurs** : pas besoin
d'inventer un suivi de dépense, il existe.

### B · `experiment/hermes-provider` (+ `-ui`) — 71 commits, 35 663 lignes

Ils intègrent **Hermès comme FOURNISSEUR à part entière** : `HermesDriver`,
`HermesAdapter`, `HermesConnectionRegistry`, `HermesEnrollmentStore`,
`HermesGatewayBroker`. Douze correctifs de robustesse (reprise de session hors
du flux de statut, sessions maintenues à l'arrêt de T3, sonde de vivacité qui
ne tue plus les connexions saines, appairage récupérable).

**Le point délicat, et il est pour Enzo** : la LOI Palenza dit
« Hermès — SUSPENDU (ordre fondateur : avance solo) ». L'amont va dans l'autre
sens. Ce n'est pas une contradiction technique, c'est une décision : suivre
l'amont ici, c'est réintroduire Hermès par la porte du fournisseur.
**Je ne tranche pas — ça remonte (M2 : goût/vision).**

### C · `subagent-obs/01→05` — l'observabilité des sous-agents

Une pile de cinq branches : contrats → adaptateurs → réutilisation → panneau
d'agents → visibilité des fils. C'est le chantier « voir ce que font les
sous-agents » en entier, découpé proprement.

---

# `obra/superpowers` — 264 453 ★, et il démolit mon R4

**Mesuré** : 264 453 étoiles, 23 605 forks, MIT, 4 077 ko, **14 skills**.
Poussé le 31/07. La description : « An agentic skills framework & software
development methodology that works. »

## Le chiffre qui règle notre n°4

Leurs descriptions de skills, mesurées : **maximum 234 caractères**
(`receiving-code-review`), puis 225, 200, 196, 154, 107, 106, 104.

**Notre seuil est 240**, dérivé de notre propre mesure. Les 14 skills du
framework de skills le plus adopté au monde passent toutes dessous. Notre
seuil est bon — et nos 15 skills Palenza sur 18 qui le dépassent (jusqu'à 895)
sont bien le problème, pas le seuil.

## Leur méthode, et pourquoi elle remplace mon R4

Mon R4 proposait de découper les skills en squelette + sections pour gagner des
jetons. **J'ai mesuré : 8 400 caractères = 2 100 jetons = 1,05 % d'une fenêtre
de 200k, 0,21 % sur Opus 1M.** Optimiser 1 %. R4 est mort.

Eux posent une tout autre question, et c'est la bonne :

> **« Writing skills IS Test-Driven Development applied to process
> documentation. »**
>
> | TDD       | skills                                      |
> | --------- | ------------------------------------------- |
> | test      | scénario de pression joué par un sous-agent |
> | code      | le SKILL.md                                 |
> | **ROUGE** | l'agent viole la règle **sans** la skill    |
> | **VERT**  | l'agent obéit **avec** la skill             |
> | refactor  | fermer les échappatoires, re-vérifier       |
>
> **« If you didn't watch an agent fail without the skill, you don't know if
> the skill teaches the right thing. »**

Et ils le font pour de vrai : leurs branches portent un **submodule d'évals**
(`bump/evals-claude-transcript-capture`, `drew/bump-evals-boundary-scenarios`,
`codex/pri-2158-bump-evals-submodule`).

**Pourquoi c'est LA pièce à prendre.** Cette nuit j'ai livré le n°3, le graphe
d'apprentissage, qui demande « ce changement de skill a-t-il amélioré quelque
chose ? » — et qui répond « pas assez de preuves » sur 64 mutations, parce
qu'il attend que l'usage réel s'accumule. **Leur méthode répond à la même
question sans attendre : on rejoue un scénario de pression avant et après.**
C'est la moitié manquante de mon propre chantier, et je ne l'avais pas vue.

## La troisième convergence, et elle n'est plus une coïncidence

Leurs 14 skills : `brainstorming` · `dispatching-parallel-agents` ·
`executing-plans` · `finishing-a-development-branch` · `receiving-code-review` ·
`requesting-code-review` · `subagent-driven-development` ·
`systematic-debugging` · `test-driven-development` · `using-git-worktrees` ·
`using-superpowers` · `verification-before-completion` · `writing-plans` ·
`writing-skills`.

| chez eux                         | chez nous             |
| -------------------------------- | --------------------- |
| `verification-before-completion` | `verifier-palenza`    |
| `systematic-debugging`           | `debug-navigateur`    |
| `using-git-worktrees`            | M5                    |
| `writing-skills`                 | `normes-skills` (n°4) |
| `writing-plans`                  | `spec-avant-code`     |

gstack l'avait déjà (`spec`, `ship`, `guard`, `qa`, les revues par lentille).
**Trois équipes indépendantes, les mêmes formes.** À 264 k et 125 k étoiles,
ce n'est plus un signal faible : ces découpages sont les bons, et les nôtres
sont alignés.

---

# `t3-oss` et les 4 129 dépôts — le tri

**`t3-oss` : rien.** 8 dépôts, c'est l'écosystème web (create-t3-app 29 063 ★,
create-t3-turbo, t3-env). Aucun rapport avec un harnais d'agent. Dossier clos
en une commande.

**Les abonnements de Theo : 66 comptes, 4 129 dépôts.** Après filtre sur
agent / IA / CLI / terminal à ≥ 500 ★, ce qui sort vraiment :

| dépôt                          |       ★ | verdict pour Raptor                                                                                           |
| ------------------------------ | ------: | ------------------------------------------------------------------------------------------------------------- |
| **obra/superpowers**           | 264 453 | **à prendre** — voir ci-dessus                                                                                |
| `obra/superpowers-marketplace` |   1 192 | marketplace de plugins Claude Code — à regarder avec le n°4                                                   |
| `mitchellh/vouch`              |   5 026 | **écarté** : confiance COMMUNAUTAIRE pour participer, pas confiance de code. Ce n'est PAS notre R2            |
| `ThePrimeagen/99`              |   4 748 | agent IA pour Neovim — autre hôte, rien à porter                                                              |
| `callstack/agent-device`       |   3 794 | piloter iOS/Android pour des agents — croise notre `apps/mobile`, à instruire si on veut du test sur appareil |
| `1weiho/open-slide`            |   6 059 | cadre de diapositives pour agents — hors sujet                                                                |
| `egoist/kero`                  |     719 | espace de travail terminal natif macOS — à regarder avec libghostty                                           |
| `antirez/kilo`                 |   9 061 | éditeur en 1 000 lignes — culture, pas matière                                                                |

`mitchellh/vouch` mérite sa correction explicite : j'avais failli le classer en
« confiance de projet ». Sa description dit _« community trust management
system based on explicit vouches to participate »_ — c'est social, pas de
l'exécution de code. **R2 reste sans référence externe.**

---

# LE PLAN RÉVISÉ

## Ce qui change par rapport à la v1

| v1                           | v2                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 anti-injection = **n°1**  | **rétrogradé** — 37 appels à surface externe sur 8 396 (**0,44 %**), zéro appel navigateur. gstack a 14 branches de sécurité parce que gstack EST un navigateur |
| R4 squelette de skills       | **MORT** — 1,05 % d'une fenêtre. Remplacé par le TDD de skills                                                                                                  |
| R3/R6 justifiés par M2 et I3 | **corrigé** — ce sont des lois PALENZA (`modules/ai`), pas des lois Raptor. Deux maisons                                                                        |
| _(absent)_                   | **l'amont**, qui devient tout le haut du classement                                                                                                             |

## L'ordre

1. **Rattraper `upstream/main`** — 16 commits, en commençant par
   `selfUpdate.ts` où mon travail de cette nuit croise le leur. Conflit certain,
   sur de la logique.
2. **Reprendre `t3code/local-usage-analytics`** — le registre de coût est écrit,
   testé, immuable par décision. On n'a rien à inventer.
3. **Le TDD de skills** (superpowers) — et l'appliquer d'abord à nos 15 skills
   hors norme. Ça donne au n°3 sa moitié manquante : un verdict sans attendre
   l'usage.
4. **R2, la confiance de projet** — inchangé, toujours non prouvé, toujours une
   heure d'enquête pour un risque asymétrique.
5. **`subagent-obs`** — à instruire : est-ce que la pile de 5 branches se
   reprend, ou est-ce qu'on attend qu'elle atterrisse en amont ?
6. R7 (normaliser aux frontières), R8 (verrou de session à l'écran) — inchangés.

## Ce qui REMONTE À ENZO, et rien d'autre

**`experiment/hermes-provider`.** L'amont fait d'Hermès un fournisseur de
premier rang. La LOI Palenza dit « Hermès SUSPENDU, avance solo ». Suivre
l'amont ici, c'est rouvrir cette porte. C'est du goût et de la vision, donc
c'est à toi (M2).

Ma reco : **on rattrape l'amont sans cette branche.** Elle est expérimentale,
elle est isolée dans une branche, et rien n'oblige à la prendre pour avoir les
16 commits de `main`.

**Rien n'est commencé.**
