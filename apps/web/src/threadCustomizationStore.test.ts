import { describe, expect, it } from "vite-plus/test";

import { mergeSectionOrder, reorderSection, sortWithManualOrder } from "./threadCustomizationStore";

const keyOf = (thread: { key: string }) => thread.key;
const threads = (...keys: string[]) => keys.map((key) => ({ key }));

describe("sortWithManualOrder", () => {
  it("keeps the default order when nothing was ever arranged", () => {
    expect(sortWithManualOrder(threads("a", "b", "c"), keyOf, undefined)).toEqual(
      threads("a", "b", "c"),
    );
    expect(sortWithManualOrder(threads("a", "b"), keyOf, [])).toEqual(threads("a", "b"));
  });

  it("applies the manual order to ranked threads", () => {
    expect(sortWithManualOrder(threads("a", "b", "c"), keyOf, ["c", "a", "b"])).toEqual(
      threads("c", "a", "b"),
    );
  });

  it("keeps never-ranked threads on top, in their default order", () => {
    // "neuf1"/"neuf2" appeared after the user arranged the section: they are
    // the freshest work and must not be buried under the priority stack.
    expect(sortWithManualOrder(threads("neuf1", "neuf2", "b", "a"), keyOf, ["a", "b"])).toEqual(
      threads("neuf1", "neuf2", "a", "b"),
    );
  });

  it("puts never-ranked threads at the bottom when asked (settled tail)", () => {
    expect(
      sortWithManualOrder(threads("vieux1", "b", "a"), keyOf, ["a", "b"], { unranked: "bottom" }),
    ).toEqual(threads("a", "b", "vieux1"));
  });

  it("ignores ranked keys that no longer exist", () => {
    expect(sortWithManualOrder(threads("b", "a"), keyOf, ["disparu", "a", "b"])).toEqual(
      threads("a", "b"),
    );
  });
});

describe("reorderSection", () => {
  it("moves a key next to its drop target", () => {
    expect(reorderSection(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(reorderSection(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("returns the list unchanged when the move is a no-op or unknown", () => {
    expect(reorderSection(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(reorderSection(["a", "b"], "x", "a")).toEqual(["a", "b"]);
  });
});

describe("mergeSectionOrder", () => {
  it("adopts the arrangement wholesale when nothing was stored", () => {
    expect(mergeSectionOrder([], ["b", "a"])).toEqual(["b", "a"]);
  });

  it("reorders a PARTIAL arrangement in place without touching outside keys (essaim 29/07)", () => {
    // The drag happened under an active space showing only b and d. The other
    // spaces' ranking (a, c, e) must survive in its exact positions.
    expect(mergeSectionOrder(["a", "b", "c", "d", "e"], ["d", "b"])).toEqual([
      "a",
      "d",
      "c",
      "b",
      "e",
    ]);
  });

  it("replaces the full order when the arrangement covers every stored key", () => {
    expect(mergeSectionOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("slots a never-ranked key next to its new neighbours", () => {
    // n was dropped between b and a inside the space view; the stored order
    // has never seen it. It must land there, not at an edge.
    expect(mergeSectionOrder(["a", "b", "c"], ["b", "n", "a"])).toEqual(["b", "n", "a", "c"]);
  });

  it("appends a never-ranked key arranged last among its section", () => {
    expect(mergeSectionOrder(["a", "b"], ["a", "b", "n"])).toEqual(["a", "b", "n"]);
  });
});
