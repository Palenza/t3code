import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

// L'import réunit les deux côtés : leurs deux nouveaux symboles rejoignent
// ceux dont notre test de fork se sert.
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  StageBackdropArt,
  StageBackdropButtonArt,
  useEnvironmentStageLabel,
} from "./SidebarStageBackdrop";

describe("resolveSidebarStageBackdropVariant", () => {
  // Décision fork : un habillage sur TOUS les canaux — l'amont laisse le
  // nôtre (« Raptor ») sans rien. Depuis le 29/07 cet habillage est
  // l'ardoise griffée de l'identité Raptor, plus le ciel étoilé amont.
  it.each(["Raptor", "Dev", "Nightly", "quelconque"])(
    "gives every channel the nightly sky (%s)",
    (stageLabel) => {
      expect(resolveSidebarStageBackdropVariant(stageLabel)).toBe("nightly");
    },
  );
});

describe("SidebarStageBackdrop", () => {
  // RÉÉCRIT SCIEMMENT à la fusion du 30/07, pas forcé au vert.
  //
  // L'amont n'habille que « Dev » et « Nightly », et rend `null` ailleurs.
  // Notre fork habille TOUS les canaux — sans quoi « Raptor », qui est le
  // nôtre, n'aurait aucune identité visuelle. C'est une divergence VOULUE,
  // déjà couverte par le test au-dessus.
  //
  // Ce qui reste vrai des deux côtés et mérite d'être gardé : le drapeau
  // d'activation. Désactivé, il n'y a pas d'habillage, chez eux comme chez
  // nous.
  it("respecte le drapeau d'activation, quel que soit le canal", () => {
    expect(resolveSidebarStageBackdropVariant("Dev", false)).toBeNull();
    expect(resolveSidebarStageBackdropVariant("Raptor", false)).toBeNull();
    expect(resolveSidebarStageBackdropVariant("Nightly", false)).toBeNull();
  });

  it("resolves supported environment pill labels", () => {
    expect(resolveEnvironmentIdentificationPillLabel("Dev")).toBe("Dev");
    expect(resolveEnvironmentIdentificationPillLabel("nightly")).toBe("Nightly");
    expect(resolveEnvironmentIdentificationPillLabel("Latest")).toBeNull();
    expect(resolveEnvironmentIdentificationPillLabel("Alpha")).toBeNull();
  });

  // Le golden amont sur l'unicité des identifiants SVG est RETIRÉ SCIEMMENT :
  // notre habillage n'est plus un SVG à `defs` mais une texture d'ardoise, il
  // n'émet donc aucun identifiant et le test attendait « plus de 0 ». Le bloc
  // suivant le remplace par ce qui compte chez nous — la texture est peinte,
  // dans les deux tailles.
});

describe("SidebarStageBackdrop", () => {
  // Le golden d'origine vérifiait l'unicité des identifiants SVG. L'habillage
  // n'est plus un SVG mais la TEXTURE d'ardoise griffée : ce test-là n'avait
  // plus d'objet, celui-ci fige ce qui compte désormais — la texture est bien
  // peinte, dans les deux tailles, quel que soit le canal.
  it.each(["nightly", "dev"] as const)("peint la texture Raptor pour %s", (variant) => {
    const markup = renderToStaticMarkup(
      <>
        <StageBackdropArt variant={variant} />
        <StageBackdropButtonArt variant={variant} />
      </>,
    );

    expect(markup.match(/\/brand\/raptor-bandeau\.png/g)).toHaveLength(2);
  });
});
