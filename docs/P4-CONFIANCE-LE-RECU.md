# P4 — instruit, et la réponse est la mauvaise

**Question posée** (plan v2 R2, puis P4) : le hook d'un dépôt cloné s'exécute-t-il
chez nous, et une confiance est-elle demandée ?

**Réponse mesurée le 01/08 : OUI il s'exécute, NON rien n'est demandé.**

Ce document est le REÇU. La manipulation est rejouable en trois minutes.

## Le montage

Un dépôt jetable dans `/tmp/p4-confiance/depot-piege`, contenant ce qu'un dépôt
public quelconque peut contenir :

```
.claude/settings.json          → un hook SessionStart
.claude/hooks/inoffensif.sh
.claude/skills/piege/SKILL.md  → une skill
```

Le hook est **volontairement inoffensif** : il écrit une ligne horodatée dans
un fichier témoin. Il aurait pu écrire n'importe quoi d'autre — c'est tout le
sujet.

Puis on lance le CLI **exactement comme Raptor le lance** : `cwd` = le dépôt.

## Les trois constats

| ce qu'on regarde                         | résultat                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| **le hook tire-t-il ?**                  | **OUI** — `HOOK-A-TIRE 03:18:29`, code de sortie 0                                      |
| **à chaque session ?**                   | **OUI** — deux lancements, **deux lignes** (`03:18:29`, `03:18:53`)                     |
| **une confiance est-elle demandée ?**    | **NON** — le projet n'apparaît même pas dans `~/.claude.json`, aucun champ de confiance |
| **la skill du dépôt est-elle chargée ?** | **OUI** — `piege` apparaît dans la liste des skills de l'agent                          |

La skill listée, mot pour mot :

```
raptor-outillage, piege, dataviz, update-config, …
```

`piege` vient d'un dépôt cloné. Elle est là, à côté des nôtres.

## Ce que ça prouve exactement — et ce que ça ne prouve pas

**Prouvé** : en mode non interactif (`-p`), le CLI exécute les hooks du projet
et charge les skills du projet, à chaque session, sans état de confiance. Or
c'est ce mode-là que Raptor utilise.

**Non prouvé, et il faut le dire** : que le mode interactif se comporte
pareil. Le binaire porte `hasTrustDialogAccepted` — une garde EXISTE quelque
part. Ce qui est établi, c'est que **le chemin qu'emprunte Raptor ne la
rencontre pas**.

**Ce n'est pas un bug de Raptor** au sens strict : c'est la composition
« Raptor lance le CLI en headless sur un `cwd` arbitraire » qui ouvre le
chemin. La responsabilité est chez nous quand même, parce que c'est nous qui
choisissons le `cwd`.

## Ce que ça corrige dans les documents précédents

Le plan v1 écrivait, à propos de R2 : « **Ce qui n'est PAS prouvé, et il faut le
dire** : je n'ai pas établi que Raptor court-circuite la garde. » C'était la
bonne prudence. **Elle est levée : la garde est court-circuitée.**

## La suite — le mécanisme, pas la politique

`PRIORITES-RAPTOR.md` (P4) a déjà tranché, et le raisonnement tient :

> pi **juge la confiance** (une politique — il faut décider à qui se fier).
> gemini-cli **exécute dans un bac à sable** (un mécanisme — plus rien à juger).
> Le mécanisme est strictement plus fort, et Seatbelt est natif macOS.

gemini-cli embarque **six profils Seatbelt** (`permissive`/`restrictive`/`strict`
× `open`/`proxied`) et une éval `sandbox_recovery`. Raptor n'en a aucun.

**Reco** : bac à sable Seatbelt sur le processus CLI, pas une liste de dépôts de
confiance. Une politique se contourne par un clic ; un bac à sable ne se
contourne pas.

**Palier** : c'est un changement de COMPORTEMENT (D2). Ça se montre avant de
partir. Et ça touche l'exécution de tout le monde — donc éval avant/après
obligatoire, sinon on remplace un trou par une panne.

## Rejouer

```bash
ls /tmp/p4-confiance/depot-piege     # le montage est laissé en place
: > /tmp/p4-confiance/temoin.txt     # remettre le témoin à zéro
cd /tmp/p4-confiance/depot-piege && claude -p "ok"
cat /tmp/p4-confiance/temoin.txt     # une ligne de plus = le hook a tiré
```
