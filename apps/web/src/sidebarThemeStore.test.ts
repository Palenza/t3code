import { describe, expect, it } from "vite-plus/test";

import {
  ACCENT_PAR_DEFAUT,
  makeSidebarThemeFromColors,
  sidebarThemeAccent,
  desepinglerApparence,
  sidebarThemeInk,
  resolveSidebarTheme,
  resolveSidebarThemeAppearance,
  sidebarThemeBackground,
  sidebarThemeGrainOpacity,
  type SidebarTheme,
} from "./sidebarThemeStore";

const theme = (overrides: Partial<SidebarTheme> = {}): SidebarTheme => ({
  stops: [{ color: "#5db3f0", x: 0.3, y: 0.2 }],
  intensity: 0.5,
  grain: 0.25,
  angle: 165,
  appearance: "auto",
  ...overrides,
});

describe("sidebarThemeBackground", () => {
  it("blends toward the dark base in dark mode and the light base in light mode", () => {
    const dark = sidebarThemeBackground(theme(), "dark");
    const light = sidebarThemeBackground(theme(), "light");
    expect(dark).toContain("color-mix(in oklab, #5db3f0 58%, #0e1116)");
    expect(light).toContain("#f7f9fc");
    expect(dark).not.toContain("#f7f9fc");
  });

  it("paints one radial per dot, at the dot's position", () => {
    const deux = sidebarThemeBackground(
      theme({
        stops: [
          { color: "#e5484d", x: 0.1, y: 0.9 },
          { color: "#4caf7d", x: 0.75, y: 0.25 },
        ],
      }),
      "dark",
    );
    expect(deux).toContain("at 10% 90%");
    expect(deux).toContain("at 75% 25%");
    expect(deux?.match(/radial-gradient/g)?.length).toBe(2);
  });

  it("orients the base linear gradient by the theme angle", () => {
    expect(sidebarThemeBackground(theme({ angle: 90 }), "dark")).toContain(
      "linear-gradient(90deg,",
    );
    expect(sidebarThemeBackground(theme({ angle: -90 }), "dark")).toContain(
      "linear-gradient(270deg,",
    );
  });

  it("maps intensity to the kept-colour percentage, bounded", () => {
    // Bornes recalées sciemment sur la vidéo d'Arc (29/07) : à fond, le
    // voile est de la couleur FRANCHE (90 %), pas un pastel plafonné à 68 %.
    expect(sidebarThemeBackground(theme({ intensity: 0 }), "dark")).toContain(" 25%,");
    expect(sidebarThemeBackground(theme({ intensity: 1 }), "dark")).toContain(" 90%,");
    expect(sidebarThemeBackground(theme({ intensity: 99 }), "dark")).toContain(" 90%,");
  });

  it("forces the blend base when the theme pins an appearance", () => {
    const pinnedLight = sidebarThemeBackground(theme({ appearance: "light" }), "dark");
    expect(pinnedLight).toContain("#f7f9fc");
    expect(resolveSidebarThemeAppearance(theme({ appearance: "dark" }), "light")).toBe("dark");
    expect(resolveSidebarThemeAppearance(theme(), "light")).toBe("light");
  });

  it("drops invalid colours and paints nothing when none are valid", () => {
    expect(
      sidebarThemeBackground(
        theme({
          stops: [
            { color: "pas-une-couleur", x: 0.5, y: 0.5 },
            { color: "#123", x: 0.5, y: 0.5 },
          ],
        }),
        "dark",
      ),
    ).toBeNull();
  });
});

describe("resolveSidebarTheme", () => {
  it("prefers the project theme, falls back to the default", () => {
    const projet = theme({ intensity: 0.9 });
    const defaut = theme({ intensity: 0.1 });
    const state = { theme: defaut, themesByProject: { "env:proj": projet } };
    expect(resolveSidebarTheme(state, "env:proj")).toBe(projet);
    expect(resolveSidebarTheme(state, "env:autre")).toBe(defaut);
    expect(resolveSidebarTheme(state, null)).toBe(defaut);
    expect(resolveSidebarTheme({ theme: null, themesByProject: {} }, "env:proj")).toBeNull();
  });
});

describe("makeSidebarThemeFromColors", () => {
  it("places colours on the default diagonal and caps at the maximum", () => {
    const migre = makeSidebarThemeFromColors(["#e5484d", "#4caf7d"]);
    expect(migre.stops).toHaveLength(2);
    expect(migre.stops[0]?.x).toBeCloseTo(0.28);
    expect(migre.appearance).toBe("auto");
    const sept = makeSidebarThemeFromColors(Array.from({ length: 9 }, () => "#5db3f0"));
    expect(sept.stops).toHaveLength(6);
  });
});

