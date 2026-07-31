import { assert, describe, it } from "@effect/vitest";

import {
  estDestructrice,
  formeDeCommande,
  JOURS_MINIMUM,
  OCCASIONS_MINIMUM,
  suggererDesAutorisations,
  type Refus,
} from "./SuggestionsDAutorisation.ts";

const RIEN = new Set<string>();

/** Un motif établi : assez d'occasions, sur assez de jours. */
const etabli = (commande: string, outil = "Bash"): ReadonlyArray<Refus> => [
  { outil, commande, jour: "2026-07-28" },
  { outil, commande, jour: "2026-07-29" },
  { outil, commande, jour: "2026-07-30" },
];

describe("le seuil, et ce qu'il attrape vraiment", () => {
  it("un motif établi sur plusieurs jours se propose", () => {
    const bilan = suggererDesAutorisations(etabli("git status --short"), RIEN);
    assert.lengthOf(bilan.suggestions, 1);
    assert.equal(bilan.suggestions[0]?.forme, "git status");
  });

  it("DOUZE refus le même jour ne se proposent PAS", () => {
    // Le reçu du chantier : sur les 13 refus réellement enregistrés, 12 sont
    // tombés le 29/07. Un compteur brut y lirait « motif écrasant ». C'était
    // un après-midi — une intention, pas une habitude.
    const memeJour = Array.from({ length: 12 }, () => ({
      outil: "Bash",
      commande: "git status",
      jour: "2026-07-29",
    }));
    const bilan = suggererDesAutorisations(memeJour, RIEN);
    assert.lengthOf(bilan.suggestions, 0);
    assert.include(bilan.ecartes.map((e) => e.pourquoi).join(" "), "même jour");
  });

  it("deux occasions sur deux jours ne suffisent pas non plus", () => {
    const bilan = suggererDesAutorisations(
      [
        { outil: "Bash", commande: "ls", jour: "2026-07-28" },
        { outil: "Bash", commande: "ls", jour: "2026-07-29" },
      ],
      RIEN,
    );
    assert.lengthOf(bilan.suggestions, 0);
  });

  it("l'écart nomme la limite, sa valeur ET l'observation (A7)", () => {
    const bilan = suggererDesAutorisations(
      [{ outil: "Bash", commande: "ls", jour: "2026-07-28" }],
      RIEN,
    );
    const pourquoi = bilan.ecartes.map((e) => e.pourquoi).join(" ");
    assert.include(pourquoi, String(OCCASIONS_MINIMUM));
    assert.include(pourquoi, String(JOURS_MINIMUM));
    assert.include(pourquoi, "1 occasion");
  });
});

describe("la fréquence n'est pas un consentement", () => {
  it("une commande destructrice ne se propose JAMAIS, même refusée cent fois", () => {
    // Cent refus de `rm -rf` ne sont pas cent arguments pour l'autoriser :
    // ce sont cent fois où le garde a fait son travail.
    const cent = Array.from({ length: 100 }, (_, i) => ({
      outil: "Bash",
      commande: "rm -rf /tmp/x",
      jour: `2026-07-${String((i % 20) + 10)}`,
    }));
    const bilan = suggererDesAutorisations(cent, RIEN);
    assert.lengthOf(bilan.suggestions, 0);
    assert.include(bilan.ecartes.map((e) => e.pourquoi).join(" "), "destructrice");
  });

  it("un sous-verbe destructeur d'un programme anodin est attrapé", () => {
    // `git status` est anodin, `git push --force` ne l'est pas : c'est au
    // sous-verbe que ça se joue, pas au programme.
    assert.isFalse(estDestructrice("git status"));
    assert.isTrue(estDestructrice("git push"));
    assert.lengthOf(suggererDesAutorisations(etabli("git push --force"), RIEN).suggestions, 0);
  });

  it("la sortie réseau et l'élévation ne se proposent pas", () => {
    for (const commande of ["curl https://x.test", "sudo ls", "ssh ailleurs"]) {
      assert.lengthOf(suggererDesAutorisations(etabli(commande), RIEN).suggestions, 0, commande);
    }
  });
});

