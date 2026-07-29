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
import { SpaceIcon, SpaceIconPicker } from "./SpaceIconPicker";

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
  const renameSpace = useSidebarSpacesStore((state) => state.renameSpace);
  const setSpaceEmoji = useSidebarSpacesStore((state) => state.setSpaceEmoji);

  const [creating, setCreating] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [renommage, setRenommage] = useState<{ id: string; valeur: string } | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
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
              { id: "rename", label: "Renommer l'espace…" },
              { id: "icon", label: "Changer l'icône…" },
              { id: "theme", label: "Modifier le thème…" },
              { id: "delete", label: `Supprimer « ${spaceName} »`, destructive: true },
            ],
            position,
          ),
        );
        if (clicked._tag === "Failure") return;
        if (clicked.value === "rename") {
          setRenommage({ id: spaceId, valeur: spaceName });
          return;
        }
        if (clicked.value === "icon") {
          setActiveSpace(spaceId);
          setPickerOuvert(true);
          return;
        }
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
                  draggable
                  onDragStart={() => setGlisse(space.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    // Réordonner la barre en glissant, comme Arc.
                    event.preventDefault();
                    if (glisse !== null && glisse !== space.id) {
                      useSidebarSpacesStore.getState().reorderSpaces(glisse, space.id);
                    }
                    setGlisse(null);
                  }}
                  onDragEnd={() => setGlisse(null)}
                  onDoubleClick={() => setRenommage({ id: space.id, valeur: space.name })}
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
                    glisse === space.id && "opacity-40",
                  )}
                >
                  <SpaceIcon valeur={space.emoji} className="shrink-0 text-[14px]" />
                  {active ? (
                    renommage?.id === space.id ? (
                      <input
                        autoFocus
                        value={renommage.valeur}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          setRenommage({ id: space.id, valeur: event.currentTarget.value })
                        }
                        onBlur={() => {
                          const nom = renommage.valeur.trim();
                          if (nom.length > 0) renameSpace(space.id, nom);
                          setRenommage(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") setRenommage(null);
                        }}
                        className="w-20 bg-transparent text-[11px] font-medium text-sidebar-foreground outline-none"
                      />
                    ) : (
                      <span className="truncate text-[11px] font-medium text-sidebar-foreground">
                        {space.name}
                      </span>
                    )
                  ) : null}
                </button>
              }
            />
            <TooltipPopup side="top">{space.name} — clic droit : thème, supprimer</TooltipPopup>
          </Tooltip>
        );
      })}
      {/* Changer l'icône d'un espace EXISTANT — même sélecteur qu'à la
          création, ouvert par le menu contextuel. */}
      <Popover open={pickerOuvert} onOpenChange={setPickerOuvert}>
        <PopoverTrigger render={<span className="sr-only" aria-hidden />} />
        <PopoverPopup side="top" align="start" className="p-0">
          {activeSpaceId === null ? null : (
            <SpaceIconPicker
              valeur={spaces.find((space) => space.id === activeSpaceId)?.emoji ?? "🎨"}
              onChange={(valeur) => {
                setSpaceEmoji(activeSpaceId, valeur);
                setPickerOuvert(false);
              }}
            />
          )}
        </PopoverPopup>
      </Popover>
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
          // À CÔTÉ de la SIDEBAR ENTIÈRE, par-dessus la page — jamais DANS
          // la colonne (reproche fondateur : « ça apparaît à l'intérieur de
          // la colonne, c'est affreux ; sur Arc ça apparaît à côté »).
          // L'ancre est la sidebar elle-même, pas le petit bouton.
          anchor={() => document.querySelector("[data-app-sidebar]")}
          side="right"
          // Centré verticalement contre la sidebar, comme Arc — ancré en bas
          // il débordait de l'écran et coupait nuancier et vague.
          align="center"
          sideOffset={14}
          // Le panneau porte son propre verre (clair ou nuit selon ☀️/🌙) —
          // la surface par défaut du popup ne doit pas assombrir dessous.
          className="border-0! bg-transparent! p-0 shadow-2xl before:hidden"
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
                <SpaceIcon valeur={draftEmoji} className="size-4.5" />
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
            <div className="-mx-4 border-y border-border/50">
              <SpaceIconPicker valeur={draftEmoji} onChange={setDraftEmoji} />
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
    // Des PILULES, pas des tuiles : hauteur FIXE (elles ne grossissent plus
    // quand on élargit la sidebar) et le TITRE lisible — deux favoris du même
    // projet ne peuvent plus se confondre en deux « R » (reproche 29/07).
    <div className="flex flex-col gap-0.5 px-2 pb-1.5">
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
                  className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left ring-1 ring-sidebar-border/70 transition-colors hover:bg-sidebar-row-hover"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      color === undefined ? "bg-current/40" : FAVORITE_DOT_CLASSES[color],
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-sidebar-foreground/85">
                    {favorite.title}
                  </span>
                </button>
              }
            />
            <TooltipPopup side="right">{favorite.title}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Statiques exprès : Tailwind ne compile pas les classes composées à la volée.
 * Teintes légères — la couleur SIGNE le favori, l'encre reste celle du voile. */
const FAVORITE_DOT_CLASSES: Record<ThreadColor, string> = {
  red: "bg-red-400",
  orange: "bg-orange-400",
  yellow: "bg-yellow-400",
  green: "bg-emerald-400",
  blue: "bg-sky-400",
  purple: "bg-purple-400",
};

