# Priorités Raptor — ce qu'on fusionne, dans quel ordre, et pourquoi

Contrainte posée par Enzo, et c'est elle qui décide de tout :
**« on a aspiré Hermès, donc tout doit tourner vert sur Raptor. »**
Rien ne s'ajoute tant que la base n'est pas verte.

## L'état réel, mesuré maintenant

| contrôle                    | résultat                                              |
| --------------------------- | ----------------------------------------------------- |
| fichiers non commités       | **0**                                                 |
| erreurs de types serveur    | **0**                                                 |
| suite complète              | 7 305 tests · **1 instable** (1 échec sur 3 passages) |
| rattrapage amont : conflits | **3**, tous dans la barre latérale web                |
| mon travail Hermès          | **intact** — aucune collision                         |

### Ce qui renverse ma prédiction

J'avais écrit : « le conflit est CERTAIN sur `selfUpdate.ts`, et il portera sur
de la LOGIQUE ». **Faux.** `git merge-tree` donne trois conflits, tous en UI :

```
apps/web/src/components/SidebarV2.tsx
apps/web/src/components/settings/SettingsSidebarNav.tsx
apps/web/src/components/sidebar/SidebarChrome.tsx
```

`selfUpdate.ts` est bien TOUCHÉ par l'amont, mais git le fusionne proprement.
Le rattrapage est donc **beaucoup moins cher** que je ne l'ai annoncé : trois
conflits d'interface, zéro conflit de logique, et aucun de mes modules de la
nuit n'est concerné.

---

# LES PRIORITÉS

## P0 · Le test instable — avant tout le reste

`apps/server/src/server.test.ts > server router seam > proxies browser OTLP
trace exports through the server` : **1 échec sur 3 passages complets**.

C'est P0 parce que ta contrainte est « tout vert », et parce qu'un test
intermittent est pire qu'un test rouge : il apprend à relancer au lieu de
lire. C'est la classe que j'ai déjà traitée cette nuit (les cinq rouges de
`process.cwd()`), et elle revient.

**Fin de tâche** : dix passages consécutifs verts, ou la cause nommée et le
test rendu déterministe.

## P1 · Rattraper l'amont — 16 commits, 3 conflits d'UI

Maintenant que la surface est mesurée, c'est une petite tâche, pas un chantier.
Et elle apporte au passage `bound thread catch-up replay and stop full-DB
snapshot hydration` — un correctif de performance sur l'hydratation.

**Fin de tâche** : `travail` à 0 commit de retard, suite verte, et les trois
composants de barre latérale relus à la main (D2 : c'est du comportement
visible).

## P2 · Les évals — le seul manque que TOUT LE MONDE a comblé sauf nous

|             |   fichiers d'évals |
| ----------- | -----------------: |
| gemini-cli  |                 70 |
| cline       |                 45 |
| superpowers | un submodule dédié |
| **Raptor**  |              **0** |

Nos 193 383 lignes de tests vérifient que le CODE est correct. Rien ne vérifie
que les RÉPONSES sont bonnes. Sur cinq projets comparés, quatre évaluent leurs
agents.

**Commencer minuscule** : UNE éval, sur UN comportement déjà tenu par une
règle. Le candidat évident est le garde de sortie d'outil (n°71) — on a déjà
le module, il manque le corpus.

## P3 · `local-usage-analytics` — reprendre, ne pas réécrire

Déjà écrit en amont, testé, avec sa migration. Sa vraie raison d'être :
**sans lui, une régression de cache à 10-20× reste invisible.**

## P4 · Le bac à sable, PAS la politique de confiance

gemini-cli embarque **six profils Seatbelt macOS** (`permissive`/`restrictive`/
`strict` × `open`/`proxied`) plus une éval `sandbox_recovery`. Raptor n'en a
aucun.