describe("une suggestion est aussi étroite que sa preuve", () => {
  it("une chaîne shell n'est pas suggérable — son début ment sur sa suite", () => {
    // `git status && rm -rf /` commence par `git status` : autoriser la
    // forme autoriserait la suite.
    assert.isNull(formeDeCommande("git status && rm -rf /"));
    const bilan = suggererDesAutorisations(etabli("git status && rm -rf /"), RIEN);
    assert.lengthOf(bilan.suggestions, 0);
    assert.include(bilan.ecartes.map((e) => e.pourquoi).join(" "), "rm -rf");
  });

  it("un tube, une substitution, un point-virgule : pareil", () => {
    for (const commande of ["ls | grep x", "echo $(whoami)", "ls; ls", "cat <fichier"]) {
      assert.isNull(formeDeCommande(commande), commande);
    }
  });

  it("un chemin absolu ne se propose pas — il porte un nom qu'il n'a pas", () => {
    // `/tmp/x/rm` s'appelle `rm` sans être `rm`.
    assert.isNull(formeDeCommande("/tmp/x/ls"));
  });

  it("un drapeau n'est pas un sous-verbe", () => {
    assert.equal(formeDeCommande("ls -la"), "ls");
    assert.equal(formeDeCommande("git status"), "git status");
    assert.equal(formeDeCommande("pnpm"), "pnpm");
  });

  it("jamais l'outil nu : on ne donne pas tout le shell pour douze commandes", () => {
    const bilan = suggererDesAutorisations(etabli("git status"), RIEN);
    for (const suggestion of bilan.suggestions) {
      assert.notEqual(suggestion.forme, "Bash");
      assert.isTrue(suggestion.forme.length > 0);
    }
  });
});

describe("ce qu'on ne peut pas prouver se DIT", () => {
  it("un refus d'un AUTRE outil ne se lit pas comme une preuve manquante", () => {
    // Un `Write` refusé porte un chemin, donc arrive ici avec `commande:
    // null` — comme un refus mal rattaché. Les ranger ensemble ferait croire
    // qu'une meilleure jointure suffirait, alors que suggérer par chemin est
    // un autre métier.
    const bilan = suggererDesAutorisations(
      [{ outil: "Write", commande: null, jour: "2026-07-29" }],
      RIEN,
    );
    assert.lengthOf(bilan.suggestions, 0);
    assert.isUndefined(bilan.ecartes.find((e) => e.quoi.includes("sans leur commande")));
    const ecart = bilan.ecartes.find((e) => e.quoi.includes("autre outil que Bash"));
    assert.isDefined(ecart);
    assert.include(ecart?.pourquoi ?? "", "chemin");
  });

  it("un refus sans sa commande compte comme preuve manquante, pas comme vote", () => {
    const muets: ReadonlyArray<Refus> = Array.from({ length: 13 }, () => ({
      outil: "Bash",
      commande: null,
      jour: "2026-07-29",
    }));
    const bilan = suggererDesAutorisations(muets, RIEN);
    assert.lengthOf(bilan.suggestions, 0);
    const ecart = bilan.ecartes.find((e) => e.quoi.includes("sans leur commande"));
    assert.isDefined(ecart);
    assert.include(ecart?.quoi ?? "", "13");
    assert.include(ecart?.pourquoi ?? "", "preuves manquantes");
  });

  it("« rien à proposer » n'est pas « rien à autoriser » (H4)", () => {
    const bilan = suggererDesAutorisations(
      [{ outil: "Bash", commande: null, jour: "2026-07-29" }],
      RIEN,
    );
    assert.include(bilan.resume, "on n'a pas de quoi le prouver");
  });

  it("zéro refus se distingue de zéro suggestion", () => {
    // Les deux rendent une liste vide, et ils ne disent pas la même chose.
    const bilan = suggererDesAutorisations([], RIEN);
    assert.include(bilan.resume, "Aucun refus");
    assert.include(bilan.resume, "rien à en conclure");
  });

  it("le résumé rappelle qu'une suggestion n'autorise rien", () => {
    const bilan = suggererDesAutorisations(etabli("git status"), RIEN);
    assert.include(bilan.resume, "PROPOSITION");
    assert.include(bilan.resume, "humain");
  });
});

describe("ne pas reproposer l'acquis", () => {
  it("une forme déjà autorisée disparaît de la liste", () => {
    // Reproposer de l'acquis ferait douter de tout le reste.
    const bilan = suggererDesAutorisations(etabli("git status"), new Set(["git status"]));
    assert.lengthOf(bilan.suggestions, 0);
  });
});

describe("l'ordre : la preuve d'abord, le volume ensuite", () => {
  it("trois jours battent un plus gros volume sur deux jours", () => {
    const refus: ReadonlyArray<Refus> = [
      ...etabli("git status"),
      ...Array.from({ length: 9 }, (_, i) => ({
        outil: "Bash",
        commande: "pnpm test",
        jour: i < 5 ? "2026-07-28" : "2026-07-29",
      })),
    ];
    const bilan = suggererDesAutorisations(refus, RIEN);
    assert.equal(bilan.suggestions[0]?.forme, "git status");
    assert.equal(bilan.suggestions[0]?.jours, 3);
  });

  it("chaque suggestion porte de quoi juger sans relire la base", () => {
    const bilan = suggererDesAutorisations(etabli("git status --short"), RIEN);
    assert.isNotEmpty(bilan.suggestions[0]?.exemples ?? []);
    assert.include(bilan.suggestions[0]?.exemples[0] ?? "", "git status --short");
  });
});
