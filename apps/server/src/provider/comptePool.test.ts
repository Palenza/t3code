import type { ProviderInstanceId, ServerProviderRateLimits } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { assert, describe, it } from "vite-plus/test";

import {
  appliquerEchec,
  chargeDe,
  choisir,
  classerEchec,
  etatA,
  type Candidat,
  type SanteCompte,
} from "./comptePool.ts";

const MAINTENANT = Date.parse("2026-07-29T22:00:00.000Z");
const id = (valeur: string) => valeur as ProviderInstanceId;
const sain = (valeur: string): SanteCompte => ({ instanceId: id(valeur), etat: "ok" });

const quotas = (...pourcents: ReadonlyArray<number>): ServerProviderRateLimits => ({
  observedAt: "2026-07-29T21:59:00.000Z",
  windows: pourcents.map((utilization, index) => ({
    kind: `fenetre-${index}`,
    utilization,
  })),
});

describe("classement des échecs", () => {
  it("un jeton révoqué est MORT, pas en refroidissement", () => {
    // Le remettre en rotation brûlerait un essai à chaque tour, pour toujours.
    for (const message of [
      "OAuth error: token_revoked",
      "invalid_grant: refresh token rejected",
      "Your authentication token has been invalidated.",
      "refresh_token_reused by another process",
    ]) {
      const verdict = classerEchec({ code: 401, message, maintenant: MAINTENANT });
      assert.strictEqual(verdict.nature, "authentification-morte", message);
      assert.strictEqual(verdict.repriseA, undefined, "un mort n'a pas d'heure de reprise");
    }
  });

  it("une session OAuth expirée est MORTE — la phrase exacte vue le 30/07", () => {
    // « Failed to authenticate: OAuth session expired and could not be
    // refreshed » ne correspondait à AUCUN motif : elle passait pour un
    // hoquet transitoire, et le fil restait mort. Le rafraîchissement a déjà
    // échoué — attendre ne ranime rien, il faut se reconnecter.
    const verdict = classerEchec({
      message: "Failed to authenticate: OAuth session expired and could not be refreshed",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "authentification-morte");
    assert.strictEqual(verdict.reconnu, true);
  });

  it("un message INCONNU s'avoue inconnu au lieu de se déguiser en verdict", () => {
    // Le vrai correctif de la nuit du 30/07. Deux pannes reelles avaient
    // traversé ce classement sans être vues ; ajouter un motif ne corrige que
    // le cas d'hier. Ici on fige la CLASSE : tout ce qui n'est pas reconnu le
    // DIT, et l'appelant le crie avec le texte exact.
    const verdict = classerEchec({
      message: "Une panne que personne n'a encore jamais vue passer ici",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "transitoire");
    assert.strictEqual(verdict.reconnu, false);
  });

  it("le SOLDE épuisé est reconnu — la phrase exacte vue le 30/07", () => {
    // Cette phrase-là, mot pour mot, a tué un tour en « Runtime error » : aucun
    // motif de quota ne l'attrapait, donc le relais n'a pas tiré. Elle est
    // épinglée ici pour qu'une reformulation du fournisseur casse le test au
    // lieu de casser le relais en silence.
    const verdict = classerEchec({
      message:
        "You're out of usage credits. Run /usage-credits to keep using Fable 5 or /model to switch models.",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "quota");
    // Un solde ne repart pas tout seul dans l'heure : on écarte le compte
    // longtemps plutôt que de le sonder pour rien.
    // `repriseA` est optionnel dans le type : son ABSENCE serait un compte
    // remis en rotation aussitôt, donc on l'exige explicitement.
    assert.ok(verdict.repriseA !== undefined, "un solde vide a une heure de reprise");
    assert.ok(
      Date.parse(verdict.repriseA ?? "") - MAINTENANT > 6 * 60 * 60_000,
      "un solde vide s'écarte pour bien plus qu'une heure",
    );
  });

  it("les autres formulations de solde vide sont couvertes", () => {
    for (const message of [
      "Insufficient credits for this request",
      "Your credit balance is too low to continue",
      "No credits remaining on this account",
      "You are out of credits",
    ]) {
      assert.strictEqual(
        classerEchec({ message, maintenant: MAINTENANT }).nature,
        "quota",
        message,
      );
    }
  });

  it("une requête invalide n'est la faute d'AUCUN compte", () => {
    // Sans ce cas, un 400 brûlerait les trois comptes pour la même erreur.
    const verdict = classerEchec({
      code: 400,
      message: "messages: field required",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "notre-faute");
  });

  it("un quota atteint refroidit une heure", () => {
    const verdict = classerEchec({
      code: 429,
      message: "rate limit exceeded",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "quota");
    assert.strictEqual(verdict.repriseA, "2026-07-29T23:00:00.000Z");
  });

  it("un 401 sans cause mortelle refroidit cinq minutes, pas une heure", () => {
    // Souvent un jeton en cours de rafraîchissement : une installation à un
    // seul compte doit pouvoir s'en remettre sans attendre une heure.
    const verdict = classerEchec({ code: 401, message: "unauthorized", maintenant: MAINTENANT });
    assert.strictEqual(verdict.nature, "transitoire");
    assert.strictEqual(verdict.repriseA, "2026-07-29T22:05:00.000Z");
  });

  it("l'heure annoncée par le fournisseur écrase notre estimation", () => {
    const verdict = classerEchec({
      code: 429,
      message: "usage limit reached",
      repriseAnnoncee: "2026-07-30T04:30:00.000Z",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.repriseA, "2026-07-30T04:30:00.000Z");
  });

  it("le refus en TEXTE de la CLI est reconnu, sans aucun code HTTP", () => {
    // Le cas vérifié en vrai le 29/07 : le refus arrive en texte d'assistant,
    // sans événement machine. C'est exactement là que le relais doit marcher.
    const verdict = classerEchec({
      message: "You've hit your session limit · resets 12:50pm",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(verdict.nature, "quota");
  });
});

describe("l'abonnement qui se termine — la panne du 06/08", () => {
  // Un compte Max du fondateur se termine le 06/08/2026. Sondé sur ce
  // classifieur AVANT correctif : « Your Claude Pro subscription has
  // expired » (403) tombait en « notre-faute », la seule nature qui INTERDIT
  // de basculer. Chaque tour serait reparti sur le compte fini, aurait
  // échoué, et rien n'aurait basculé vers les comptes encore valides.
  const messages = [
    "Your Claude Pro subscription has expired",
    "This account does not have an active subscription",
    "Your subscription has ended. Resubscribe to continue.",
    "No active plan for this account",
    "Your plan is cancelled",
    "Please renew your subscription",
  ];

  for (const message of messages) {
    it(`reconnaît « ${message.slice(0, 42)} »`, () => {
      const verdict = classerEchec({ code: 403, message, maintenant: MAINTENANT });
      assert.strictEqual(verdict.nature, "abonnement-fini");
      assert.strictEqual(verdict.reconnu, true);
    });
  }

  it("écarte le compte, avec le remède qui n'est PAS celui d'un jeton mort", () => {
    // Les deux exclusions sont identiques ; les deux conseils sont opposés.
    // « Reconnecte-toi » sur un abonnement fini fait chercher une panne qui
    // n'existe pas : la reconnexion réussit, et le compte reste inutilisable.
    const fini = appliquerEchec(
      { instanceId: id("A"), etat: "ok" },
      classerEchec({ code: 403, message: "subscription has expired", maintenant: MAINTENANT }),
      "subscription has expired",
      MAINTENANT,
    );
    assert.strictEqual(fini.etat, "mort");
    assert.strictEqual(fini.remede, "reabonnement");

    const revoque = appliquerEchec(
      { instanceId: id("A"), etat: "ok" },
      classerEchec({ code: 401, message: "token_revoked", maintenant: MAINTENANT }),
      "token_revoked",
      MAINTENANT,
    );
    assert.strictEqual(revoque.etat, "mort");
    assert.strictEqual(revoque.remede, "reconnexion");
  });

  it("l'emporte sur le repli 4xx, qui l'avalait en silence", () => {
    // Le cas exact qui rendait la panne invisible : le message est reconnu
    // AVANT que le code 403 ne le range en « notre-faute ».
    for (const code of [400, 402, 403]) {
      const verdict = classerEchec({
        code,
        message: "Your subscription has expired",
        maintenant: MAINTENANT,
      });
      assert.strictEqual(verdict.nature, "abonnement-fini", `code ${code}`);
    }
  });
});

describe("402 et 403 parlent du COMPTE, jamais de la requête", () => {
  it("ne prétend plus comprendre un 403 dont le message est inconnu", () => {
    // AVANT : « notre-faute », reconnu: true — donc aucune bascule, et
    // personne n'était prévenu qu'on ne comprenait pas. Deux mensonges en un.
    const verdict = classerEchec({
      code: 403,
      message: "Forbidden",
      maintenant: MAINTENANT,
    });
    assert.notStrictEqual(verdict.nature, "notre-faute");
    assert.strictEqual(verdict.reconnu, false);
  });

  it("laisse sa place aux autres comptes plutôt que de brûler le tour", () => {
    const apres = appliquerEchec(
      { instanceId: id("A"), etat: "ok" },
      classerEchec({ code: 402, message: "Payment Required", maintenant: MAINTENANT }),
      "Payment Required",
      MAINTENANT,
    );
    // Écarté au moins temporairement : c'est ce qui permet à la bascule de
    // choisir un autre compte. Avec « notre-faute », l'état restait « ok » et
    // le tour repartait indéfiniment sur le compte cassé.
    assert.strictEqual(apres.etat, "refroidissement");
  });

  it("laisse les VRAIES mauvaises requêtes en « notre-faute »", () => {
    // Le fil-piège ne doit pas s'élargir : un 400 ou un 422 quelconque parle
    // bien de notre requête, et basculer y reproduirait la même erreur.
    for (const code of [400, 404, 422]) {
      const verdict = classerEchec({ code, message: "Bad Request", maintenant: MAINTENANT });
      assert.strictEqual(verdict.nature, "notre-faute", `code ${code}`);
    }
  });
});

describe("santé d'un compte", () => {
  it("un refroidissement expiré redevient utilisable tout seul", () => {
    const sante: SanteCompte = {
      instanceId: id("A"),
      etat: "refroidissement",
      repriseA: "2026-07-29T21:00:00.000Z",
    };
    assert.strictEqual(etatA(sante, MAINTENANT), "ok");
  });

  it("un mort ne revient JAMAIS de lui-même", () => {
    const mort: SanteCompte = { instanceId: id("A"), etat: "mort" };
    assert.strictEqual(etatA(mort, MAINTENANT + 100 * 24 * 3_600_000), "mort");
  });

  it("« notre faute » ne punit pas le compte", () => {
    const apres = appliquerEchec(
      sain("A"),
      { nature: "notre-faute", reconnu: true },
      "400",
      MAINTENANT,
    );
    assert.strictEqual(apres.etat, "ok");
  });
});

describe("choix du compte", () => {
  const candidats = (
    ...entrees: ReadonlyArray<[string, SanteCompte, ServerProviderRateLimits | undefined]>
  ): ReadonlyArray<Candidat> =>
    entrees.map(([nom, sante, mesures]) => ({
      instanceId: id(nom),
      sante,
      quotas: mesures,
    }));

  it("vide les comptes qui dorment avant celui qui étouffe", () => {
    // L'état réel du 29/07 : A à 94 %, B à 26 %, C à 37 %.
    const choisi = choisir({
      candidats: candidats(
        ["A", sain("A"), quotas(0, 94)],
        ["B", sain("B"), quotas(0, 26)],
        ["C", sain("C"), quotas(27, 37)],
      ),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("solde Fable vide sur A : le relais part sur B, qui n'y a pas touché", () => {
    // L'état RÉEL relevé sur l'écran du fondateur le 30/07, à la minute où le
    // tour est mort : A — 5 h 2 %, 7 j 95 %, 7 j·Fable 100 % · B — 0 %, 26 %,
    // Fable 0 % · C — 10 %, 49 %, Fable 70 %.
    //
    // Ce test dit la chose qui compte : le remplaçant EXISTAIT. Le relais
    // n'avait pas de problème de choix, il avait un problème de lecture — la
    // phrase « out of usage credits » n'était reconnue par aucun motif, donc
    // il n'a jamais été appelé.
    const choisi = choisir({
      candidats: candidats(
        ["A", sain("A"), quotas(2, 95, 100)],
        ["B", sain("B"), quotas(0, 26, 0)],
        ["C", sain("C"), quotas(10, 49, 70)],
      ),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("c'est la fenêtre la PLUS entamée qui décide, pas la moyenne", () => {
    // A a une moyenne plus basse, mais une fenêtre à 99 % : c'est elle qui
    // le fera tomber au prochain tour.
    assert.strictEqual(chargeDe(quotas(0, 0, 99)), 99);
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), quotas(0, 0, 99)], ["B", sain("B"), quotas(40, 40)]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("un compte déjà tenté dans ce tour n'est pas rejoué", () => {
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), quotas(10)], ["B", sain("B"), quotas(80)]),
      strategie: "moins-charge",
      dejaTentes: new Set([id("A")]),
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });

  it("morts et refroidis sont écartés", () => {
    const choisi = choisir({
      candidats: candidats(
        ["A", { instanceId: id("A"), etat: "mort" }, quotas(0)],
        [
          "B",
          { instanceId: id("B"), etat: "refroidissement", repriseA: "2026-07-30T02:00:00.000Z" },
          quotas(0),
        ],
        ["C", sain("C"), quotas(88)],
      ),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("C"));
  });

  it("plus rien de disponible renvoie null — à DIRE, jamais à masquer", () => {
    const choisi = choisir({
      candidats: candidats(["A", { instanceId: id("A"), etat: "mort" }, undefined]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi, null);
  });

  it("un compte sans mesure n'est pas condamné à ne jamais servir", () => {
    // Sans mesure = rien de consommé qu'on sache. Le compter comme chargé
    // l'exclurait définitivement, y compris au tout premier démarrage.
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), quotas(50)], ["B", sain("B"), undefined]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"));
  });
  it("un compte que le fournisseur a REJETÉ n'est jamais le préféré, même sans pourcentage", () => {
    // Cas réel du 28/07 : la fenêtre « rejected » arrive SANS utilization —
    // elle scorait 0 et devenait le compte le moins chargé du relais.
    const rejeteSansMesure: ServerProviderRateLimits = {
      observedAt: "2026-07-29T21:59:00.000Z",
      windows: [{ kind: "seven_day", severity: "rejected" }],
    };
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), rejeteSansMesure], ["B", sain("B"), quotas(96)]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("B"), "le compte sain à 96 % passe avant le rejeté");
  });

  it("quand il ne reste QUE des rejetés, on tente quand même — jamais d'abandon muet", () => {
    const rejete: ServerProviderRateLimits = {
      observedAt: "2026-07-29T21:59:00.000Z",
      windows: [{ kind: "seven_day", severity: "rejected", utilization: 94 }],
    };
    const choisi = choisir({
      candidats: candidats(["A", sain("A"), rejete]),
      strategie: "moins-charge",
      maintenant: MAINTENANT,
    });
    assert.strictEqual(choisi?.instanceId, id("A"));
  });
});

describe("l'attente des transitoires est une PRÉDICTION, pas une constante", () => {
  // Des ATTENDUS littéraux, jamais recalculés : un test qui refait le calcul
  // de l'implémentation dérive avec elle et finit par ne plus rien prouver.
  // Les ENTRÉES, elles, suivent l'horloge : depuis la garde d'échelle du
  // 02/08 (volée à cliproxy), un échec pendant un refroidissement OUVERT ne
  // compte pas — cinq fils qui voient le même hoquet sont UN incident. La
  // rampe ne s'éprouve donc que d'incident en incident, chaque échec partant
  // une seconde après la reprise du précédent.
  // (MAINTENANT = 2026-07-29T22:00:00Z)
  const DANS_1H = "2026-07-29T23:00:00.000Z";
  const DANS_12H = "2026-07-30T10:00:00.000Z";

  const transitoire = (repriseA: string) => ({
    nature: "transitoire" as const,
    repriseA,
    reconnu: true,
  });

  /** L'attente depuis un instant donné, en heures. */
  const attenteDepuis = (sante: SanteCompte, quand: number): number =>
    (Date.parse(sante.repriseA ?? "") - quand) / 3_600_000;

  /** Rejoue `n` incidents DISTINCTS, même attente annoncée à chaque fois. */
  const incidents = (n: number, annonceMs: number, reconnu = true) => {
    let sante = sain("A");
    let quand = MAINTENANT;
    const attentes: number[] = [];
    for (let essai = 0; essai < n; essai += 1) {
      sante = appliquerEchec(
        sante,
        {
          nature: "transitoire" as const,
          // Pas de `new Date` (règle globalDate) : l'ISO se fabrique par
          // l'époque, comme partout dans ces tests.
          repriseA: DateTime.formatIso(DateTime.makeUnsafe(quand + annonceMs)),
          reconnu,
        },
        "hoquet",
        quand,
      );
      attentes.push(attenteDepuis(sante, quand));
      quand = Date.parse(sante.repriseA ?? "") + 1_000;
    }
    return { sante, attentes };
  };

  it("respecte l'attente MESURÉE aux deux premiers incidents", () => {
    // Le verdict a déduit cette attente d'un signal réel (401 → 5 min,
    // 429 → 1 h). L'escalader d'entrée remplacerait un fait par une supposition.
    const { attentes, sante } = incidents(2, 3_600_000);
    assert.deepStrictEqual(attentes, [1, 1]);
    assert.strictEqual(sante.echecsDAffilee, 2);
  });

  it("un échec PENDANT le refroidissement est le MÊME incident — rien ne bouge", () => {
    // Reçu cliproxy, rejoué le 02/08 : un hoquet réseau de 30 s est vu par
    // chaque fil en vol. Sans cette garde, cinq fils infligeaient cinq
    // punitions — 1 h, 1 h, 4 h, 4 h, 12 h — pour un seul incident.
    const un = appliquerEchec(sain("A"), transitoire(DANS_1H), "hoquet", MAINTENANT);
    const rejoue = appliquerEchec(un, transitoire(DANS_1H), "hoquet", MAINTENANT + 30_000);
    // La MÊME référence : rien écrit, rien signalé, l'échelle n'a pas avancé.
    assert.strictEqual(rejoue, un);
  });

  it("un hoquet n'a PAS le droit de ressusciter un compte mort", () => {
    // Sans la garde, un échec transitoire arrivé APRÈS la mort rétrogradait
    // « mort » en simple refroidissement — et le compte revenait en rotation
    // une heure plus tard alors qu'on le SAIT cassé.
    const mort = appliquerEchec(
      sain("A"),
      { nature: "authentification-morte", reconnu: true },
      "token_revoked",
      MAINTENANT,
    );
    const apres = appliquerEchec(mort, transitoire(DANS_1H), "hoquet", MAINTENANT + 60_000);
    assert.strictEqual(apres, mort);
  });

  it("ESCALADE quand la même panne se répète — « transitoire » devient faux", () => {
    // Avant l'escalade, cette suite valait [1, 1, 1, 1, 1, 1] : un compte
    // définitivement cassé dont l'erreur ressemble à un hoquet était retenté
    // toutes les heures, à vie.
    const { attentes, sante } = incidents(6, 3_600_000);
    assert.deepStrictEqual(attentes, [1, 1, 4, 4, 12, 12]);
    assert.strictEqual(sante.echecsDAffilee, 6);
  });

  it("ne dépasse JAMAIS le plafond, même sur une attente de départ énorme", () => {
    // 6 h × 12 = 72 h sans plafond. Un compte écarté trois jours pour un
    // hoquet serait pire que le mal.
    const { attentes } = incidents(5, 6 * 3_600_000);
    assert.strictEqual(attentes.at(-1), 12);
  });

  it("n'escalade PAS un quota — le fournisseur a dit quand il revient", () => {
    const reprise = DANS_12H;
    let sante = sain("A");
    for (let essai = 0; essai < 5; essai += 1) {
      sante = appliquerEchec(
        sante,
        { nature: "quota", repriseA: reprise, reconnu: true },
        "à sec",
        MAINTENANT,
      );
    }
    // La reprise est MESURÉE, pas devinée : l'escalader la rendrait fausse.
    assert.strictEqual(sante.repriseA, reprise);
    assert.strictEqual(sante.echecsDAffilee, undefined);
  });

  it("notre propre bug ne fait PAS grandir l'attente d'un compte sain", () => {
    const avant = appliquerEchec(sain("A"), transitoire(DANS_1H), "hoquet", MAINTENANT);
    const apres = appliquerEchec(
      avant,
      { nature: "notre-faute", reconnu: true },
      "400",
      MAINTENANT,
    );
    // Punir un compte pour une requête qu'on a mal formée l'écarterait pour
    // rien — et masquerait notre propre bug derrière un compte « malade ».
    assert.strictEqual(apres.echecsDAffilee, 1);
    assert.strictEqual(apres, avant);
  });

  it("un message INCONNU escalade aussi — c'est là que ça compte le plus", () => {
    // Un message qu'on n'a pas su lire est rangé en « transitoire » par
    // prudence. Sans escalade, cette prudence devenait une boucle infinie.
    const { attentes } = incidents(5, 3_600_000, false);
    assert.strictEqual(attentes.at(-1), 12);
  });
});

describe("les 2 pannes non reconnues du 31/07", () => {
  // L'app les avait signalées elle-même (« 2 pannes non reconnues ») : elles
  // tombaient en « transitoire », donc le pool basculait de compte — alors
  // qu'aucune ne vient du compte, et que le suivant échouera pareil.
  it("une session introuvable NE fait PAS basculer de compte", () => {
    const verdict = classerEchec({
      message: "No conversation found with session ID: d9b0e2ac-c145-4228-9c7a-47cd5a8fdf9b",
      maintenant: 0,
    });
    assert.strictEqual(verdict.nature, "notre-faute");
    assert.strictEqual(verdict.reconnu, true);
  });

  it("un diagnostic d'état incohérent NE fait PAS basculer non plus", () => {
    const verdict = classerEchec({
      message: "[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use",
      maintenant: 0,
    });
    assert.strictEqual(verdict.nature, "notre-faute");
    assert.strictEqual(verdict.reconnu, true);
  });

  it("un adaptateur fermé non plus, même annoncé en 5xx", () => {
    // Le piège : un 5xx serait classé « transitoire » plus bas. Le motif de
    // session cassée doit passer AVANT.
    const verdict = classerEchec({
      code: 500,
      message: "ProviderAdapterSessionClosedError: claudeAgent adapter thread is closed: 902afe28",
      maintenant: 0,
    });
    assert.strictEqual(verdict.nature, "notre-faute");
  });
});
