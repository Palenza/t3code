import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  StageBackdropArt,
  StageBackdropButtonArt,
  resolveSidebarStageBackdropVariant,
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
