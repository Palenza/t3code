import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The user's own layer on the sidebar thread list: a colour per thread and a
 * manual priority order per section. Both are local presentation state —
 * nothing here is server truth, so it lives in localStorage like the other
 * sidebar preferences.
 */

export const THREAD_COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;
export type ThreadColor = (typeof THREAD_COLORS)[number];

export const THREAD_COLOR_LABELS: Record<ThreadColor, string> = {
  red: "Rouge",
  orange: "Orange",
  yellow: "Jaune",
  green: "Vert",
  blue: "Bleu",
  purple: "Violet",
};

export type ThreadOrderSection = "active" | "settled";

interface ThreadCustomizationState {
  colorByThreadKey: Record<string, ThreadColor>;
  orderBySection: Record<string, string[]>;
  setThreadColor: (threadKey: string, color: ThreadColor | null) => void;
  applySectionOrder: (section: ThreadOrderSection, orderedThreadKeys: string[]) => void;
}

export const useThreadCustomizationStore = create<ThreadCustomizationState>()(
  persist(
    (set) => ({
      colorByThreadKey: {},
      orderBySection: {},
      setThreadColor: (threadKey, color) =>
        set((state) => {
          const next = { ...state.colorByThreadKey };
          if (color === null) {
            delete next[threadKey];
          } else {
            next[threadKey] = color;
          }
          return { colorByThreadKey: next };
        }),
      applySectionOrder: (section, orderedThreadKeys) =>
        set((state) => ({
          orderBySection: {
            ...state.orderBySection,
            [section]: mergeSectionOrder(state.orderBySection[section] ?? [], orderedThreadKeys),
          },
        })),
    }),
    { name: "t3code:thread-customization:v1" },
  ),
);

/**
 * Folds a newly arranged (possibly PARTIAL) order into the stored one.
 *
 * The arranged list is whatever was visible during the drag — under an active
 * space that is one space's threads, not the whole sidebar. Replacing the
 * stored order with it would erase every other space's manual ranking in one
 * gesture (trouvaille essaim 29/07). Instead: the arranged keys take their new
 * relative order in the exact positions the stored order held them, keys the
 * store has never seen slot in next to their new neighbours, and every key
 * outside the arrangement keeps its position untouched.
 */
export function mergeSectionOrder(
  previous: ReadonlyArray<string>,
  ordered: ReadonlyArray<string>,
): string[] {
  if (previous.length === 0) {
    return [...ordered];
  }
  const orderedSet = new Set(ordered);
  const previousSet = new Set(previous);
  const replacements = ordered.filter((key) => previousSet.has(key));
  let slot = 0;
  const merged = previous.map((key) => (orderedSet.has(key) ? (replacements[slot++] ?? key) : key));
  // Keys arranged just now that the stored order has never ranked: each goes
  // right before the first of its FOLLOWERS (in the new arrangement) already
  // present, so it lands where the user dropped it, not at an edge.
  const fresh = ordered.filter((key) => !previousSet.has(key));
  for (const key of fresh.toReversed()) {
    const followers = new Set(ordered.slice(ordered.indexOf(key) + 1));
    const anchorIndex = merged.findIndex((candidate) => followers.has(candidate));
    if (anchorIndex === -1) {
      merged.push(key);
    } else {
      merged.splice(anchorIndex, 0, key);
    }
  }
  return merged;
}

/**
 * Applies a manual order to a section's default (recency) order.
 *
 * Threads the user has never ordered keep the default order and stay ON TOP:
 * a brand-new thread is the thing just asked for, and burying it under an old
 * priority stack would hide exactly what the user is waiting on. The first
 * drag snapshots the whole visible section, so from then on every row of the
 * section is ranked and the list is fully the user's.
 */
export function sortWithManualOrder<T>(
  threads: ReadonlyArray<T>,
  keyOf: (thread: T) => string,
  order: ReadonlyArray<string> | undefined,
  options?: {
    /**
     * Where never-arranged threads land. "top" (default) suits the active
     * inbox — a brand-new thread is the thing just asked for. "bottom" suits
     * the settled tail, where the unranked rows are OLDER pages revealed by
     * "show more" and must not jump over the arranged ones.
     */
    unranked?: "top" | "bottom";
  },
): T[] {
  if (!order || order.length === 0) {
    return [...threads];
  }
  const rank = new Map(order.map((key, index) => [key, index]));
  const unranked = threads.filter((thread) => !rank.has(keyOf(thread)));
  const ranked = [...threads]
    .filter((thread) => rank.has(keyOf(thread)))
    .toSorted((a, b) => (rank.get(keyOf(a)) ?? 0) - (rank.get(keyOf(b)) ?? 0));
  return options?.unranked === "bottom" ? [...ranked, ...unranked] : [...unranked, ...ranked];
}

/**
 * The order array to store after moving `movedKey` next to its new
 * neighbours: the whole currently-visible section, in its new order. Storing
 * the full snapshot (not a delta) is what makes the result WYSIWYG — the
 * list the user just arranged is exactly the list that persists.
 */
export function reorderSection(
  visibleKeys: ReadonlyArray<string>,
  movedKey: string,
  overKey: string,
): string[] {
  const from = visibleKeys.indexOf(movedKey);
  const to = visibleKeys.indexOf(overKey);
  if (from === -1 || to === -1 || from === to) {
    return [...visibleKeys];
  }
  const next = [...visibleKeys];
  next.splice(from, 1);
  next.splice(to, 0, movedKey);
  return next;
}
