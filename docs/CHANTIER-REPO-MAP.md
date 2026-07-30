# Chantier — repo map (absorption aider, GO fondateur 2026-07-30)

> Mandat : donner aux agents Raptor la conscience-repo qui manque au SDK —
> le mécanisme qui a fait la renommée d'aider (47,8k ★). Veille source :
> Palenza docs/VEILLE-ABSORPTIONS-2026-07-30.md.

## Le problème réel

Un agent dans Raptor démarre aveugle : il greppe au hasard jusqu'à trouver.
Aider résout ça par une CARTE : définitions/références par fichier, graphe de
dépendances, classement PageRank personnalisé sur la conversation, borné en
jetons — la carte, jamais le dump des fichiers.

## Choix de design (assumé, RÈGLE SUPRÊME)

v1 SANS tree-sitter : le monorepo est du TypeScript — un extracteur
d'exports/imports en TS pur suffit (exports nommés, défauts, types ; graphe
par `import ... from`). Classement : degré entrant + boost des fichiers
mentionnés dans la conversation. Sortie bornée en jetons. Tree-sitter
(polyglotte) SEULEMENT si un besoin réel non-TS le prouve — on refuse les
problèmes qu'on n'a pas.

## Où ça se branche

Outil MCP `repo_map` sur le serveur t3-code existant (apps/server/src/mcp/
toolkits/) — l'agent l'appelle À LA DEMANDE (divulgation progressive, leçon
claude-mem) au lieu d'une injection systématique qui paierait la carte à
chaque tour. Entrées : { cwd, focus?: string[], maxTokens? }.

## Découpe (tranches M4)

1. Noyau PUR : extracteur exports/imports TS + graphe + classement + rendu
   borné — testé sans disque sur des sources en chaînes.
2. Écorce : marche du workspace (ignore node_modules/.git/dist), cache par
   mtime.
3. Outil MCP monté dans McpHttpServer + test HTTP.
4. Preuve E2E : la carte du repo t3code lui-même, AVANT/APRÈS sur une
   question réelle (« où vit le relais de comptes ? »).

## Après lui (même GO)

Shadow-git checkpoints (cline) : repo git fantôme, 3 modes de restauration,
avertissement si fichiers modifiés après le message. S'appuie sur
apps/server/src/vcs/GitVcsDriver.ts (restoreCheckpoint existant).
