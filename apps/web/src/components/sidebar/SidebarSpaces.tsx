import { useCallback, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { LayersIcon, PaletteIcon, PlusIcon } from "lucide-react";

import { settlePromise } from "@t3tools/client-runtime/state/runtime";

import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import {
  SPACE_EMOJI_PRESETS,
  useSidebarSpacesStore,
  type SidebarFavorite,
} from "../../sidebarSpacesStore";
import {
  makeSidebarThemeFromColors,
  SIDEBAR_THEME_PRESETS,
  sidebarThemeBackground,
} from "../../sidebarThemeStore";
import { useThreadCustomizationStore, type ThreadColor } from "../../threadCustomizationStore";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SpaceThemePanel } from "./SpaceThemePanel";

/**
 * La barre d'Espaces façon Arc, en bas de la sidebar. Lisibilité d'abord
 * (reproche fondateur 29/07 : « le petit point, on ne comprend même pas à
 * quoi ça sert ») : l'entrée ACTIVE s'étire en pastille et porte son NOM —
 * « Tous » pour la vue complète, « 🎨 Design » pour un espace — les autres
 * restent des icônes. Clic = basculer (le voile de couleurs suit) ;
 * clic droit sur un espace = thème / supprimer.
 */
export function SidebarSpacesBar() {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const setActiveSpace = useSidebarSpacesStore((state) => state.setActiveSpace);
  const deleteSpace = useSidebarSpacesStore((state) => state.deleteSpace);
  const createSpace = useSidebarSpacesStore((state) => state.createSpace);

  const [creating, setCreating] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftEmoji, setDraftEmoji] = useState(SPACE_EMOJI_PRESETS[0] ?? "🎨");

  // Chaque espace naît avec un thème à lui : deux pastels du nuancier,
  // décalés par le rang pour que deux espaces voisins diffèrent d'emblée.
  const draftThemeColors = (() => {
    const paletteIndex = (spaces.length * 2) % 8;
    return [
      SIDEBAR_THEME_PRESETS[paletteIndex + 1] ?? "#4caf7d",
      SIDEBAR_THEME_PRESETS[paletteIndex + 2] ?? "#5db3f0",
    ];
  })();

  const submitCreate = useCallback(() => {
    const name = draftName.trim();
    if (name.length === 0) return;
    createSpace({
      name,
      emoji: draftEmoji,
      theme: makeSidebarThemeFromColors(draftThemeColors),
    });
    setDraftName("");
    setCreating(false);
  }, [createSpace, draftEmoji, draftName, draftThemeColors]);

  const handleSpaceContextMenu = useCallback(
    (spaceId: string, spaceName: string, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clicked = await settlePromise(() =>
          api.contextMenu.show(
            [
              { id: "theme", label: "Modifier le thème…" },
              { id: "delete", label: `Supprimer « ${spaceName} »`, destructive: true },
            ],
            position,
          ),
        );
        if (clicked._tag === "Failure") return;
        if (clicked.value === "theme") {
          // Le panneau flottant, pas une page : l'éditeur d'Arc s'ouvre là
          // où on est, sur l'espace qu'on vient de désigner.
          setActiveSpace(spaceId);
          setThemeOpen(true);
          return;
        }
        if (clicked.value === "delete") {
          deleteSpace(spaceId);
        }
      })();
    },
    [deleteSpace, setActiveSpace],
  );

  return (
    <div className="group/spacesbar flex items-center gap-1 px-2 pb-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Tous les fils"
              onClick={() => setActiveSpace(null)}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg transition-all",
                activeSpaceId === null
                  ? "bg-sidebar-row-active px-2.5 text-sidebar-foreground"
                  : "w-7 justify-center text-sidebar-muted-foreground/70 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
              )}
            >
              <LayersIcon className="size-3.5 shrink-0" />
              {activeSpaceId === null ? (
                <span className="text-[11px] font-medium">Tous</span>
              ) : null}
            </button>
          }
        />
        <TooltipPopup side="top">Tous les fils, tous espaces confondus</TooltipPopup>
      </Tooltip>
      {spaces.map((space) => {
        const active = activeSpaceId === space.id;
        return (
          <Tooltip key={space.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Espace ${space.name}`}
                  onClick={() => setActiveSpace(space.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    handleSpaceContextMenu(space.id, space.name, {
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  className={cn(
                    "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg transition-all",
                    active
                      ? "max-w-32 bg-sidebar-row-active px-2.5"
                      : "w-7 justify-center opacity-60 hover:bg-sidebar-row-hover hover:opacity-100",
                  )}
                >
                  <span className="shrink-0 text-[14px] leading-none">{space.emoji}</span>
                  {active ? (
                    <span className="truncate text-[11px] font-medium text-sidebar-foreground">
                      {space.name}
                    </span>
                  ) : null}
                </button>
              }
            />
            <TooltipPopup side="top">{space.name} — clic droit : thème, supprimer</TooltipPopup>
          </Tooltip>
        );
      })}
      <Popover open={themeOpen} onOpenChange={setThemeOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Modifier les couleurs"
                    className={cn(
                      "ml-auto flex size-7 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted-foreground/70 transition-all hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                      // Discret comme Arc : il se révèle quand la main
                      // approche la barre (ou quand le panneau est ouvert).
                      themeOpen
                        ? "opacity-100"
                        : "opacity-0 group-hover/spacesbar:opacity-100 focus-visible:opacity-100",
                    )}
                  >
                    <PaletteIcon className="size-4" />
                  </button>
                }
              />
            }
          />
          <TooltipPopup side="top">Modifier les couleurs</TooltipPopup>
        </Tooltip>
        <PopoverPopup
          side="top"
          align="end"
          className="p-0"
          viewportClassName="p-0 [--viewport-inline-padding:0px]"
        >
          <SpaceThemePanel />
        </PopoverPopup>
      </Popover>
      <Popover open={creating} onOpenChange={setCreating}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Nouvel espace"
                    className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                }
              />
            }
          />
          <TooltipPopup side="top">Nouvel espace</TooltipPopup>
        </Tooltip>
        <PopoverPopup side="top" align="end" className="w-72 p-0">
          <div className="border-b border-border/50 px-4 py-3">
            <p className="text-sm font-medium">Nouvel espace</p>
            <p className="pt-0.5 text-xs text-muted-foreground">
              Un espace regroupe des fils et porte ses couleurs.
            </p>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/50 text-[18px]">
                {draftEmoji}
              </span>
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitCreate();
                }}
                placeholder="Design, Débogage, Production…"
                className="h-9 w-full rounded-lg border border-border/60 bg-transparent px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-6 gap-1">
              {SPACE_EMOJI_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Icône ${emoji}`}
                  onClick={() => setDraftEmoji(emoji)}
                  className={cn(
                    "flex h-8 cursor-pointer items-center justify-center rounded-lg text-[15px] transition-colors",
                    draftEmoji === emoji ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/60",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-6 w-full rounded-md ring-1 ring-border/50"
                style={{
                  background:
                    sidebarThemeBackground(
                      makeSidebarThemeFromColors(draftThemeColors),
                      "dark",
                    ) ?? undefined,
                }}
              />
            </div>
            <p className="-mt-2 text-[11px] text-muted-foreground/70">
              Ses couleurs de naissance — modifiables ensuite dans Réglages → Theme.
            </p>
            <Button
              className="w-full"
              size="sm"
              disabled={draftName.trim().length === 0}
              onClick={submitCreate}
            >
              Créer l'espace
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}

/**
 * Les favoris façon Arc : la grille tout en haut de la sidebar, transversale
 * aux espaces. Chaque favori EST un fil — cliquer le rouvre (avec son
 * contexte), jamais une fenêtre neuve. Chaque tuile porte le TITRE du fil
 * (reproche fondateur 29/07 : « RU, RA, on ne sait même pas ce que c'est ») ;
 * la pastille reprend la couleur donnée au fil dans la liste, quand il en a
 * une.
 */
export function SidebarFavoritesGrid() {
  const favorites = useSidebarSpacesStore((state) => state.favorites);
  const toggleFavorite = useSidebarSpacesStore((state) => state.toggleFavorite);
  const colorByThreadKey = useThreadCustomizationStore((state) => state.colorByThreadKey);
  const router = useRouter();

  const openFavorite = useCallback(
    (favorite: SidebarFavorite) => {
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: favorite.environmentId, threadId: favorite.threadId },
      });
    },
    [router],
  );

  const handleFavoriteContextMenu = useCallback(
    (favorite: SidebarFavorite, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clicked = await settlePromise(() =>
          api.contextMenu.show([{ id: "remove", label: "Retirer des favoris" }], position),
        );
        if (clicked._tag === "Failure") return;
        if (clicked.value === "remove") {
          toggleFavorite(favorite);
        }
      })();
    },
    [toggleFavorite],
  );

  if (favorites.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-3 gap-1.5 px-3 pb-1">
      {favorites.map((favorite) => {
        const color = colorByThreadKey[favorite.threadKey];
        return (
          <Tooltip key={favorite.threadKey}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Favori : ${favorite.title}`}
                  onClick={() => openFavorite(favorite)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    handleFavoriteContextMenu(favorite, { x: event.clientX, y: event.clientY });
                  }}
                  className="flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-sidebar-control-surface/70 px-1.5 ring-1 ring-sidebar-border/60 transition-colors hover:bg-sidebar-row-hover"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      FAVORITE_DOT_CLASSES[color ?? "none"],
                    )}
                  >
                    {favoriteInitial(favorite.title)}
                  </span>
                  <span className="line-clamp-2 w-full text-center text-[9px] leading-[10.5px] font-medium text-sidebar-foreground/75">
                    {favorite.title}
                  </span>
                </button>
              }
            />
            <TooltipPopup side="bottom">{favorite.title}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Statiques exprès : Tailwind ne compile pas les classes composées à la volée. */
const FAVORITE_DOT_CLASSES: Record<ThreadColor | "none", string> = {
  none: "bg-sidebar-foreground/10 text-sidebar-foreground/80",
  red: "bg-red-400/25 text-red-200",
  orange: "bg-orange-400/25 text-orange-200",
  yellow: "bg-yellow-400/25 text-yellow-200",
  green: "bg-emerald-400/25 text-emerald-200",
  blue: "bg-sky-400/25 text-sky-200",
  purple: "bg-purple-400/25 text-purple-200",
};

function favoriteInitial(title: string): string {
  return (title.trim()[0] ?? "•").toUpperCase();
}