Deux réponses au même danger : pi **juge la confiance** (une politique, il faut
décider à qui se fier), gemini-cli **exécute dans un bac à sable** (un
mécanisme, plus rien à juger). Le mécanisme est strictement plus fort, et
Seatbelt est natif macOS — notre plateforme.

**Instruire d'abord** : le hook d'un dépôt cloné s'exécute-t-il chez nous ?
Une heure. Le résultat décide de la suite.

## P5 · `orchestration-v2` + `subagent-obs` — ENSEMBLE ou pas du tout

Correction de mon analyse : les branches `subagent-obs` **contiennent**
`orchestration-v2/Orchestrator.ts`. Ce ne sont pas deux trouvailles, c'est un
chantier à deux étages. Décision unique, après le rattrapage.

---

# « Est-ce intelligent de toucher aux skills de gstack ? »

**Non. Et la mesure le dit.**

|                             | corps de skill |
| --------------------------- | -------------: |
| gstack `gstack-ship`        |       97 900 o |
| superpowers, la plus grosse |       28 077 o |
| Palenza, la plus grosse     |       14 489 o |
| **Palenza, LES 18 RÉUNIES** |   **96 907 o** |

Trois raisons de ne pas les prendre :

1. **Elles sont taillées pour LEUR flux.** `gstack-ship` fait 98 ko parce qu'il
   encode leur CI, leurs revues, leur versionnage. Chez nous ce serait 98 ko de
   procédure d'un autre.
2. **Nos formes sont déjà validées trois fois.** `verifier-palenza` ↔
   `verification-before-completion`, `debug-navigateur` ↔ `systematic-debugging`,
   `spec-avant-code` ↔ `writing-plans`. Palenza, gstack et superpowers ont
   convergé indépendamment. Importer leur contenu remplacerait ce qui marche.
3. **On est sous tous leurs seuils**, description ET corps.

**Ce qui se prend, c'est la MÉTHODE, pas les skills** :

- **le TDD des skills** (superpowers) : ROUGE = l'agent viole la règle SANS la
  skill, VERT = il obéit AVEC. C'est ce qui manque à notre n°3 ;
- **le plan comme artefact daté** (InsForge, qui applique superpowers) : leurs
  plans portent en tête « REQUIRED: Use `superpowers:subagent-driven-development` »
  et contiennent un **File Map** — le tableau des fichiers à créer, décidé
  d'avance. Notre `spec-avant-code` produit une conversation ; le leur produit
  un fichier exécutable par un agent.

---

# LA RÈGLE ANTI-SILENCE — future-proof, parce que ça m'a mordu QUATRE fois

Ce soir, quatre vérifications ont **sous-rapporté en silence** en ayant l'air
de réussir :

|                            | ce qui s'est passé                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `2>/dev/null` en parallèle | 25 branches de pi perdues, sortie plausible                                                                                  |
| `cut -d"¤"`                | délimiteur multi-octets → fichier VIDE, 303 branches « manquantes »                                                          |
| **`for F in $VAR` en zsh** | **zsh ne découpe pas** : UN tour avec toute la chaîne. `basename` a rendu le dernier chemin, donc la sortie semblait normale |
| `search/issues`            | quota atteint → **422 « Validation Failed »**, pas 429. Trois mesures muettes                                                |

Reproduction du troisième, faite à l'instant : `V="a b c d"` → `for F in $V`
fait **1 tour**, `for F in ${=V}` en fait **4**.

**La règle, et elle est mécanisable** : _toute boucle de vérification affirme sa
propre complétude — compte entré == compte sorti, et l'écart est BRUYANT._

C'est le seul garde qui aurait attrapé les quatre. En zsh, ajouter :
`${=VAR}` pour découper, et un `[ "$N" -eq "$ATTENDU" ] || echo "⚠ INCOMPLET"`
en fin de boucle.

---

**Rien n'est commencé.** P0 et P1 sont petits et mesurés ; les suivants
attendent que la base soit verte.
