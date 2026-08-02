# Correction de ma propre analyse, et le reste

`VEILLE-NOTEE-100.md` (commit `57cf2c77b`) relu comme s'il était d'un autre.
Trois soupçons vérifiés, **une note fausse**, et un dépôt qui change le
cadrage d'une priorité.

---

# CE QUI ÉTAIT FAUX

## ✗ E2 · React Scan — la note est FAUSSE, et l'erreur est la même que les étoiles

J'avais écrit : « 53 fichiers, 26 avant et 26 après, sur **23 branches** — ce
n'est pas un outil, c'est une **discipline** ». Noté **EXCEPTIONNEL**, placé
**3ᵉ** de l'ordre final.

**Vérification par les dates** : toutes les branches qui portent ces
enregistrements s'appellent `cursor/component-performance-optimization-<hash>`
et datent du **29 mai au 3 juin 2026**. Cinq jours. Deux mois sans suite.

Ce n'était pas une discipline vivante : c'était **une campagne automatisée par
un agent (Cursor), qui a rejoué le même playbook 23 fois en cinq jours, puis
s'est arrêtée**.

**Ce que j'ai fait de mal, et c'est la deuxième fois dans le même document** :
j'ai lu de l'ÉQUILIBRE (26/26) et du VOLUME (23 branches) et j'en ai conclu de
la rigueur. C'est exactement l'erreur des étoiles — confondre la quantité avec
la substance — commise à nouveau trois paragraphes après l'avoir dénoncée.

**Nouvelle note : BONUS.** L'IDÉE reste bonne (une preuve vidéo avant/après sur
un correctif de rendu, ça étend notre D3). Mais elle ne vient pas d'une
pratique éprouvée chez eux, donc elle n'a aucune valeur de preuve. Elle sort de
l'ordre des priorités.

## ⚠ E1 · `orchestration-v2` — la note tient, la STRUCTURE était fausse

Le soupçon était légitime : **je l'avais noté EXCEPTIONNEL sur la taille des
fichiers, sans en lire une ligne.** 225 ko peut être un chef-d'œuvre ou une
impasse — c'est même pour ça que ce n'est pas fusionné.

**Vérification** : les branches `subagent-obs/01→05`, **dernier commit le
31/07** (hier), **contiennent `orchestration-v2/Orchestrator.ts`**.

Donc c'est vivant, et surtout : **`subagent-obs` est BÂTI SUR
`orchestration-v2`**. Or je les avais listés comme deux trouvailles
indépendantes, à deux notes différentes (E1 exceptionnel, X3 excellent). C'est
une erreur de structure : ce sont **un seul chantier à deux étages**, et on ne
peut pas prendre l'observabilité des sous-agents sans prendre la v2 dessous.

**Ça change la décision** : « `orchestration-v2` en dernier, après le
rattrapage » devient intenable si on veut `subagent-obs`. Les deux se décident
ensemble, ou pas du tout.

## ✓ X4 · InsForge & superpowers — c'était VRAI, et plus fort que je ne l'ai dit

Je craignais un homonyme de dossier. Non. Leurs plans portent, en tête :

> **For agentic workers: REQUIRED: Use `superpowers:subagent-driven-development`
> (if subagents available) or `superpowers:executing-plans` to implement this
> plan. Steps use checkbox (`- [ ]`) syntax for tracking.**

Ce sont les noms EXACTS des skills d'obra/superpowers. Une équipe tierce
**impose** la méthode d'une autre à ses agents, dans un plan versionné.

