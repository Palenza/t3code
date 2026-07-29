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

/** Anything under the pointer that belongs to a PORTALED popup (Base UI
 * portals render outside the sidebar's DOM): menus, dialogs, popovers,
 * selects. While the pointer is over one, the peek must not close under it. */
const PORTALED_POPUP_SELECTOR =
  '[data-slot$="-positioner"], [data-slot$="-popup"], [role="menu"], [role="dialog"], [role="listbox"]';

/** How far past the sidebar's floating card the pointer may wander before the
 * peek closes. Also covers the 0–8 px gutter the peek was opened from. */
const CLOSE_MARGIN_PX = 40;

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

  // Closing is decided from GLOBAL pointer position, not the sidebar's own
  // mouseleave: React's mouseleave fires when the pointer moves onto a
  // portaled popup (closing the peek under an open menu) and never fires when
  // the pointer leaves the window and comes back elsewhere (peek stuck open)
  // — both observed by the essaim review, 29/07.
  useEffect(() => {
    if (!peek) {
      return;
    }
    const onMouseMove = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(PORTALED_POPUP_SELECTOR)) {
        return;
      }
      const sidebar = document.querySelector("[data-app-sidebar]");
      if (!(sidebar instanceof Element)) {
        setPeek(false);
        return;
      }
      const rect = sidebar.getBoundingClientRect();
      const outside =
        event.clientX > rect.right + CLOSE_MARGIN_PX ||
        event.clientX < rect.left - CLOSE_MARGIN_PX ||
        event.clientY < rect.top - CLOSE_MARGIN_PX ||
        event.clientY > rect.bottom + CLOSE_MARGIN_PX;
      if (outside) {
        setPeek(false);
      }
    };
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [peek, setPeek]);

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
