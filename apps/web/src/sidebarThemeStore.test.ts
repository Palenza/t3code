import { describe, expect, it } from "vite-plus/test";

import {
  sidebarThemeBackground,
  sidebarThemeGrainOpacity,
  type SidebarTheme,
} from "./sidebarThemeStore";

const theme = (overrides: Partial<SidebarTheme> = {}): SidebarTheme => ({
  colors: ["#5db3f0"],
  intensity: 0.5,
  grain: 0.25,
  ...overrides,
});

describe("sidebarThemeBackground", () => {
  it("blends toward the dark base in dark mode and the light base in light mode", () => {
    const dark = sidebarThemeBackground(theme(), "dark");
    const light = sidebarThemeBackground(theme(), "light");
    expect(dark).toContain("color-mix(in oklab, #5db3f0 45%, #0e1116)");
    expect(light).toContain("#f7f9fc");
    expect(dark).not.toContain("#f7f9fc");
  });

  it("spreads one, two or three colors across the layers", () => {
    const un = sidebarThemeBackground(theme({ colors: ["#e5484d"] }), "dark");
    expect(un?.match(/#e5484d/g)?.length).toBeGreaterThanOrEqual(4);
    const trois = sidebarThemeBackground(
      theme({ colors: ["#e5484d", "#f5c542", "#4caf7d"] }),
      "dark",
    );
    expect(trois).toContain("#e5484d");
    expect(trois).toContain("#f5c542");
    expect(trois).toContain("#4caf7d");
  });

  it("maps intensity to the kept-colour percentage, bounded", () => {
    expect(sidebarThemeBackground(theme({ intensity: 0 }), "dark")).toContain(" 22%,");
    expect(sidebarThemeBackground(theme({ intensity: 1 }), "dark")).toContain(" 68%,");
    expect(sidebarThemeBackground(theme({ intensity: 99 }), "dark")).toContain(" 68%,");
  });

  it("drops invalid colours and paints nothing when none are valid", () => {
    expect(
      sidebarThemeBackground(theme({ colors: ["pas-une-couleur", "#123"] }), "dark"),
    ).toBeNull();
    const partiel = sidebarThemeBackground(
      theme({ colors: ["nope", "#4caf7d"] }),
      "dark",
    );
    expect(partiel).toContain("#4caf7d");
    expect(partiel).not.toContain("nope");
  });
});

describe("sidebarThemeGrainOpacity", () => {
  it("caps the grain veil", () => {
    expect(sidebarThemeGrainOpacity(theme({ grain: 0 }))).toBe(0);
    expect(sidebarThemeGrainOpacity(theme({ grain: 1 }))).toBe(0.35);
    expect(sidebarThemeGrainOpacity(theme({ grain: 0.5 }))).toBeCloseTo(0.18, 2);
  });
});
