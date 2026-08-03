import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/**
 * L'OUTILLAGE PARTAGÉ — ce que tout agent lancé depuis Raptor hérite.
 *
 * Né d'une mesure, pas d'une intuition (30/07/2026). En lisant le journal
 * d'une veille multi-agents, un gaspillage structurel est apparu : CHAQUE
 * dépôt candidat consommait un agent entier pour répondre à une question
 * purement mécanique — « existe-t-il, date-t-il de quand, sous quelle
 * licence ». Six angles de recherche fois huit candidats : jusqu'à
 * quarante-huit agents. La même chose en `gh api` : sept secondes.
 *
 * La leçon dépasse la veille. Un agent est cher et lent quand il répond à
 * une question VÉRIFIABLE ; il est irremplaçable quand la question demande
 * un JUGEMENT. Un harnais qui ne fait pas cette différence brûle son budget
 * sur de la mécanique.
 *
 * Ce module dépose donc l'outillage dans le dossier de configuration de
 * CHAQUE compte, pour que la connaissance ne dépende pas de ce qu'un agent
 * pense à redécouvrir. Trois règles tenues :
 *
 *   1. On n'écrase que ce qu'on a écrit. Le dossier appartient à
 *      l'utilisateur ; nos fichiers vivent sous `skills/raptor-outillage/`
 *      et nulle part ailleurs.
 *   2. Un outil déposé est un outil TESTÉ. On ne suggère pas une commande
 *      qu'on n'a pas fait tourner.
 *   3. La compétence dit QUAND ne pas dépenser un agent — c'est là qu'est
 *      le gain, pas dans une liste d'astuces.
 */

const DOSSIER = "skills/raptor-outillage";

/** Le vérificateur de dépôts, éprouvé le 30/07 : 8 dépôts en 7,5 s. */
const VERIFIER_DEPOTS = `#!/usr/bin/env bash
# Verifie des depots GitHub — existence, derniere activite, licence, etoiles
# REELLES — sans depenser un seul agent.
#   verifier-depots.sh ollama/ollama stanfordnlp/dspy
#   verifier-depots.sh < liste.txt
set -uo pipefail
command -v gh > /dev/null 2>&1 || { echo "gh requis : brew install gh" >&2; exit 2; }

DEPOTS=()
if [ "$#" -gt 0 ]; then DEPOTS=("$@"); else
  while IFS= read -r l; do
    n=$(printf '%s' "$l" | sed -E 's#^https?://github\\.com/##; s#/$##; s#[[:space:]]##g')
    [ -n "$n" ] && DEPOTS+=("$n")
  done
fi
[ "\${#DEPOTS[@]}" -eq 0 ] && { echo "Aucun depot." >&2; exit 1; }

MAINTENANT=$(date +%s)
for d in "\${DEPOTS[@]}"; do
  brut=$(gh api "repos/$d" 2>/dev/null)
  if [ -z "$brut" ] || printf '%s' "$brut" | grep -q '"status":"404"'; then
    printf '  %-42s N EXISTE PAS\\n' "$d"; continue
  fi
  p=$(printf '%s' "$brut" | sed -n 's/.*"pushed_at":"\\([^"]*\\)".*/\\1/p' | head -1)
  lic=$(printf '%s' "$brut" | sed -n 's/.*"spdx_id":"\\([^"]*\\)".*/\\1/p' | head -1)
  et=$(printf '%s' "$brut" | sed -n 's/.*"stargazers_count":\\([0-9]*\\).*/\\1/p' | head -1)
  arc=$(printf '%s' "$brut" | grep -c '"archived":true')
  j=""; [ -n "$p" ] && { e=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$p" +%s 2>/dev/null || echo ""); [ -n "$e" ] && j=$(( (MAINTENANT - e) / 86400 )); }
  vie=inconnu
  if [ -n "$j" ]; then
    if [ "$arc" -gt 0 ]; then vie=archive
    elif [ "$j" -le 60 ]; then vie=actif
    elif [ "$j" -le 240 ]; then vie=calme
    else vie=dormant; fi
  fi
  printf '  %-42s %-9s %-12s %-12s %s etoiles\\n' "$d" "$vie" "\${p:0:10}" "\${lic:-—}" "\${et:-?}"
done
`;

