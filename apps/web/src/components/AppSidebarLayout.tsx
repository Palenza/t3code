import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { isElectron } from "../env";
import { getLocalStorageItem } from "../hooks/useLocalStorage";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../keybindings";
import { cn, isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import { useEnvironmentIdentificationMode, useSidebarV2Enabled } from "../hooks/useSettings";
import ThreadSidebar from "./Sidebar";
import { useSidebarSpacesStore } from "../sidebarSpacesStore";
import { SidebarEdgePeek, useSidebarPeekStore } from "./sidebar/SidebarEdgePeek";
import { BibliothequeOverlay, useBibliothequeStore } from "./sidebar/BibliothequeOverlay";
import { SidebarThemeWash } from "./sidebar/SidebarThemeWash";
import ThreadSidebarV2 from "./SidebarV2";
import { useSidebarStageBackdropVariant } from "./SidebarStageBackdrop";
import {
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import {
  Sidebar,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  useSidebarVisibility,
} from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "90px";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

function readInitialThreadSidebarWidth(): number {
  try {
    return resolveInitialThreadSidebarWidth(
      getLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, Schema.Finite),
      window.innerWidth,
    );
  } catch (error) {
    console.error("Could not read persisted thread sidebar width.", error);
    return resolveInitialThreadSidebarWidth(null, window.innerWidth);
  }
}

function SidebarControl() {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();
  const isSidebarVisible = useSidebarVisibility();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (resolveShortcutCommand(event, keybindings) !== "sidebar.toggle") return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    // Capture before focused editors consume commands such as Mod+B for rich-text formatting.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, toggleSidebar]);

  return (
    <div
      className="pointer-events-none fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 flex h-[var(--workspace-topbar-height)] items-center"
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger
              className={cn(
                "pointer-events-auto",
                isSidebarVisible &&
                  stageBackdropVariant &&
                  "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
              )}
              aria-label="Toggle main sidebar"
            />
          }
        />
        <TooltipPopup side="bottom">
          Toggle main sidebar{shortcutLabel ? ` (${shortcutLabel})` : ""}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const sidebarV2Enabled = useSidebarV2Enabled();
  // Settings routes render the settings nav, which lives in the v1 component
  // and is identical for both sidebars — so v1 stays mounted there.
  const pathname = useLocation({ select: (location) => location.pathname });
  const isOnSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const useSidebarV2 = sidebarV2Enabled && !isOnSettings;
  const useSidebarV2Theme = useSidebarV2 || isOnSettings;
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  // Subscribed rather than read once: the clamp must track live window size,
  // and a clamped drag ends with an unchanged width, which skips the re-render
  // that would otherwise refresh a render-time snapshot.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(() => {
    const getWindowFullscreenState = window.desktopBridge?.getWindowFullscreenState;
    return isMacosDesktop && typeof getWindowFullscreenState === "function"
      ? getWindowFullscreenState()
      : false;
  });
  const sidebarPeek = useSidebarPeekStore((store) => store.peek);
  // Swipe deux doigts sur la sidebar (façon Arc) : le deltaX horizontal du
  // trackpad cumule jusqu'au seuil, puis bascule d'espace — avec un temps
  // mort pour qu'un long geste ne saute pas trois espaces d'un coup.
  const spaceSwipeAccumRef = useRef(0);
  const spaceSwipeLastFireRef = useRef(0);
  const handleSidebarWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      spaceSwipeAccumRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - spaceSwipeLastFireRef.current < 450) return;
    spaceSwipeAccumRef.current += event.deltaX;
    if (Math.abs(spaceSwipeAccumRef.current) < 110) return;
    // ATTENTION AU SIGNE. Avec le défilement naturel de macOS, deux doigts qui
    // partent vers la DROITE produisent un deltaX NÉGATIF : le contenu suit les
    // doigts, donc la fenêtre recule. Je lisais ce signe tel quel, et tout le
    // geste marchait à l'envers. La variable porte désormais le sens PHYSIQUE
    // du geste, pas le signe brut : +1 = les doigts vont vers la droite.
    const versLaDroite = spaceSwipeAccumRef.current < 0 ? 1 : -1;
    spaceSwipeAccumRef.current = 0;
    spaceSwipeLastFireRef.current = now;
    // Deux doigts vers la DROITE ouvrent la bibliothèque — mais SEULEMENT
    // depuis la vue principale. Depuis un espace, le même geste ramène
    // d'abord vers « Tous » : sinon il faudrait deviner quand il navigue et
    // quand il ouvre une fenêtre, et on sortirait de son rangement par
    // surprise (précision fondateur 30/07). Le geste garde donc un seul
    // sens : vers la droite on REMONTE — d'espace en espace jusqu'à la vue
    // principale, puis d'un cran de plus jusqu'à la bibliothèque.
    if (versLaDroite > 0 && useSidebarSpacesStore.getState().activeSpaceId === null) {
      useBibliothequeStore.getState().ouvrir("espaces");
      return;
    }
    useSidebarSpacesStore.getState().cycleSpace(versLaDroite);
  }, []);

  /**
   * ⌘⇧E — la SECONDE porte de la bibliothèque.
   *
   * Elle n'en avait qu'une : le geste au trackpad. Un commentaire annonçait
   * bien ce raccourci, mais il n'était câblé nulle part — vérifié le 30/07 en
   * l'essayant dans l'app. Sans souris à deux doigts, sans deltaX, ou si le
   * geste échoue pour une raison quelconque, le tableau des espaces devenait
   * tout simplement inatteignable. Un chemin unique vers une vue entière est
   * un cul-de-sac qui attend son jour.
   */
  useEffect(() => {
    const surTouche = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "e") return;
      event.preventDefault();
      const biblio = useBibliothequeStore.getState();
      if (biblio.ouverte) biblio.fermer();
      else biblio.ouvrir("espaces");
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  const sidebarProviderStyle = {
    "--sidebar-width": `${sidebarWidth}px`,
    ...(isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}),
  } as CSSProperties;

  useEffect(() => {
    if (!isMacosDesktop) return;
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const { getWindowFullscreenState, onWindowFullscreenStateChange } = bridge;
    if (
      typeof getWindowFullscreenState !== "function" ||
      typeof onWindowFullscreenStateChange !== "function"
    ) {
      return;
    }

    const unsubscribe = onWindowFullscreenStateChange(setIsWindowFullscreen);
    setIsWindowFullscreen(getWindowFullscreenState());
    return unsubscribe;
  }, [isMacosDesktop]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        const isSettingsRoute = /^\/settings(\/|$)/.test(pathname);
        if (!isSettingsRoute) {
          void navigate({ to: "/settings" });
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate, pathname]);

  return (
    <SidebarProvider className="h-dvh! min-h-0!" defaultOpen style={sidebarProviderStyle}>
      <Sidebar
        side="left"
        collapsible="offcanvas"
        data-app-sidebar=""
        data-sidebar-version={useSidebarV2Theme ? "v2" : "v1"}
        onWheel={handleSidebarWheel}
        // `sidebar-inner` (the opaque bg-sidebar layer) must be its own
        // stacking context, otherwise the theme wash's -z-10 escapes to THIS
        // context and paints underneath that opaque background — invisible.
        // While edge-peeking (Arc-style), the collapsed offcanvas container is
        // pulled back on-screen as a floating overlay above the content.
        className={cn(
          "isolate border-r border-sidebar-border bg-sidebar text-sidebar-foreground [&_[data-slot=sidebar-inner]]:isolate",
          sidebarPeek &&
            "fixed! inset-y-2! left-2! z-50 h-auto! translate-x-0! rounded-xl border border-sidebar-border shadow-2xl [&_[data-slot=sidebar-inner]]:rounded-xl",
        )}
        resizable={{
          // En edge peek la sidebar est visible mais « fermée » : le
          // redimensionnement doit rester possible (29/07).
          enabledWhenCollapsed: sidebarPeek,
          maxWidth: sidebarMaximumWidth,
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
            nextWidth <= currentWidth ||
            wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
          onResize: setSidebarWidth,
        }}
      >
        <SidebarThemeWash />
        {useSidebarV2 ? <ThreadSidebarV2 /> : <ThreadSidebar />}
        <SidebarRail />
      </Sidebar>
      {children}
      <SidebarControl />
      <SidebarEdgePeek />
      <BibliothequeOverlay />
    </SidebarProvider>
  );
}