describe("sidebarThemeGrainOpacity", () => {
  // Golden RÉÉCRIT SCIEMMENT le 31/07, à la fin de l'enquête et pas à son
  // début : la molette de grain « ne faisait pas de grain » (reproche
  // fondateur). Cause — le bruit brut se serre autour du gris moyen et
  // `mix-blend-overlay` sur du gris moyen est quasi l'identité ; en plus, la
  // course linéaire rendait les six premiers crans indistinguables de zéro.
  // Le bruit est maintenant étalé en contraste et la course suit une
  // puissance 0,75 jusqu'à 0,42. Ce qui est TESTÉ reste l'invariant, pas la
  // constante : zéro donne zéro, ça ne dépasse jamais le plafond, et ça
  // MONTE cran après cran.
  it("caps the grain veil", () => {
    expect(sidebarThemeGrainOpacity(theme({ grain: 0 }))).toBe(0);
    expect(sidebarThemeGrainOpacity(theme({ grain: 1 }))).toBe(0.42);
    expect(sidebarThemeGrainOpacity(theme({ grain: 0.5 }))).toBeCloseTo(0.25, 2);
    expect(sidebarThemeGrainOpacity(theme({ grain: 2 }))).toBe(0.42);
  });

  it("monte à CHAQUE cran de la molette — sinon la molette ment", () => {
    // 20 crans mesurés sur la capture Arc ; la valeur d'un cran est
    // index/19. Un palier plat quelque part = un cran qui ne fait rien.
    const crans = Array.from({ length: 20 }, (_, index) =>
      sidebarThemeGrainOpacity(theme({ grain: index / 19 })),
    );
    for (const [index, valeur] of crans.entries()) {
      if (index === 0) continue;
      expect(valeur).toBeGreaterThan(crans[index - 1]!);
    }
    // Et le premier cran non nul se VOIT déjà (l'ancienne course linéaire le
    // posait à 0,018 — indiscernable de rien).
    expect(crans[1]!).toBeGreaterThan(0.04);
  });
});

describe("sidebarThemeInk", () => {
  it("switches at the luminance measured on Arc (0,40), not at a guess", () => {
    // Le cas qui a tout révélé (T4 filmé 29/07) : sur magenta saturé,
    // l'encre CLAIRE gagne le contraste (5,4:1, lisible) — ce qui rendait
    // le texte fantôme (1,6:1 mesuré) n'était pas ce choix mais l'opacité
    // 50-70 % des libellés, désormais rendue pleine sous voile.
    expect(
      sidebarThemeInk(
        theme({ stops: [{ color: "#cc00cc", x: 0.5, y: 0.5 }], intensity: 1, appearance: "dark" }),
        "dark",
      ),
    ).toBe("light-ink");
    // Doré d'Arc (L≈0,54, au-dessus du seuil) : encre sombre — exactement
    // ce que montre la capture pleine résolution.
    expect(
      sidebarThemeInk(
        theme({ stops: [{ color: "#e8b45a", x: 0.5, y: 0.5 }], intensity: 1, appearance: "light" }),
        "light",
      ),
    ).toBe("dark-ink");
    // Vraie nuit (bleu profond à fond) : là seulement, l'encre claire gagne.
    expect(
      sidebarThemeInk(
        theme({ stops: [{ color: "#0b1030", x: 0.5, y: 0.5 }], intensity: 1, appearance: "dark" }),
        "dark",
      ),
    ).toBe("light-ink");
  });

  it("follows the blend base when no valid stop exists", () => {
    expect(sidebarThemeInk(theme({ stops: [] }), "dark")).toBe("light-ink");
    expect(sidebarThemeInk(theme({ stops: [], appearance: "light" }), "light")).toBe("dark-ink");
  });
});

describe("sidebarThemeAccent", () => {
  // « Si quelqu'un change la palette de couleur, ça change aussi la palette de
  // ses notifs » — la règle en un test.
  it("prend la DOMINANTE du thème : les notifs parlent la couleur de l'espace", () => {
    expect(sidebarThemeAccent(makeSidebarThemeFromColors(["#4caf7d", "#5db3f0"]))).toBe("#4caf7d");
  });

  it("retombe sur le bleu de « Working » quand il n'y a pas de thème", () => {
    expect(sidebarThemeAccent(null)).toBe(ACCENT_PAR_DEFAUT);
    expect(sidebarThemeAccent(undefined)).toBe(ACCENT_PAR_DEFAUT);
    expect(sidebarThemeAccent(theme({ stops: [] }))).toBe(ACCENT_PAR_DEFAUT);
  });

  it("ignore une pastille de couleur invalide plutôt que de la peindre", () => {
    const abime = theme({
      stops: [
        { color: "pas-une-couleur", x: 0.5, y: 0.5 },
        { color: "#5db3f0", x: 0.5, y: 0.5 },
      ],
    });
    expect(sidebarThemeAccent(abime)).toBe("#5db3f0");
  });

  it("dépingle l'apparence héritée du mode nuit, et ne touche pas le reste", () => {
    // Le bouton lune est parti le 31/07 ; les enregistrements qu'il a écrits
    // sont restés. Sans ce dépinglage, un thème sauvé en nuit garde une base
    // nocturne pour toujours, sans plus aucun bouton pour le défaire.
    const epingle = theme({ appearance: "dark", intensity: 0.8, grain: 0.4 });
    const soigne = desepinglerApparence(epingle);
    expect(soigne.appearance).toBe("auto");
    expect(soigne.intensity).toBe(0.8);
    expect(soigne.grain).toBe(0.4);
    expect(soigne.stops).toEqual(epingle.stops);

    // Déjà sain : on rend l'objet TEL QUEL, pas une copie — un thème inchangé
    // ne doit pas provoquer de re-rendu à chaque hydratation.
    const sain = theme();
    expect(desepinglerApparence(sain)).toBe(sain);
  });
});
