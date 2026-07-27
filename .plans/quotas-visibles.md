# Rendre les quotas visibles

## Constat

`ClaudeAdapter` reçoit du SDK Claude Code un `rate_limit_event` et le
republie en `account.rate-limits.updated`
(`apps/server/src/provider/Layers/ClaudeAdapter.ts:2906`). `CodexAdapter`
fait de même depuis `account/rateLimits/updated` (ligne 1127).

Cet événement **n'atteint jamais l'interface**. Deux raisons, distinctes :

1. Sa charge utile n'est pas modélisée —
   `AccountRateLimitsUpdatedPayload = Schema.Struct({ rateLimits: Schema.Unknown })`
   (`packages/contracts/src/providerRuntime.ts:537`).
2. `ProviderRuntimeIngestion` — le seul étage qui transforme un événement de
   runtime en quelque chose que le client voit — **ne traite pas ce type**.
   Son `switch` couvre une trentaine de types (`thread.*`, `tool.*`,
   `task.*`, `runtime.error`…) ; `account.rate-limits.updated` n'y figure pas
   et tombe donc dans le cas par défaut.

Vérifié : `grep -r "ProviderRuntimeEvent" apps/web/src packages/client-runtime/src`
→ **0 résultat**. Le web ne voit aucun événement de runtime en direct ; il ne
voit que ce que l'ingestion a converti.

## Ce que ça implique

L'idée « la donnée est déjà là, il suffit de l'afficher » est **fausse**. Le
producteur existe, le transport n'existe pas.

## Le piège de conception à éviter

Le patron le plus proche est `thread.token-usage.updated`
(`ProviderRuntimeIngestion.ts:596`) : il fabrique une entrée d'activité de fil,
de `kind: "context-window.updated"`.

**Ne pas copier ce patron ici.** Une activité de fil est *par conversation* et
s'affiche dans le flux du chat : on aurait une ligne de bruit à chaque
rafraîchissement de quota, dans chaque fil. Or un quota est *par compte*, pas
par conversation.

## Tranche 1 — modéliser

Remplacer le `Schema.Unknown` par la vraie forme, connue et vérifiée le
27/07/2026 contre `https://api.anthropic.com/api/oauth/usage` :

```
five_hour  { utilization: number, resets_at: string|null }
seven_day  { utilization: number, resets_at: string|null }
limits[]   { kind, group, percent, severity, resets_at, scope: { model: { display_name } } }
```

Re-borner après lecture (H1 : aucune valeur affichée comme un fait sans
source). `utilization` peut dépasser 100 côté fournisseur : le clamper à
l'affichage, jamais à l'ingestion.

## Tranche 2 — transporter au niveau COMPTE

Un état par instance de provider, pas par fil. Le modèle à suivre est celui du
statut de provider (`auth.status`), déjà exposé au web et rendu dans les
réglages (`apps/web/src/components/settings/providerStatus.ts`).

## Tranche 3 — afficher

Barre latérale : une jauge par compte, avec l'heure de remise à zéro.
Rendu déjà éprouvé hors de ce dépôt dans `cc-tableau` (`~/.local/bin/`),
seuils 50 % / 85 %.

## Tranche 4 — la vraie valeur

Alerter avant le mur, puis basculer de compte automatiquement. Leur doc
(`docs/providers/claude.md`) dit « Can I Switch Claude Accounts In An Existing
Thread? Usually, no », parce que leur multi-compte repose sur des dossiers
`HOME` séparés. En échangeant seulement le jeton — méthode `cc-compte`,
prouvée le 27/07 — un seul dossier suffit et ce verrou tombe.

La bascule se fera **entre deux tours**, jamais au milieu d'un : un `claude`
en cours d'exécution garde son jeton en mémoire.

## Coût de synchronisation

Les tranches 1 et 2 modifient `packages/contracts` et
`apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` — deux
fichiers que l'amont touche souvent. Conflits à prévoir à chaque synchro ;
c'est ce que `docs/JOURNAL-CONFLITS.md` mesurera.
