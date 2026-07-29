import { describe, expect, it } from "vite-plus/test";

import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_DEFAULT_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("thread sidebar width", () => {
  it("uses the default width when no preference is stored", () => {
    expect(resolveInitialThreadSidebarWidth(null, 1200)).toBe(THREAD_SIDEBAR_DEFAULT_WIDTH);
  });

  it("uses a stored width in the initial render", () => {
    expect(resolveInitialThreadSidebarWidth(360, 1200)).toBe(360);
  });

  it("clamps a stored width to the sidebar minimum", () => {
    expect(resolveInitialThreadSidebarWidth(120, 1200)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });

  it("leaves enough room for the main content on a smaller window", () => {
    const viewportWidth = 1000;

    expect(resolveInitialThreadSidebarWidth(900, viewportWidth)).toBe(
      viewportWidth - THREAD_MAIN_CONTENT_MIN_WIDTH,
    );
  });

  it("keeps the sidebar minimum when the whole layout is narrower than its minimums", () => {
    expect(resolveInitialThreadSidebarWidth(900, 700)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });
});

describe("plafond de largeur", () => {
  it("ne laisse jamais la sidebar dépasser 26rem, même sur un écran large", () => {
    // Sans ce plafond, la date d'un fil finissait à l'autre bout de la ligne,
    // séparée de son titre par du vide (reproche fondateur 29/07).
    expect(resolveThreadSidebarMaximumWidth(3840)).toBe(26 * 16);
    expect(resolveThreadSidebarMaximumWidth(1440)).toBe(26 * 16);
  });

  it("garde la priorité au contenu quand l'écran est étroit", () => {
    // 900 px d'écran : le contenu principal réclame 640, il reste 260 — le
    // plafond ne doit pas voler cette place.
    expect(resolveThreadSidebarMaximumWidth(900)).toBe(900 - 40 * 16);
  });
});
