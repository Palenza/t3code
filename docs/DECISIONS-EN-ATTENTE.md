# Décisions en attente — chantier Hermès

> Quatre questions. Elles débloquent **15 des 25 lignes restantes** du
> catalogue (`CHANTIER-HERMES.md`).
>
> Chacune porte : ce qui est déjà fait, ce que ta réponse déclenche, et **une**
> reco — jamais un menu (M2). Réponds en marquant la case ; je pars de là.
>
> Ce fichier existe parce que le compteur « 25 restants » ne dit pas ce qu'ils
> attendent. Trois sur quatre attendent une phrase de toi, pas du code.

---

## 1 · La passerelle — T3 doit-il répondre depuis Telegram ?

**Débloque 8 lignes** (n°38 → 45 : streaming vers les messageries, livraison
fiable, autorisation par canal, SDK de plateforme, Telegram puis Discord/
Slack/WhatsApp/Signal, cycle de vie, `/handoff`, `/clarify`).

**Ce qui est déjà vérifié.** Le triage disait « rien ne marche sans le bail de
tour (n°37) ». C'est faux : leur bail répond à une forme qu'on n'a pas — leurs
gardes sont indexés par clé de routage, la transcription par session_id, et le
lien est plusieurs-vers-un. Chez nous c'est `Map<ThreadId, Context>` un pour
un, le dispatch est sérialisé par file, et le réacteur consomme un élément à
la fois. **Ces 8 lignes n'attendent aucun maillon technique.**

**Ce que ça engage.** Un produit dans le produit : T3 hors de la machine.
Compte plusieurs sessions, et une surface d'autorisation neuve (qui a le droit
de parler à ton agent depuis un canal public ?).

**Ma reco : pas maintenant.** Le catalogue a des lignes qui servent T3 sur ta
machine et qui coûtent dix fois moins. La passerelle vaut le jour où tu veux
piloter une usine depuis ton téléphone — pas avant.

- [ ] on y va
- [ ] plus tard _(reco)_
- [ ] jamais — j'écarte les 8 lignes

---

## 2 · T3 a-t-il le droit d'installer des skills dans ton home Claude ?

**Débloque 2 lignes** (n°52 bundles, n°53 compatibilité agentskills.io) et la
seconde moitié du n°50.

**Ce qui est déjà fait.** Les 69 skills d'Hermès sont **triées** : passées au
scanner (n°10) et aux normes (n°4), tableau complet via
`scripts/trier-skills-hermes.ts`. Résultat : **30 refusées sur pièce** (`curl`
d'exfiltration, accès SSH, config git globale, `curl | sh`), et leurs 69
descriptions pèsent 3 801 caractères — **moins de la moitié de nos 18**.

**Ce que ça engage.** Écrire dans ton home Claude : là où vivent tes
identifiants, tes conversations, tes propres skills. C'est l'endroit que notre
propre désinstalleur classe « ne se touche JAMAIS » (n°58). T3 y dépose déjà
une skill d'outillage, donc le précédent existe — mais installer du code tiers
n'est pas la même chose que déposer le nôtre.

**Ma reco : oui, mais jamais automatiquement.** L'inspection est déjà livrée
et ne touche rien. L'installation ne se fait que sur ton geste explicite, une
skill à la fois, avec le rapport du scanner sous les yeux.

- [ ] oui, avec confirmation à chaque skill _(reco)_
- [ ] oui, automatique si le scan est vert
- [ ] non — j'écarte les 2 lignes

---

## 3 · Les surfaces et l'habillage — lesquelles ont un sens pour T3 ?

**Débloque 7 lignes.** Elles touchent ce que T3 EST, donc c'est ton terrain.

| ligne                        | ce que c'est                                  | ma reco                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **64** computer use          | contrôle du bureau entier                     | **écarter** — `preview` fait déjà les 14 gestes sur un navigateur ; le bureau est la plus large surface d'attaque qu'on puisse s'ajouter, et une page hostile piloterait la machine                          |
| **65** mot d'éveil           | 3 moteurs ONNX embarqués, aucun audio ne sort | **à toi** — on a déjà la VAD et la transcription dans `voice-core` ; c'est le dernier maillon d'un usage mains libres                                                                                        |
| **66** TTS en streaming      | l'agent parle                                 | **à toi** — même famille que le 65, les deux vont ensemble ou pas du tout                                                                                                                                    |
| **67** kanban                | décomposition, essaim, watchers (10 010 l.)   | **écarter pour l'instant** — c'est un produit entier, et T3 a déjà les fils                                                                                                                                  |
| **69** images et vidéos      | génération                                    | **à toi** — engage de l'argent (clés d'API)                                                                                                                                                                  |
| **79** bannière, onboarding  | première ouverture                            | **à toi** — ton et marque                                                                                                                                                                                    |
| **80** achievements + petdex | gamification                                  | **écarter** — les badges fêtent l'USAGE de l'outil ; T3 sert à finir un travail. Une progression qu'on récompense pousse à faire plus de tours, quand le bon tour est celui qu'on n'a pas eu besoin de faire |

- [ ] j'écarte tout sauf : **\_\_**
- [ ] je prends tout
- [ ] on en reparle une par une

---

## 4 · Le CLI que T3 lance expose-t-il déjà `/goal` ?

**Débloque 1 ligne** (n°8, la boucle Ralph — juge après chaque tour,
continuation à cache intact, juge fail-open).

**Ce qui est vérifié.** T3 n'a aucun `/goal` à lui, et le SDK n'en expose
aucun — ni option, ni sous-type de commande. La boucle qu'on utilise
aujourd'hui est celle du CLI Claude Code.

**Ce qui est invérifiable d'ici (A1).** Je n'ai pas trouvé le bundle du CLI
sur cette machine pour regarder sa liste de commandes. Si le CLI que le SDK
lance expose `/goal` à tes utilisateurs, la ligne se ferme ; sinon elle vaut
la peine, parce que le juge-après-chaque-tour est ce qui fait tenir une
session autonome.

- [ ] oui, il l'expose → j'écarte le n°8
- [ ] non → je le construis
- [ ] je ne sais pas → je vais vérifier autrement

---

## Hors catalogue, et ça n'attend rien

**`~/.t3/userdata/clerk-tokens.json` est en 0666.** Un jeton
d'authentification que n'importe quel compte de cette machine peut
**remplacer** — pas seulement lire. Il est posé ainsi par
`@clerk/electron/storage`, une dépendance : on ne peut pas corriger son mode
d'écriture, seulement le resserrer après coup. L'audit de démarrage le dit
maintenant à chaque lancement (n°20).

**Ma reco : `chmod 0600` au démarrage ET garder l'avertissement.** Le chmod
ferme la fenêtre la plupart du temps ; l'avertissement empêche de croire que
c'est réglé le jour où la dépendance réécrit le fichier.

- [ ] fais-le
- [ ] laisse l'avertissement seul
