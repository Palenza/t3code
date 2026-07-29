import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  StageBackdropArt,
  StageBackdropButtonArt,
  resolveSidebarStageBackdropVariant,
} from "./SidebarStageBackdrop";

describe("resolveSidebarStageBackdropVariant", () => {
  // Décision fork (28/07/2026) : le ciel étoilé Nightly sur TOUS les canaux —
  // notre build du quotidien est « Alpha », que l'amont laisse sans habillage.
  it.each(["Raptor", "Dev", "Nightly", "quelconque"])(
    "gives every channel the nightly sky (%s)",
    (stageLabel) => {
      expect(resolveSidebarStageBackdropVariant(stageLabel)).toBe("nightly");
    },
  );
});

describe("SidebarStageBackdrop", () => {
  it.each(["nightly", "dev"] as const)(
    "uses unique SVG definition ids when %s artwork is rendered more than once",
    (variant) => {
      const markup = renderToStaticMarkup(
        <>
          <StageBackdropArt variant={variant} />
          <StageBackdropButtonArt variant={variant} />
        </>,
      );
      const ids = Array.from(markup.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);

      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});
