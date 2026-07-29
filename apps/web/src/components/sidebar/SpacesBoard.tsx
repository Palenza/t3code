import { useCallback, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { GripVerticalIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";

import { settlePromise } from "@t3tools/client-runtime/state/runtime";

import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import { useSidebarSpacesStore, type SidebarSpace } from "../../sidebarSpacesStore";
import { makeSidebarThemeFromColors, sidebarThemeBackground } from "../../sidebarThemeStore";
import { SpaceIcon } from "./SpaceIconPicker";

/**
 * Le tableau des Espaces — la vue « Spaces » d'Arc, répliquée.
 *
 * Chaque espace est une COLONNE qui porte son propre dégradé : on voit d'un
 * coup d'œil tout ce qu'on a rangé, et où. C'est la seule surface où les
 * espaces existent côte à côte ; ailleurs on n'en voit qu'un à la fois, ce
 * qui rend le rangement difficile à embrasser.
 *
 * Repris tel quel des captures du 30/07 : l'en-tête porte l'icône, le nom et
 * un crayon ; le pied porte une poignée de déplacement à gauche et un menu à
 * droite ; un « + » rond, après la dernière colonne, en crée une de plus.
 */
export function SpacesBoard({ onFermer }: { onFermer: () => void }) {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const assignments = useSidebarSpacesStore((state) => state.assignments);
  const renameSpace = useSidebarSpacesStore((state) => state.renameSpace);
  const deleteSpace = useSidebarSpacesStore((state) => state.deleteSpace);
  const reorderSpaces = useSidebarSpacesStore((state) => state.reorderSpaces);
  const setActiveSpace = useSidebarSpacesStore((state) => state.setActiveSpace);
  const createSpace = useSidebarSpacesStore((state) => state.createSpace);
  const router = useRouter();

  const [renommage, setRenommage] = useState<{ id: string; valeur: string } | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);

  /** Les fils rangés dans un espace, dans l'ordre où ils y sont entrés. */
  const filsDe = useCallback(
    (spaceId: string): ReadonlyArray<string> =>
      Object.entries(assignments)
        .filter(([, id]) => id === spaceId)
        .map(([threadKey]) => threadKey),
    [assignments],
  );

  const menu = useCallback(
    (space: SidebarSpace, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clique = await settlePromise(() =>
          api.contextMenu.show(
            [
              { id: "ouvrir", label: `Aller dans « ${space.name} »` },
              { id: "renommer", label: "Renommer…" },
              { id: "supprimer", label: `Supprimer « ${space.name} »`, destructive: true },
            ],
            position,
          ),
        );
        if (clique._tag === "Failure") return;
        if (clique.value === "ouvrir") {
          setActiveSpace(space.id);
          onFermer();
        }
        if (clique.value === "renommer") setRenommage({ id: space.id, valeur: space.name });
        if (clique.value === "supprimer") deleteSpace(space.id);
      })();
    },
    [deleteSpace, onFermer, setActiveSpace],
  );

  return (
    // Dimensions MESURÉES sur l'enregistrement Retina d'Arc (30/07, frames
    // 3600×2338 → CSS = pixels ÷ 2) : colonnes de 240 px, écarts de 24 px,
    // marge haute de 87 px. Mes valeurs d'origine — 216 et 12 — étaient des
    // estimations à l'œil, et fausses toutes les deux.
    <div className="flex h-full items-start gap-6 overflow-x-auto px-6 pt-[87px] pb-6">
      {spaces.map((space) => {
        const fils = filsDe(space.id);
        const fond =
          sidebarThemeBackground(space.theme ?? makeSidebarThemeFromColors(["#8a8f98"]), "dark") ??
          undefined;
        return (
          <div
            key={space.id}
            draggable
            onDragStart={() => setGlisse(space.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (glisse !== null && glisse !== space.id) reorderSpaces(glisse, space.id);
              setGlisse(null);
            }}
            onDragEnd={() => setGlisse(null)}
            className={cn(
              // Une colonne = un espace, et son dégradé EST son identité :
              // c'est ce qui rend le tableau lisible d'un coup d'œil.
              // 240 px de large, coins de 10 px : mesurés, pas devinés.
              "flex h-full w-60 shrink-0 flex-col rounded-[10px] ring-1 ring-black/5 transition-opacity",
              glisse === space.id && "opacity-40",
            )}
            style={{ background: fond }}
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
              <SpaceIcon valeur={space.emoji} className="shrink-0 text-[14px]" />
              {renommage?.id === space.id ? (
                <input
                  autoFocus
                  value={renommage.valeur}
                  onChange={(event) =>
                    setRenommage({ id: space.id, valeur: event.currentTarget.value })
                  }
                  onBlur={() => {
                    if (renommage.valeur.trim().length > 0)
                      renameSpace(space.id, renommage.valeur.trim());
                    setRenommage(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenommage(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-black/75">
                  {space.name}
                </span>
              )}
              <button
                type="button"
                aria-label={`Renommer ${space.name}`}
                onClick={() => setRenommage({ id: space.id, valeur: space.name })}
                className="shrink-0 cursor-pointer rounded-md p-1 text-black/40 transition-colors hover:bg-black/5 hover:text-black/70"
              >
                <PencilIcon className="size-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              {fils.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-black/35">Aucun fil rangé ici.</p>
              ) : (
                fils.map((threadKey) => {
                  const [environmentId, threadId] = threadKey.split(":");
                  return (
                    <button
                      key={threadKey}
                      type="button"
                      onClick={() => {
                        if (environmentId === undefined || threadId === undefined) return;
                        void router.navigate({
                          to: "/$environmentId/$threadId",
                          params: { environmentId, threadId },
                        });
                        onFermer();
                      }}
                      className="flex h-7 w-full cursor-pointer items-center rounded-lg px-2 text-left text-[12px] text-black/70 transition-colors hover:bg-black/8"
                    >
                      <span className="truncate">{threadId ?? threadKey}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Le pied d'Arc : poignée à gauche, menu à droite. */}
            <div className="flex items-center justify-between px-3 pt-1 pb-2.5 text-black/35">
              <GripVerticalIcon className="size-4 cursor-grab" />
              <button
                type="button"
                aria-label={`Options de ${space.name}`}
                onClick={(event) => menu(space, { x: event.clientX, y: event.clientY })}
                className="cursor-pointer rounded-md p-0.5 transition-colors hover:bg-black/5 hover:text-black/70"
              >
                <MoreHorizontalIcon className="size-4" />
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        aria-label="Nouvel espace"
        onClick={() => {
          createSpace({
            name: `Espace ${spaces.length + 1}`,
            emoji: "🎨",
            theme: makeSidebarThemeFromColors(["#4caf7d", "#5db3f0"]),
          });
        }}
        className="mt-[45vh] flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/70 text-black/60 shadow-sm transition-colors hover:bg-white"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
