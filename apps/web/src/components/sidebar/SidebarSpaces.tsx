import { useCallback, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { settlePromise } from "@t3tools/client-runtime/state/runtime";

import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import {
  SPACE_EMOJI_PRESETS,
  useSidebarSpacesStore,
  type SidebarFavorite,
} from "../../sidebarSpacesStore";
import { makeSidebarThemeFromColors, SIDEBAR_THEME_PRESETS } from "../../sidebarThemeStore";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * La barre d'Espaces façon Arc, en bas de la sidebar : une icône par espace,
 * la vue « tout » en tête, le « + » pour créer. Clic = basculer (le voile de
 * couleurs suit) ; clic droit sur un espace = renommer le thème / supprimer.
 */
export function SidebarSpacesBar() {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const setActiveSpace = useSidebarSpacesStore((state) => state.setActiveSpace);
  const deleteSpace = useSidebarSpacesStore((state) => state.deleteSpace);
  const createSpace = useSidebarSpacesStore((state) => state.createSpace);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftEmoji, setDraftEmoji] = useState(SPACE_EMOJI_PRESETS[0] ?? "🎨");

  const submitCreate = useCallback(() => {
    const name = draftName.trim();
    if (name.length === 0) return;
    // Chaque espace naît avec un thème à lui : deux pastels du nuancier,
    // décalés par le rang pour que deux espaces voisins diffèrent d'emblée.
    const paletteIndex = (useSidebarSpacesStore.getState().spaces.length * 2) % 8;
    const themeColors = [
      SIDEBAR_THEME_PRESETS[paletteIndex + 1] ?? "#4caf7d",
      SIDEBAR_THEME_PRESETS[paletteIndex + 2] ?? "#5db3f0",
    ];
    createSpace({ name, emoji: draftEmoji, theme: makeSidebarThemeFromColors(themeColors) });
    setDraftName("");
    setCreating(false);
  }, [createSpace, draftEmoji, draftName]);

  const handleSpaceContextMenu = useCallback(
    (spaceId: string, spaceName: string, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clicked = await settlePromise(() =>
          api.contextMenu.show(
            [{ id: "delete", label: `Supprimer « ${spaceName} »`, destructive: true }],
            position,
          ),
        );
        if (clicked._tag === "Failure") return;
        if (clicked.value === "delete") {
          deleteSpace(spaceId);
        }
      })();
    },
    [deleteSpace],
  );

  return (
    <div className="flex items-center gap-1 px-2 pb-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Tous les fils"
              onClick={() => setActiveSpace(null)}
              className={cn(
                "flex size-7 cursor-pointer items-center justify-center rounded-lg text-[13px] transition-colors",
                activeSpaceId === null
                  ? "bg-sidebar-row-active text-sidebar-foreground"
                  : "text-sidebar-muted-foreground/70 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
              )}
            >
              ◦
            </button>
          }
        />
        <TooltipPopup side="top">Tous les fils</TooltipPopup>
      </Tooltip>
      {spaces.map((space) => (
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
                  "flex size-7 cursor-pointer items-center justify-center rounded-lg text-[15px] transition-transform",
                  activeSpaceId === space.id
                    ? "scale-110 bg-sidebar-row-active"
                    : "opacity-60 hover:scale-105 hover:bg-sidebar-row-hover hover:opacity-100",
                )}
              >
                {space.emoji}
              </button>
            }
          />
          <TooltipPopup side="top">{space.name}</TooltipPopup>
        </Tooltip>
      ))}
      <Popover open={creating} onOpenChange={setCreating}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Nouvel espace"
              className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            >
              <PlusIcon className="size-4" />
            </button>
          }
        />
        <PopoverPopup side="top" align="end" className="w-64 p-3">
          <p className="pb-2 text-xs font-medium text-muted-foreground">Nouvel espace</p>
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitCreate();
            }}
            placeholder="Design, Débogage, Production…"
            className="w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap gap-1 pt-2">
            {SPACE_EMOJI_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Icône ${emoji}`}
                onClick={() => setDraftEmoji(emoji)}
                className={cn(
                  "flex size-7 cursor-pointer items-center justify-center rounded-lg text-[15px] transition-colors",
                  draftEmoji === emoji ? "bg-accent ring-1 ring-ring" : "hover:bg-accent/60",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="pt-2">
            <Button size="sm" disabled={draftName.trim().length === 0} onClick={submitCreate}>
              Créer l'espace
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}

/**
 * Les favoris façon Arc : la grille d'icônes tout en haut de la sidebar,
 * transversale aux espaces. Chaque favori EST un fil — cliquer le rouvre
 * (avec son contexte, ses previews), jamais une fenêtre neuve.
 */
export function SidebarFavoritesGrid() {
  const favorites = useSidebarSpacesStore((state) => state.favorites);
  const toggleFavorite = useSidebarSpacesStore((state) => state.toggleFavorite);
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
    <div className="grid grid-cols-4 gap-1.5 px-3 pb-1">
      {favorites.map((favorite) => (
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
                className="flex h-9 cursor-pointer items-center justify-center rounded-xl bg-sidebar-control-surface/70 text-[13px] font-semibold text-sidebar-foreground/85 ring-1 ring-sidebar-border/60 transition-transform hover:scale-105 hover:bg-sidebar-row-hover"
              >
                {favoriteInitials(favorite.title)}
              </button>
            }
          />
          <TooltipPopup side="bottom">{favorite.title}</TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}

function favoriteInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "•";
  const second = words[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}
