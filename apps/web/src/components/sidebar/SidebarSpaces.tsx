import { useCallback, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { GlobeIcon, LayersIcon, PaletteIcon, PlusIcon } from "lucide-react";

import { settlePromise } from "@t3tools/client-runtime/state/runtime";

import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import {
  MAX_SIDEBAR_FAVORITES,
  SPACE_EMOJI_PRESETS,
  useSidebarSpacesStore,
  visibleFavorites,
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
import { stackedThreadToast, toastManager } from "../ui/toast";
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

/** Le favicon du site, deviné depuis l'origine — repli muet sur un globe. */
function LinkFavicon({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }
  if (broken || origin === null) {
    return <GlobeIcon className="size-3.5 shrink-0 text-sidebar-foreground/60" />;
  }
  return (
    <img
      src={`${origin}/favicon.ico`}
      alt=""
      aria-hidden
      onError={() => setBroken(true)}
      className="size-3.5 shrink-0 rounded-[3px] object-contain"
    />
  );
}

/**
 * Les favoris façon Arc : la grille tout en haut de la sidebar. Un favori est
 * soit UN FIL — cliquer le rouvre avec son contexte, jamais une fenêtre
 * neuve — soit UNE ADRESSE (demande fondateur 29/07 : « quand on bosse sur le
 * design, le banc.html, il faut qu'il soit épinglé, qu'on n'ait pas à
 * re-cliquer sur je-ne-sais-quoi qui disparaît »).
 *
 * Et ils suivent l'ESPACE : ce qu'on épingle depuis l'espace Design ne
 * s'affiche que là ; les favoris sans espace suivent partout. Chaque tuile
 * porte son TITRE (reproche 29/07 : « RU, RA, on ne sait même pas ce que
 * c'est ») ; la pastille reprend la couleur du fil quand il en a une, le
 * favicon tient ce rôle pour une adresse.
 */
export function SidebarFavoritesGrid() {
  const favorites = useSidebarSpacesStore(visibleFavorites);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const toggleFavorite = useSidebarSpacesStore((state) => state.toggleFavorite);
  const addLinkFavorite = useSidebarSpacesStore((state) => state.addLinkFavorite);
  const renameFavorite = useSidebarSpacesStore((state) => state.renameFavorite);
  const colorByThreadKey = useThreadCustomizationStore((state) => state.colorByThreadKey);
  const router = useRouter();
  const [adresse, setAdresse] = useState("");
  const [nom, setNom] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const openFavorite = useCallback(
    (favorite: SidebarFavorite) => {
      if (favorite.url !== undefined) {
        void readLocalApi()?.shell.openExternal(favorite.url);
        return;
      }
      if (favorite.environmentId === undefined || favorite.threadId === undefined) return;
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
          api.contextMenu.show(
            [
              { id: "rename", label: "Renommer" },
              { id: "remove", label: "Retirer des favoris" },
            ],
            position,
          ),
        );
        if (clicked._tag === "Failure") return;
        if (clicked.value === "remove") {
          toggleFavorite(favorite);
          return;
        }
        if (clicked.value === "rename") {
          const saisi = window.prompt("Nom du favori", favorite.title);
          if (saisi !== null && saisi.trim().length > 0) {
            renameFavorite(favorite.threadKey, saisi.trim());
          }
        }
      })();
    },
    [renameFavorite, toggleFavorite],
  );

  const epingler = useCallback(() => {
    // Une adresse sans schéma (« localhost:4321/banc.html ») est ce qu'on tape
    // naturellement — on la complète plutôt que de refuser.
    const brut = adresse.trim();
    if (brut.length === 0) return;
    const url = /^https?:\/\//i.test(brut) ? brut : `http://${brut}`;
    const titre = nom.trim().length > 0 ? nom.trim() : url.replace(/^https?:\/\//i, "");
    const issue = addLinkFavorite({ url, title: titre, spaceId: activeSpaceId });
    if (issue === "full") {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Favoris pleins",
          description: `${MAX_SIDEBAR_FAVORITES} au maximum — retires-en un d'abord.`,
        }),
      );
      return;
    }
    if (issue === "duplicate") {
      toastManager.add(
        stackedThreadToast({ type: "info", title: "Cette adresse est déjà épinglée" }),
      );
      return;
    }
    setAdresse("");
    setNom("");
    setOuvert(false);
  }, [addLinkFavorite, activeSpaceId, adresse, nom]);

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
                  {favorite.url === undefined ? (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        color === undefined ? "bg-current/40" : FAVORITE_DOT_CLASSES[color],
                      )}
                    />
                  ) : (
                    <LinkFavicon url={favorite.url} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-sidebar-foreground/85">
                    {favorite.title}
                  </span>
                </button>
              }
            />
            <TooltipPopup side="right">{favorite.url ?? favorite.title}</TooltipPopup>
          </Tooltip>
        );
      })}

      <Popover open={ouvert} onOpenChange={setOuvert}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Épingler une adresse"
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sidebar-foreground/55 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground/85"
            >
              <PlusIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                Épingler une adresse
              </span>
            </button>
          }
        />
        <PopoverPopup className="w-72 p-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {activeSpaceId === null
                ? "Visible dans tous les espaces."
                : "Épinglé dans cet espace seulement."}
            </p>
            <input
              value={adresse}
              onChange={(event) => setAdresse(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") epingler();
              }}
              placeholder="localhost:4321/banc.html"
              autoFocus
              className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={nom}
              onChange={(event) => setNom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") epingler();
              }}
              placeholder="Nom (optionnel)"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
            <Button size="sm" onClick={epingler} disabled={adresse.trim().length === 0}>
              Épingler
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
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

