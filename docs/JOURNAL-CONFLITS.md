# Journal des conflits de synchro amont

> Une ligne par synchro. Le but : savoir laquelle de NOS features coûte cher
> à chaque rendez-vous avec l'amont — et la réécrire si elle coûte trop.
> Une synchro sans conflit est AUSSI une donnée : elle prouve que nos
> features sont posées aux bons endroits (nouveaux fichiers, câblages
> minces, refs plutôt que déplacement de code amont).

| Date       | Amont fusionné                                                                                                                       | Fichiers amont                                     | Conflits | Feature en cause                                                                             | Tests après                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 | v0.0.30-nightly.20260728.930 (PR #6, 6 commits)                                                                                      | 48 (+1026/−497)                                    | **0**    | —                                                                                            | web 1654 ✅ · contracts 220 ✅ · tsgo 0 erreur                                                                                                                                                                                                                    |
| 2026-07-28 | voice/voice de aaSchcolnik/t3code-w-voice (squash des 20 commits, base = ancêtre à 34 commits) + cherry-pick 728e8cfa7 (asar-unpack) | 216 staged (~+39k, vendored transcribe-cpp inclus) | **2**    | aucune des nôtres — leur `sync-upstream.yml` (gardé le NÔTRE) et `pnpm-lock.yaml` (régénéré) | tsgo 0 erreur ✅ · lint ✅ · tests 1683/1684 puis web seule 1694/1694 ✅ (l'unique rouge = timeout 15 s de stashImageCompression sous charge 14 paquets, hors-voix, chip posée) · dictée FR prouvée E2E en dev run (composer → WS → transcribe-cpp Metal → texte) |

Écarté volontairement du squash (hors-scope voix, chaque divergence coûte à
chaque synchro nightly) : `.serena/`, `temp/` (leurs plans internes), leur
`.vscode/launch.json`, leur README, bouton mobile « New Thread »
(ChatView/ChatHeader — diff 100 % hors-voix, vérifié), élargissement
toast/ThreadErrorBanner, timeout de sonde OpenCodeProvider.