/**
 * La compétence. Volontairement COURTE : une compétence longue ne se lit pas.
 * Elle enseigne UN principe et donne les outils qui le servent.
 */
const COMPETENCE = `---
name: raptor-outillage
description: >-
  Ne dépense pas un agent pour une question vérifiable. À charger dès qu'une
  tâche implique de vérifier des dépôts GitHub, de trancher entre « c'est
  mesurable » et « ça demande un jugement », ou de lancer plusieurs
  sous-agents pour de la collecte. Déposé par Raptor Raptor.
---

# Ne dépense pas un agent pour une question vérifiable

## Le principe

Un agent est **cher et lent** quand il répond à une question qui a une réponse
mécanique. Il est **irremplaçable** quand la question demande un jugement.

Avant de lancer un sous-agent, pose-toi la question : *est-ce que je pourrais
répondre avec une commande ?* Si oui, écris la commande.

## La mesure qui a produit cette règle

Le 30/07/2026, une veille multi-agents dépensait **un agent entier par dépôt
candidat** pour établir s'il existait et de quand il datait. Six angles de
recherche fois huit candidats : jusqu'à **48 agents**.

La même vérification en \`gh api\` : **8 dépôts en 7,5 secondes**, faux dépôt
détecté au passage.

## Le partage du travail

| la question | qui répond |
|---|---|
| Ce dépôt existe-t-il ? Vit-il ? Sous quelle licence ? | une commande |
| Combien d'étoiles, vraiment ? | une commande |
| Ce fichier contient-il X ? Ce test passe-t-il ? | une commande |
| Est-ce **utile pour NOTRE projet** ? | un agent |
| Ce défaut est-il **réel et atteignable** ? | un agent |
| Quelle option choisir, et pourquoi ? | un agent |

## Les outils déjà là

\`\`\`bash
~/.claude/skills/raptor-outillage/verifier-depots.sh ollama/ollama stanfordnlp/dspy
\`\`\`

Rend pour chaque dépôt : vie (actif / calme / dormant / archivé), date du
dernier envoi, licence, et le nombre d'étoiles **mesuré**.

## Le piège des chiffres lus

Les listes de dépôts qui circulent annoncent des étoiles **inventées**. Vérifié
le 30/07 : un post annonçait « 187k » pour un dépôt qui n'existe pas, Ollama à
« ~148 000 » quand il en a **177 248**, MarkItDown à « 148 000 » pour **170 066**.

**Un chiffre non mesuré est un chiffre faux.** Ne le recopie jamais : ouvre le
dépôt, ou dis « non vérifié ».

## Quand tu lances quand même des sous-agents

- **Groupe le déverrouillage d'outils** : un seul \`ToolSearch\` avec tous les
  outils prévus (\`select:WebFetch,WebSearch\`), jamais un par outil.
- **Fais-les converger, pas se répéter** : donne à chacun un angle distinct,
  sinon tu paies plusieurs fois la même recherche.
- **Vérifie mécaniquement AVANT de juger** : ne fais pas juger un agent sur un
  candidat qu'une commande aurait éliminé en une seconde.
`;

/**
 * Dépose l'outillage dans le dossier de configuration d'un compte.
 *
 * Idempotent et silencieux en cas d'échec : un dossier en lecture seule ou un
 * disque plein ne doit JAMAIS empêcher un agent de démarrer. L'outillage est
 * un bonus, pas une dépendance.
 */
export const deposerOutillage = Effect.fn("deposerOutillage")(function* (
  homePath: string,
): Effect.fn.Return<boolean, never, Path.Path | FileSystem.FileSystem> {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const dossier = path.join(homePath, DOSSIER);

  const pose = yield* Effect.gen(function* () {
    yield* fs.makeDirectory(dossier, { recursive: true });
    yield* fs.writeFileString(path.join(dossier, "SKILL.md"), COMPETENCE);
    const script = path.join(dossier, "verifier-depots.sh");
    yield* fs.writeFileString(script, VERIFIER_DEPOTS);
    // Sans le bit d'exécution, la compétence donnerait une commande qui
    // échoue — pire qu'une compétence absente.
    yield* fs.chmod(script, 0o755);
    return true;
  }).pipe(Effect.orElseSucceed(() => false));

  return pose;
});
