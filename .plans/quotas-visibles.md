# Rendre les quotas visibles

## Où on en est (28/07/2026)

Tranches 1, 2 et 3 faites : la charge utile est modélisée, l'événement est
normalisé, stocké par instance, joint à la frontière du client et poussé sans
attendre le prochain sondage, et la jauge s'affiche sur la carte du compte.

Deux corrections de conception en cours de route, toutes deux invisibles de
l'extérieur puisque le champ existait déjà :

- la jointure était faite au moment du sondage, donc figée jusqu'au sondage
  suivant (cinq minutes) et jamais pendant le tour qui l'avait produite ;
- elle était faite en amont du cache disque, donc un chiffre de la veille
  revenait au démarrage en se présentant comme courant.

Elle se fait maintenant une seule fois, en sortie (`rateLimitProjection.ts`),
le magasin faisant seule autorité — ce qui supprime aussi les mêmes trois
lignes dans cinq fichiers de drivers, autant de conflits en moins à chaque
synchro.

**PROUVÉ EN VRAI le 28/07** : app lancée, compte Claude Max, deux tours réels.
La carte du compte affiche « 5-hour limit · resets in about 4 h · measured just
now ». L'heure est vraie : `resetsAt` = 1785211800 lu en secondes donne
2026-07-28T04:10 UTC ; lu en millisecondes il tomberait en 1970, et le garde de
plausibilité le rejetterait.

**Ce que la preuve live a retourné — le point le plus important de ce plan :**

Claude n'envoie **AUCUN pourcentage**. Charge utile réelle :

```
rate_limit_info: { status, resetsAt, rateLimitType,
                   overageStatus, overageDisabledReason, isUsingOverage }
```

`grep -c utilization` = **0** sur tout le journal du tour. Le premier parseur
exigeait ce champ et jetait donc chaque événement, en silence, avec une panne
indiscernable de « ce fournisseur n'a jamais rien rapporté ». Le SDK type
`utilization?: number` : « optionnel » avait été lu comme « toujours là ». Une
déclaration de type dit ce qui PEUT arriver, pas ce qui arrive.

Le pourcentage vérifié le 27/07 contre `api.anthropic.com/api/oauth/usage`
existe bel et bien — mais **il vient de cet endpoint, pas de l'événement du
SDK**. Deux sources différentes, confondues.

**Fait le 28/07 : la source du pourcentage est branchée.** L'API de compte
(`/api/oauth/usage`) est interrogée quand l'événement dit que l'usage a bougé —
pas par minuterie : c'est l'instant où le chiffre devient périmé ET où
quelqu'un regarde. Rendu réel, prouvé dans l'app : « 5-hour limit · resets in
about 4 h · 16 % » et « Weekly limit · resets in about 13 h · 14 % ».

Trois décisions à ne pas défaire :

- **Attribution par construction** : la source du credential vient du
  `CLAUDE_CONFIG_DIR` de l'instance (défaut → trousseau macOS, puis fichier).
  Aucun chemin ne permet à une instance de lire le credential d'une autre.
  Corollaire : l'appel est monté dans le driver, seul endroit où le compte est
  connu, et passé à l'adaptateur déjà câblé.
- **Fusion par champ** : l'événement détient la sévérité, l'API le
  pourcentage ; un remplacement en bloc ferait osciller la jauge entre les deux
  moitiés de la vérité.
- **Un 401 est bruyant et ne touche pas au stock** : on a cessé de savoir, on
  ne fige pas un chiffre qui aurait l'air courant.

⚠️ La copie fichier du credential sous `~/.claude` peut avoir des jours de
retard alors que le trousseau est à jour (constaté). D'où l'ordre trousseau
d'abord, et le contrôle d'expiration.

## Tranche 4a — alerter avant le mur : FAIT (28/07)

Bandeau au-dessus du composer, là où on travaille. Seuils 75 % (avertir) et
90 % (fort), plus tout refus du fournisseur. `apps/web/src/components/chat/
quotaAlert.ts`.

Le difficile n'est pas le seuil, c'est **le silence** : un bandeau qui sort à
40 % apprend à fermer les bandeaux sans les lire. L'identité du bandeau porte
le NIVEAU — fermer à 76 % ne rend pas muet à 95 %.

Prouvé à l'écran avec des chiffres réels (seuil abaissé le temps de la capture,
puis remis).

## Tranche 4b — bascule de compte : FAITE, sans toucher aux jetons (28/07)

Le bandeau propose « Run on <autre compte> ». Chaque compte est déjà une
instance de provider avec son propre `CLAUDE_CONFIG_DIR` ; basculer = lancer le
tour suivant sur cette instance, avec le CLI officiel. **Aucun jeton lu, écrit
ou échangé ; aucun client usurpé.**

Pour l'activer, un geste fondateur, une fois par compte :

```
CLAUDE_CONFIG_DIR=~/.claude-compte-a claude auth login
```

puis, dans Réglages → Providers → +, ajouter une instance Claude dont le
`homePath` est ce dossier. Le bouton apparaît dès qu'un second compte connecté
existe.

### Pourquoi PAS CLIProxyAPI / CPAMC

Vérifié sur `CLIProxyAPI@cade44b` (28/07) :
`internal/auth/claude/anthropic_auth.go:27` → `ClientID` =
`9d1c250a-e61b-44d9-88ed-5944d1962f5e` (l'identifiant client officiel de Claude
Code), `AuthURL` = `claude.ai/oauth/authorize` (donc une connexion ABONNEMENT),
et `claude_code_instructions.txt` embarqué pour que le trafic ressemble à
Claude Code. C'est du trafic API arbitraire servi depuis un abonnement en se
faisant passer pour le client officiel — même classe que le rail écarté en
PR #277. Sur des clés API payantes, l'outil est sans problème.

## Ancien cadrage 4b (avant la solution par instances)

Ce n'est pas la suite naturelle de 4a, c'est un autre métier : **écrire** dans
le trousseau macOS pour échanger le jeton d'un compte à l'autre. Un bug là ne
fait pas afficher un mauvais chiffre, il **déconnecte le compte**.

À trancher avant d'écrire une ligne :
- où vit le second jeu de credentials (second `CLAUDE_CONFIG_DIR` plutôt que le
  trousseau, probablement — ça évite d'écrire dans le trousseau) ;
- la bascule se fait **entre deux tours**, jamais au milieu : un `claude` en
  cours garde son jeton en mémoire ;
- que se passe-t-il si les deux comptes sont au mur.

Cf. [[deux-abonnements-max-bascule]] pour la méthode `cc-compte`.

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
