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
import { peutEncoreDefiler, seuilDuSwipe } from "../swipeEspaces";
import {
  SALVE_AU_REPOS,
  SILENCE_FIN_DE_SALVE_MS,
  surEvenement,
  surSilence,
  type EtatSalve,
} from "../salveDeSwipe";
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
  // LE SWIPE EST UNE MACHINE À ÉTATS PURE (`salveDeSwipe.ts`, testée sur
  // traces) — réécrite de zéro le 02/08 sur ordre fondateur : quatre
  // correctifs successifs avaient laissé SEPT refs ici, et un état
  // « verticale » sans aucune porte de sortie — un seul défilement du fil
  // tuait le swipe jusqu'au redémarrage. Le composant ne garde que la salve
  // et LE minuteur de silence qui la clôt ; toutes les règles (axe, seuil,
  // pic, traîne) vivent dans la machine, sous test.
  const salveRef = useRef<EtatSalve>(SALVE_AU_REPOS);
  const silenceDeSalveRef = useRef<number | null>(null);
  // Le geste se VOIT pendant qu'il se fait. Avant, rien ne bougeait jusqu'au
  // seuil puis l'espace sautait d'un coup — « l'animation est très nulle, pas
  // fluide » (fondateur, 30/07). Désormais le contenu SUIT les doigts (offset
  // amorti en tanh, plafonné à 44 px), retombe en ressort si le geste
  // n'aboutit pas, et traverse en deux temps quand il aboutit. Tout est en
  // transitions CSS + setTimeout — jamais de rAF : une fenêtre cachée ne le
  // tire pas (leçon 30/07, overlay resté invisible).
  const innerDe = (cible: HTMLDivElement): HTMLElement | null =>
    cible.querySelector<HTMLElement>("[data-slot=sidebar-inner]");
  const suivreLeDoigt = (cible: HTMLDivElement, accum: number) => {
    const inner = innerDe(cible);
    if (inner === null) return;
    const offset = Math.tanh(-accum / 220) * 44;
    inner.style.willChange = "transform";
    inner.style.transition = "none";
    inner.style.transform = `translateX(${offset}px)`;
  };
  const retomber = (cible: HTMLDivElement) => {
    const inner = innerDe(cible);
    if (inner === null) return;
    inner.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
    inner.style.transform = "translateX(0px)";
  };
  const traverser = (cible: HTMLDivElement, direction: 1 | -1, bascule: () => void) => {
    const inner = innerDe(cible);
    if (inner === null) {
      bascule();
      return;
    }
    // PLUS D'ENTRÉE PAR LE CÔTÉ OPPOSÉ — 01/08, sur retour fondateur répété
    // (« un rebond trop moche », « ça se décale et ça revient en place »).
    //
    // L'ancienne traversée sortait à +72 px, COUPAIT à −56 px, puis glissait
    // jusqu'à 0. Ce retour depuis l'autre bord est précisément ce que l'œil
    // lit comme un rebond : le contenu part d'un côté et revient de l'autre,
    // deux mouvements contraires en 350 ms. La direction était pourtant juste
    // — j'avais vérifié le signe, ce n'était pas un bug de sens.
    //
    // Désormais : on sort dans le sens du geste, et le nouvel espace apparaît
    // À SA PLACE, en fondu. Un seul mouvement, aucun retour. Le geste reste
    // lisible (la sortie suit les doigts), la lecture ne saute plus.
    inner.style.transition = "transform 150ms cubic-bezier(0.4, 0, 1, 1), opacity 150ms linear";
    inner.style.transform = `translateX(${direction * 72}px)`;
    inner.style.opacity = "0.25";
    window.setTimeout(() => {
      bascule();
      inner.style.transition = "none";
      inner.style.transform = "translateX(0px)";
      // Reflow forcé : sans lui, le navigateur fusionne les deux écritures et
      // le fondu partirait de l'opacité finale, donc ne se verrait pas.
      void inner.offsetWidth;
      inner.style.transition = "opacity 200ms linear";
      inner.style.opacity = "1";
    }, 150);
  };
  /**
   * LE GESTE MARCHE AUSSI DANS LA ZONE DE TRAVAIL — décision fondateur 31/07.
   *
   * Il ne vivait que sur la barre latérale (`onWheel` posé sur elle seule) :
   * il fallait viser une bande étroite pour changer d'espace. Un seul
   * écouteur au niveau de la fenêtre couvre maintenant les deux surfaces,
   * plutôt qu'un second gestionnaire jumeau qu'il faudrait garder aligné.
   *
   * Deux différences quand le geste vient de la zone de travail :
   *  · ce qui peut ENCORE défiler sous le doigt garde le geste (blocs de
   *    code, tableaux larges) — la règle vit dans `swipeEspaces.ts` ;
   *  · le seuil est bien plus haut, pour que seul un geste voulu le touche.
   *
   * L'animation, elle, reste celle de la BARRE dans tous les cas : c'est
   * elle qui change. On la retrouve donc par son attribut, et non dans la
   * cible de l'évènement — sinon un geste depuis le chat chercherait le
   * panneau de la barre à l'intérieur du chat, ne trouverait rien, et le
   * changement d'espace se ferait sans la moindre animation.
   */
  const surLaMolette = useCallback((event: WheelEvent) => {
    const depart = event.target instanceof Element ? event.target : null;
    if (depart === null) return;
    const barre = depart.closest<HTMLElement>("[data-app-sidebar]");
    const zoneDeTravail = depart.closest<HTMLElement>("[data-slot=sidebar-inset]");
    if (barre === null && zoneDeTravail === null) return;
    const depuisLaBarre = barre !== null;

    // Ce qui a encore de la course sous le doigt garde le geste. On
    // s'arrête à la surface qu'on a reconnue : au-delà, on sortirait de
    // notre domaine.
    if (!depuisLaBarre) {
      const limite = zoneDeTravail;
      for (let noeud: Element | null = depart; noeud !== null; noeud = noeud.parentElement) {
        if (peutEncoreDefiler(noeud, event.deltaX)) return;
        if (noeud === limite) break;
      }
    }

    const carte = document.querySelector<HTMLDivElement>("[data-app-sidebar]");
    if (carte === null) return;

    const [prochaine, sortie] = surEvenement(
      salveRef.current,
      event.deltaX,
      event.deltaY,
      seuilDuSwipe(depuisLaBarre),
    );
    salveRef.current = prochaine;

    // LE minuteur : chaque évènement le réarme, le silence clôt la salve —
    // quelle que soit sa phase. C'est la porte de sortie universelle qui
    // manquait à l'ancien code.
    if (silenceDeSalveRef.current !== null) window.clearTimeout(silenceDeSalveRef.current);
    silenceDeSalveRef.current = window.setTimeout(() => {
      silenceDeSalveRef.current = null;
      const [repos, fin] = surSilence(salveRef.current);
      salveRef.current = repos;
      if (fin.type === "retomber") retomber(carte);
    }, SILENCE_FIN_DE_SALVE_MS);

    if (sortie.type === "suivre") {
      suivreLeDoigt(carte, sortie.accumule);
      return;
    }
    if (sortie.type !== "traverser") return;

    // Deux doigts vers la DROITE ouvrent la bibliothèque — mais SEULEMENT
    // depuis la vue principale. Depuis un espace, le même geste ramène
    // d'abord vers « Tous » (précision fondateur 30/07) : vers la droite on
    // REMONTE — d'espace en espace jusqu'à la vue principale, puis d'un
    // cran de plus jusqu'à la bibliothèque.
    if (sortie.versLaDroite > 0 && useSidebarSpacesStore.getState().activeSpaceId === null) {
      // La bibliothèque est un survol : la sidebar retombe pendant qu'il
      // s'ouvre — deux animations concurrentes se battraient.
      retomber(carte);
      useBibliothequeStore.getState().ouvrir("espaces");
      return;
    }
    traverser(carte, sortie.versLaDroite, () => {
      useSidebarSpacesStore.getState().cycleSpace(sortie.versLaDroite);
    });
  }, []);

  useEffect(() => {
    // `passive` : on ne coupe jamais le défilement natif — les blocs qui ont
    // encore de la course l'ont déjà gardé plus haut, et laisser le navigateur
    // faire évite toute saccade.
    window.addEventListener("wheel", surLaMolette, { passive: true });
    return () => {
      window.removeEventListener("wheel", surLaMolette);
      // Un minuteur de silence encore armé viserait une carte démontée.
      if (silenceDeSalveRef.current !== null) window.clearTimeout(silenceDeSalveRef.current);
      salveRef.current = SALVE_AU_REPOS;
    };
  }, [surLaMolette]);

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
