# Le triage des 56 restants

> Finir les 85, ce n'est pas construire 85 modules : c'est **trancher** chaque
> ligne. Une entrée qu'on écarte sur pièce est aussi finie qu'une entrée
> livrée — et bien plus honnête qu'une entrée cochée à moitié.
>
> Chaque verdict ci-dessous est **vérifié**, jamais supposé : soit le code
> existe et on l'a trouvé, soit la panne n'existe pas et on l'a mesurée.

## A · DÉJÀ COUVERT chez nous — 7 lignes à fermer

Vérifié dans le code du dépôt, pas de mémoire.

|                                           | pourquoi c'est déjà là                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **n°63** navigateur                       | le toolkit `preview` pilote un onglet réel : `navigate`, `snapshot`, `click`, `type`, `evaluate`, `recording`. Quinze poignées, toutes derrière la porte de sortie.  |
| **n°68** projets                          | sélecteur de projet (⌘P) et recherche de contenu (⇧⌘F) livrés en amont.                                                                                              |
| **n°70** vision                           | 11 commits sur les images du composeur, dont la compression d'une capture trop lourde. Le modèle voit ; il n'y a pas de « routage vision » à écrire.                 |
| **n°74** générateur de titre              | régénération d'un titre de fil depuis la barre latérale, livrée en amont.                                                                                            |
| **n°76** skins                            | l'éditeur de thème d'Arc, mesuré sur 10 761 frames, avec thème par projet. Bien au-delà du leur.                                                                     |
| **n°77** i18n                             | des locales existent déjà côté paquets.                                                                                                                              |
| **n°84** recherche web multi-fournisseurs | firecrawl, exa, brightdata sont branchés **en MCP**. C'est mieux que leur intégration en dur : un fournisseur de plus est une ligne de configuration, pas un plugin. |

## B · PANNE QU'ON N'A PAS — à rouvrir seulement sur incident réel

|                                  | la mesure ou le fait                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **n°35** récupération de session | T3 copie les transcripts OCTET PAR OCTET sans les analyser. La corruption qu'ils réparent ne nous atteint pas.                                         |
| **n°62** isolation d'egress      | un proxy existe déjà côté serveur ; leur module vise un déploiement exposé, pas une app de bureau.                                                     |
| **n°73** conscience de batterie  | leur commit « stretch backstop polls while on battery » répond à un démon qui sonde en boucle. À rouvrir si une mesure montre que T3 vide la batterie. |
| **n°78** UI curses de repli      | T3 est Electron. Une UI terminal de repli répond à un produit qui vit dans un terminal.                                                                |

## C · BLOQUÉ PAR UN MAILLON AMONT — l'ordre est forcé

|                                     | ce qui manque avant                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| **n°3** graphe d'apprentissage      | enregistre des MUTATIONS ; le curateur (n°1) décide sans encore rien appliquer.                 |
| **n°12** allowlist suggérée         | mine un HISTORIQUE d'approbations ; l'approbation interactive (n°11b) n'existe pas.             |
| **n°50/51/52/53** hub et 182 skills | le scanner (n°10) est posé, mais il n'y a aucun chemin d'IMPORT à garder. Le hub vient d'abord. |
| **n°38→44** la passerelle           | strictement linéaire : rien ne marche sans le n°37 (bail de tour).                              |

## D · CHANTIER À PART ENTIÈRE — ne se commence pas en fin de journée

**n°37 · la passerelle** (session.py 3 307 l., slash_commands.py 5 483 l.) et
ses huit maillons. C'est T3 hors de la machine : Telegram, streaming, livraison
fiable, autorisation par canal. Le plus gros bloc du catalogue, et le seul
strictement linéaire.

**n°7 · PTC** (2 014 l.) — le modèle écrit un script qui appelle nos outils,
N tours → 1. Chez nous il passerait par le serveur MCP. Gain de contexte
potentiellement énorme (les appels d'outils font 22 % de la fenêtre), mais
c'est une nouvelle surface d'exécution.

**n°67 · kanban** (10 010 l.) — décomposition, essaim, watchers.

## E · PRÊT À CONSTRUIRE — la file, par valeur décroissante

1. **n°28 · client LSP** — absent, et c'est le seul qui donne à l'agent la vue
   d'un IDE (définitions, références, diagnostics). Exposé en outil MCP.
2. **n°59 · inventaire, logs, statut** — prolonge le `doctor` déjà livré.
3. **n°26 · délégation** — sous-agents isolés, log en direct. T3 a `Agent` ;
   ce qui manque est le cycle de vie et la revue en arrière-plan.
4. **n°30 · registre de processus + interruption**.
5. **n°55 · compression dirigée** — `/compress here`, `focus <sujet>`. À
   distinguer du seuil automatique, qu'on a écarté faute de contrôler la cible.
6. **n°47 · cron intégré** — et il devra arriver avec la règle du curateur :
   une skill référencée par un job ne s'archive jamais.
7. **n°57/58 · mise à jour et désinstallation propres** — l'updater existe
   (25 commits) ; la désinstallation à trois granularités, non.
8. **n°60 · observabilité** · **n°71 · hooks de plugin** · **n°72 · toolsets**
9. **n°6 · tokenizer CJK** — copie C, mais produit français d'abord : à
   prendre le jour où un utilisateur CJK apparaît.
10. **n°15/16/19** — OSV, secrets externes, hooks shell : réels mais sans
    problème prouvé chez nous aujourd'hui.
11. **n°8 · `/goal`** — à instruire d'abord : Claude Code en a déjà un, et T3
    l'enveloppe. Vérifier si un second a un sens avant d'en écrire un.
12. **n°64/65/66/69** surfaces · **n°79→83** habillage — le SAC. Ni ordre ni
    invariant : on y pioche quand une chaîne est bloquée.

## Ce que ce triage change

Sur 56 lignes : **7 sont déjà couvertes**, **4 répondent à une panne qu'on
n'a pas**, **8 sont bloquées par leur amont**, **3 sont des chantiers à part
entière**. Il reste **une file de 34** dont une bonne moitié est de
l'habillage.

Le catalogue disait 56 restants. Le vrai reste, celui qui demande du code et
qu'on peut commencer demain matin, en fait **une douzaine**.
