import { describe, expect, it } from "vite-plus/test";

import {
  distance,
  eveilDe,
  nu,
  peutSeReveiller,
  REPOS_APRES_EVEIL_SECONDES,
  toleranceDe,
} from "./motDEveil.ts";

describe("la transcription se trompe, et il faut vivre avec", () => {
  it("les erreurs courantes sur un mot isolé réveillent quand même", () => {
    // C'est le seul moment où le mot est prononcé sans contexte, donc le pire
    // cas pour la reconnaissance. Exiger l'exactitude rendrait le mot d'éveil
    // inutilisable, et l'humain conclurait que le micro ne marche pas.
    for (const entendu of ["raptor", "Raptor", "rapton", "raptro", "raptor,"]) {
      expect(eveilDe(`${entendu} relance l'usine`, "raptor"), entendu).not.toBeNull();
    }
  });

  it("une TRANSPOSITION coûte une seule correction", () => {
    // C'est l'erreur de transcription la plus fréquente. Levenshtein simple
    // la compterait pour deux, et « raptro » serait alors aussi loin de
    // « raptor » qu'un mot sans rapport.
    expect(distance("raptor", "raptro")).toBe(1);
  });

  it("les accents et la ponctuation ne décident de rien", () => {
    expect(nu("Râptôr, vas-y !")).toBe("raptor vas y");
  });
});

describe("mais pas trop large — sinon on coupe le micro", () => {
  it("un mot voisin mais distinct ne réveille pas", () => {
    // Un agent qui se réveille pendant qu'on parle à quelqu'un d'autre est
    // pire qu'un agent qui dort.
    for (const entendu of ["radiateur", "rapide", "captor", "raconte"]) {
      expect(eveilDe(`${entendu} et autre chose`, "raptor"), entendu).toBeNull();
    }
  });

  it("« captor » est à UNE correction — seule la première lettre le sépare", () => {
    // Aucune distance ne distingue « captor » de « rapton » : les deux sont à
    // une correction. On reconnaît un mot d'éveil à son attaque, c'est ce
    // qu'on entend en premier et ce que la transcription rate en dernier.
    expect(distance("raptor", "captor")).toBe(1);
    expect(distance("raptor", "rapton")).toBe(1);
    expect(eveilDe("captor vas-y", "raptor")).toBeNull();
    expect(eveilDe("rapton vas-y", "raptor")).not.toBeNull();
  });

  it("la tolérance SUIT la longueur du mot", () => {
    // Une erreur sur « ok » (50 %) n'est pas une erreur sur « raptor » (17 %).
    expect(toleranceDe("ok")).toBe(1);
    expect(toleranceDe("raptor")).toBe(1);
    expect(toleranceDe("ordinateur")).toBe(2);
  });
});

describe("la POSITION décide autant que le mot", () => {
  it("le mot d'éveil OUVRE la phrase", () => {
    expect(eveilDe("raptor, où en est l'usine", "raptor")).not.toBeNull();
  });

  it("un mot d'éveil enfoui ne réveille PAS", () => {
    // « Il faudrait un raptor pour ce travail » n'est pas un appel — et le
    // laisser passer réveillerait l'agent pendant une conversation qui ne le
    // concerne pas.
    expect(eveilDe("il faudrait un raptor pour ce travail", "raptor")).toBeNull();
  });

  it("mais un mot d'hésitation avant ne bloque pas", () => {
    // Les transcriptions insèrent volontiers un « euh », un « hé », un article.
    expect(eveilDe("euh raptor relance l'usine", "raptor")).not.toBeNull();
    expect(eveilDe("hé raptor", "raptor")).not.toBeNull();
  });
});

describe("ce que l'éveil emporte", () => {
  it("la demande qui suit, parce que c'est souvent tout le message", () => {
    const eveil = eveilDe("raptor relance l'usine sur les produits en attente", "raptor");
    expect(eveil?.demande).toBe("relance l usine sur les produits en attente");
  });

  it("un éveil seul a une demande vide, pas indéfinie", () => {
    expect(eveilDe("raptor", "raptor")?.demande).toBe("");
  });
});

describe("le repos après un éveil", () => {
  it("empêche la même phrase de réveiller deux fois", () => {
    // La transcription en flux rend le même segment plusieurs fois, enrichi :
    // sans repos, la fin de la phrase qui a réveillé l'agent le réveille
    // encore.
    expect(peutSeReveiller(0)).toBe(false);
    expect(peutSeReveiller(REPOS_APRES_EVEIL_SECONDES - 0.1)).toBe(false);
    expect(peutSeReveiller(REPOS_APRES_EVEIL_SECONDES)).toBe(true);
  });
});

describe("la distance d'édition", () => {
  it("compte les corrections nécessaires", () => {
    expect(distance("raptor", "raptor")).toBe(0);
    expect(distance("raptor", "rapton")).toBe(1);
    expect(distance("", "abc")).toBe(3);
    expect(distance("abc", "")).toBe(3);
  });
});

describe("rien à entendre", () => {
  it("le silence et le bruit ne réveillent pas", () => {
    for (const rien of ["", "   ", "...", "!!!"]) {
      expect(eveilDe(rien, "raptor"), JSON.stringify(rien)).toBeNull();
    }
  });
});
