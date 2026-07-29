import { useEffect } from "react";

import { create } from "zustand";

import { useSidebar } from "../ui/sidebar";

/**
 * Arc-style edge peek (vidéo fondateur 29/07) : sidebar masquée, approcher la
 * souris du bord GAUCHE la fait glisser par-dessus le contenu ; la quitter la
 * range. Le bouton d'épinglage existant (toggle) la verrouille — épinglée,
 * le peek se démonte. Runtime pur, rien de persisté.
 */
export const useSidebarPeekStore = create<{
  peek: boolean;
  setPeek: (peek: boolean) => void;
}>()((set) => ({
  peek: false,
  setPeek: (peek) => set({ peek }),
}));

export function SidebarEdgePeek() {
  const { state, isMobile } = useSidebar();
  const peek = useSidebarPeekStore((store) => store.peek);
  const setPeek = useSidebarPeekStore((store) => store.setPeek);

  // Pinning (or mobile) retires the peek: the sidebar is back in the layout.
  const active = state === "collapsed" && !isMobile;
  useEffect(() => {
    if (!active && peek) {
      setPeek(false);
    }
  }, [active, peek, setPeek]);

  if (!active || peek) {
    return null;
  }
  return (
    <div
      aria-hidden
      className="fixed inset-y-0 left-0 z-40 w-2"
      onMouseEnter={() => setPeek(true)}
    />
  );
}
