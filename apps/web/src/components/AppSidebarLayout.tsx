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
  const spaceSwipeSettleRef = useRef<number | null>(null);
  /**
   * L'INERTIE DU TRACKPAD — la cause des deux défauts du geste.
   *
   * Sur macOS, quand les doigts quittent la surface, le système continue
   * d'émettre des `wheel` à `deltaX` décroissant pendant près d'une seconde.
   * Ces évènements-là ne sont plus un geste : c'est la traîne du précédent.
   *
   * Le temps mort de 450 ms ne suffisait pas à la couvrir. Passé ce délai,
   * l'accumulateur se remplissait de la SEULE inertie résiduelle, atteignait
   * le seuil, et changeait d'espace tout seul — « parfois ça continue à
   * swiper tout seul ». Et comme chaque évènement de traîne repoussait le
   * minuteur de retombée de 140 ms, la carte continuait de dériver puis
   * revenait tard : le rebond et la latence.
   *
   * On ne compte donc plus une DURÉE, on attend le SILENCE : après un
   * basculement, tout évènement est avalé, et le verrou ne se lève que
   * lorsque le trackpad s'est réellement tu.
   */
  const spaceSwipeVerrouRef = useRef(false);
  const spaceSwipeSilenceRef = useRef<number | null>(null);
  /** Durée sans le moindre évènement au-delà de laquelle le geste est fini. */
  const SILENCE_FIN_DE_GESTE_MS = 120;
  /**
   * LE PIC DE LA SALVE — ce qui sépare la traîne d'un NOUVEAU geste.
   *
   * Le verrou seul était une régression : il se faisait renouveler par les
   * évènements du geste SUIVANT, donc il ne se levait que si on s'arrêtait
   * complètement — « je swipe une fois et après ça ne marche plus, il faut
   * que je bouge ma souris pour re-swiper ».
   *
   * On a d'abord lu la PENTE contre la dernière valeur, en supposant l'inertie
   * strictement décroissante. Elle ne l'est pas : un geste franc ondule, et une
   * seule remontée locale rouvrait le verrou EN PLEINE traîne. Le reste de
   * l'inertie franchissait alors un second espace — « si je swipe trop fort,
   * ça va sur design et ça revient » (01/08).
   *
   * Ce qui tient, c'est le PIC : une traîne ne dépasse jamais le maximum du
   * geste qui l'a produite, même quand sa décroissance est bruitée. Un doigt
   * qui repart, lui, produit une amplitude du même ordre que l'original. Le
   * repli reste le SILENCE — c'est lui qui rouvre le cas normal.
   */
  const spaceSwipePicRef = useRef(0);
  /** Les deux axes CUMULÉS sur la salve en cours. On juge l'intention du geste
   * sur eux, jamais sur une image isolée — voir le commentaire du test. Remis à
   * zéro en même temps que l'accumulateur, sinon ils dériveraient d'un geste à
   * l'autre et un vieux défilement vertical condamnerait un swipe neuf. */
  const spaceSwipeVerticalRef = useRef(0);
  const spaceSwipeHorizontalRef = useRef(0);
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

    // Ce qui a encore de la course sous le doigt garde le geste. On s'arrête
    // à la surface qu'on a reconnue : au-delà, on sortirait de notre domaine.
    if (!depuisLaBarre) {
      const limite = zoneDeTravail;
      for (let noeud: Element | null = depart; noeud !== null; noeud = noeud.parentElement) {
        if (peutEncoreDefiler(noeud, event.deltaX)) return;
        if (noeud === limite) break;
      }
    }

    const carte = document.querySelector<HTMLDivElement>("[data-app-sidebar]");
    if (carte === null) return;

    // VERROU D'INERTIE : tant que la traîne du geste précédent n'a pas cessé,
    // on avale tout. Chaque évènement repousse la fin du silence — le verrou
    // ne se lève donc qu'une fois le trackpad vraiment muet, quelle que soit
    // la durée de l'inertie.
    const ampleur = Math.abs(event.deltaX);
    if (spaceSwipeVerrouRef.current) {
      // ON COMPARE AU PIC, PAS À LA DERNIÈRE VALEUR — corrigé le 01/08.
      //
      // Le test était `ampleur > dernier * 1.25 + 2`. Il supposait une inertie
      // strictement DÉCROISSANTE. Elle ne l'est pas : un geste franc produit
      // des ondulations, et une seule remontée locale suffisait à rouvrir le
      // verrou AU MILIEU de la traîne. Le reste de l'inertie atteignait alors
      // le seuil et franchissait un SECOND espace — « si je swipe trop fort,
      // ça va sur design et ça revient » (fondateur, 01/08).
      //
      // Une traîne ne dépasse jamais le PIC du geste qui l'a produite : c'est
      // sa signature physique, et elle tient même quand la décroissance est
      // bruitée. Un doigt qui repart, lui, produit une amplitude comparable au
      // geste d'origine. On garde donc le pic de la salve en cours, et on ne
      // rouvre que sur quelque chose du même ordre.
      //
      // Le repli reste le SILENCE (le minuteur ci-dessous) : c'est lui qui
      // rouvre le cas normal, où l'on s'arrête entre deux gestes.
      const pic = spaceSwipePicRef.current;
      const repart = ampleur > pic * 0.9 + 2;
      spaceSwipePicRef.current = Math.max(pic, ampleur);
      if (!repart) {
        if (spaceSwipeSilenceRef.current !== null) {
          window.clearTimeout(spaceSwipeSilenceRef.current);
        }
        spaceSwipeSilenceRef.current = window.setTimeout(() => {
          spaceSwipeVerrouRef.current = false;
          spaceSwipeAccumRef.current = 0;
          spaceSwipeVerticalRef.current = 0;
          spaceSwipeHorizontalRef.current = 0;
          spaceSwipePicRef.current = 0;
        }, SILENCE_FIN_DE_GESTE_MS);
        return;
      }
      spaceSwipeVerrouRef.current = false;
      spaceSwipeAccumRef.current = 0;
      spaceSwipeVerticalRef.current = 0;
      spaceSwipeHorizontalRef.current = 0;
      if (spaceSwipeSilenceRef.current !== null) {
        window.clearTimeout(spaceSwipeSilenceRef.current);
        spaceSwipeSilenceRef.current = null;
      }
    }
    // Le PIC de la salve, pas la dernière valeur : c'est lui qui sert de
    // référence à la reprise ci-dessus. L'écraser ici le ramènerait à une
    // valeur basse en fin de geste, et la moindre ondulation de la traîne
    // repasserait pour un nouveau doigt.
    spaceSwipePicRef.current = Math.max(spaceSwipePicRef.current, ampleur);
    // UNE IMAGE VERTICALE NE TUE PLUS LE GESTE — corrigé le 01/08, et c'est LA
    // cause des saccades.
    //
    // Le test était `|deltaX| <= |deltaY|` sur l'évènement SEUL : chaque image
    // un peu verticale remettait l'accumulateur à ZÉRO et rappelait `retomber`,
    // qui ramène la barre à sa place. Or un glissement LENT à deux doigts n'est
    // jamais parfaitement horizontal — une image sur trois a un `deltaY`
    // supérieur. Chacune détruisait toute l'accumulation.
    //
    // Résultat mesuré sur l'enregistrement du 01/08 (120 fps, 3 443 images) :
    // avant le basculement de 13,60 s, le décalage fait +4, +3, +2, +2, puis
    // −1, −4, −8 — il repart en sens INVERSE au milieu du même geste. C'est le
    // tremblement : « elle bouge de gauche à droite comme si elle tremblait,
    // sans jamais passer à l'autre espace ». En allant vite, `deltaX` domine,
    // il y a moins de resets, et ça finit par passer — d'où « ça ne marche que
    // si je swipe plus fort ».
    //
    // On juge donc l'INTENTION du geste, pas une image isolée : on compare les
    // deux axes CUMULÉS. Un geste franchement vertical (défilement de la liste)
    // abandonne toujours ; un geste horizontal traversé d'une image oblique
    // continue.
    spaceSwipeVerticalRef.current += Math.abs(event.deltaY);
    spaceSwipeHorizontalRef.current += Math.abs(event.deltaX);
    if (spaceSwipeVerticalRef.current > spaceSwipeHorizontalRef.current * 1.6) {
      if (spaceSwipeAccumRef.current !== 0) retomber(carte);
      spaceSwipeAccumRef.current = 0;
      spaceSwipeVerticalRef.current = 0;
      spaceSwipeHorizontalRef.current = 0;
      spaceSwipeVerticalRef.current = 0;
      spaceSwipeHorizontalRef.current = 0;
      return;
    }
    const now = Date.now();
    if (now - spaceSwipeLastFireRef.current < 450) return;
    spaceSwipeAccumRef.current += event.deltaX;
    // Un geste qui s'arrête sans atteindre le seuil retombe en douceur.
    if (spaceSwipeSettleRef.current !== null) window.clearTimeout(spaceSwipeSettleRef.current);
    const cible = carte;
    spaceSwipeSettleRef.current = window.setTimeout(() => {
      spaceSwipeAccumRef.current = 0;
      spaceSwipeVerticalRef.current = 0;
      spaceSwipeHorizontalRef.current = 0;
      retomber(cible);
    }, 140);
    if (Math.abs(spaceSwipeAccumRef.current) < seuilDuSwipe(depuisLaBarre)) {
      suivreLeDoigt(cible, spaceSwipeAccumRef.current);
      return;
    }
    if (spaceSwipeSettleRef.current !== null) window.clearTimeout(spaceSwipeSettleRef.current);
    // ATTENTION AU SIGNE. Avec le défilement naturel de macOS, deux doigts qui
    // partent vers la DROITE produisent un deltaX NÉGATIF : le contenu suit les
    // doigts, donc la fenêtre recule. Je lisais ce signe tel quel, et tout le
    // geste marchait à l'envers. La variable porte désormais le sens PHYSIQUE
    // du geste, pas le signe brut : +1 = les doigts vont vers la droite.
    const versLaDroite = spaceSwipeAccumRef.current < 0 ? 1 : -1;
    spaceSwipeAccumRef.current = 0;
    spaceSwipeVerticalRef.current = 0;
    spaceSwipeHorizontalRef.current = 0;
    spaceSwipeLastFireRef.current = now;
    // Le geste a abouti : tout ce qui suit est de la traîne, pas une intention.
    // On verrouille jusqu'au silence — un seul geste, un seul espace franchi.
    spaceSwipeVerrouRef.current = true;
    if (spaceSwipeSilenceRef.current !== null) window.clearTimeout(spaceSwipeSilenceRef.current);
    spaceSwipeSilenceRef.current = window.setTimeout(() => {
      spaceSwipeVerrouRef.current = false;
      spaceSwipeAccumRef.current = 0;
      spaceSwipeVerticalRef.current = 0;
      spaceSwipeHorizontalRef.current = 0;
    }, SILENCE_FIN_DE_GESTE_MS);
    // Deux doigts vers la DROITE ouvrent la bibliothèque — mais SEULEMENT
    // depuis la vue principale. Depuis un espace, le même geste ramène
    // d'abord vers « Tous » : sinon il faudrait deviner quand il navigue et
    // quand il ouvre une fenêtre, et on sortirait de son rangement par
    // surprise (précision fondateur 30/07). Le geste garde donc un seul
    // sens : vers la droite on REMONTE — d'espace en espace jusqu'à la vue
    // principale, puis d'un cran de plus jusqu'à la bibliothèque.
    if (versLaDroite > 0 && useSidebarSpacesStore.getState().activeSpaceId === null) {
      // La bibliothèque est un survol : la sidebar retombe pendant qu'il
      // s'ouvre, pas de traversée — deux animations concurrentes se battraient.
      retomber(cible);
      useBibliothequeStore.getState().ouvrir("espaces");
      return;
    }
    traverser(cible, versLaDroite, () => {
      useSidebarSpacesStore.getState().cycleSpace(versLaDroite);
    });
  }, []);

  useEffect(() => {
    // `passive` : on ne coupe jamais le défilement natif — les blocs qui ont
    // encore de la course l'ont déjà gardé plus haut, et laisser le navigateur
    // faire évite toute saccade.
    window.addEventListener("wheel", surLaMolette, { passive: true });
    return () => window.removeEventListener("wheel", surLaMolette);
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