Et la forme du plan mérite d'être copiée telle quelle : _Goal · Architecture ·
Tech Stack · lien vers la Spec · **File Map** (tableau des fichiers à créer,
décidé d'avance) · étapes en cases à cocher_. C'est un plan écrit **pour être
exécuté par un agent**, pas pour être lu.

## ✗ Deux défauts de forme que j'aurais relevés chez un autre

- **L'échelle de notation est infalsifiable.** « Exceptionnel / excellent / très
  bon » sans critère énoncé. Rien ne dit pourquoi E1 est au-dessus de X1. Une
  note sans règle est une opinion déguisée en mesure.
- **Aucune des 15 lignes ne porte d'estimation ni de premier test.** C'est un
  MENU. Notre M2 dit « une reco, jamais un menu » — le document viole la règle
  qu'il cite ailleurs.

---

# LE RESTE — les trois dépôts jamais ouverts

Identifiés au bon critère (PR/1 000 ★) puis laissés de côté. Ouverts
maintenant : **5 101 branches de plus**.

| dépôt          | branches | fichiers sur main | structure dominante                                           |
| -------------- | -------: | ----------------: | ------------------------------------------------------------- |
| **Roo-Code**   |    2 166 |             3 022 | `apps/docs` 903 · `webview-ui` 540 · `apps/cli` 158           |
| **cline**      |    1 775 |             3 522 | `apps/vscode` 1 291 · **`sdk/packages` 736** · `apps/cli` 415 |
| **gemini-cli** |    1 160 |             2 941 | `packages/cli` 1 273 · `packages/core` 921 · **`evals` 46**   |

## ★ LA TROUVAILLE — gemini-cli embarque un BAC À SABLE macOS

56 fichiers liés au sandbox, dont **six profils Seatbelt** :

```
sandbox-macos-permissive-open.sb    sandbox-macos-permissive-proxied.sb
sandbox-macos-restrictive-open.sb   sandbox-macos-restrictive-proxied.sb
sandbox-macos-strict-open.sb        (+ strict-proxied)
```

Plus `sandboxConfig.ts`, un test de profils, et — le détail qui les distingue —
**`evals/sandbox_recovery.eval.ts`** : ils ÉVALUENT le comportement de l'agent
quand le sandbox bloque quelque chose.

Leur formulation : « Sandboxing isolates potentially dangerous operations (such
as shell commands or file modifications) from your host system ».

**Notre état, vérifié** : Raptor n'a **aucun** bac à sable. Les correspondances
`sandbox` chez nous sont des faux positifs — le drapeau de Codex dans son
adaptateur, et l'attribut `sandbox` d'Electron sur la fenêtre.

**Pourquoi ça reformule R2.** Deux réponses au même danger :

| approche                                                  | qui                            | nature                                          |
| --------------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| **juger la confiance** du dossier, refuser d'écrire sinon | pi `trust-manager`             | une POLITIQUE — il faut décider à qui on se fie |
| **exécuter dans un bac à sable**                          | gemini-cli, 6 profils Seatbelt | un MÉCANISME — plus besoin de juger             |

La seconde est strictement plus forte : elle ne demande aucun jugement. Et
Seatbelt est **natif macOS**, donc exactement notre plateforme.

**R2 devient donc** : instruire d'abord (le hook d'un dépôt cloné s'exécute-t-il
chez nous ?), puis choisir entre la politique et le mécanisme — avec une
préférence nette pour le mécanisme.

## Les deux autres, brièvement

- **cline** — `sdk/packages`, **736 fichiers de SDK**. Ils vendent l'agent comme
  bibliothèque, pas seulement comme application. Plus `.agents/skills` (47
  fichiers) : le même dossier cross-runtime que gstack. Et **45 fichiers
  d'évals**.
- **Roo-Code** — **29 fichiers de checkpoint** (nous en avons, à comparer) et
  `apps/docs` à 903 fichiers, soit un tiers du dépôt en documentation. La
  densité d'ingénierie la plus forte de toute la veille (315,9 PR/1 000 ★) tient
  peut-être surtout à ça.

## Le point commun des trois, et il est accablant pour nous

| dépôt       |   fichiers d'évals |
| ----------- | -----------------: |
| gemini-cli  |             **70** |
| cline       |             **45** |
| superpowers | un submodule dédié |
| **Raptor**  |              **0** |

Quatre projets sur cinq évaluent leurs agents. Nous avons 193 383 lignes de
TESTS — ce qui est notre force — mais **zéro éval** : rien qui mesure la
QUALITÉ des réponses, seulement la correction du code.

C'est le seul manque de toute la veille qui apparaisse chez presque tout le
monde sauf chez nous.

---

# L'ORDRE CORRIGÉ

1. **Rattraper l'amont** — inchangé, toujours n°1 (16 commits, `selfUpdate.ts`).
2. **`local-usage-analytics`** — inchangé.
3. **~~React Scan~~** → retiré du podium, passé en bonus.
4. **Les évals** — nouveau, et c'est le manque le plus partagé : 4 projets sur 5
   en ont, nous zéro. Commencer petit : une éval sur un seul comportement.
5. **R2 reformulé** — instruire le hook, puis viser le BAC À SABLE Seatbelt
   plutôt que la politique de confiance.
6. **`orchestration-v2` + `subagent-obs` ensemble** — un seul chantier à deux
   étages, plus deux lignes séparées.

**Rien n'est commencé.**
