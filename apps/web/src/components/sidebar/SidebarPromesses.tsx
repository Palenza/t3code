import { useCallback, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { ChevronRightIcon, CircleDashedIcon } from "lucide-react";

import { cn } from "../../lib/utils";

import { settlePromise } from "@t3tools/client-runtime/state/runtime";

import { readLocalApi } from "../../localApi";
import { usePromessesStore, type PromesseOuverte } from "../../promessesStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Les promesses en attente — ce que l'agent a dit qu'il ferait et qui ne l'est
 * pas.
 *
 * Discret par construction : rien ne s'affiche quand il n'y a rien en attente,
 * et une seule ligne par promesse. Le but n'est pas de culpabiliser mais de
 * rendre visible une charge que l'humain portait seul jusqu'ici — se souvenir
 * de ce qui a été annoncé.
 *
 * Clic = retourner au fil où la promesse a été faite. Clic droit = la barrer :
 * le dernier mot appartient toujours à l'humain, y compris pour décider qu'une
 * promesse n'a plus lieu d'être.
 */
export function SidebarPromesses() {
  const ouvertes = usePromessesStore((state) => state.ouvertes);
  const barrer = usePromessesStore((state) => state.barrer);
  const router = useRouter();
  /** Repliée au départ : le compte suffit, la liste est une consultation. */
  const [ouverte, setOuverte] = useState(false);

  const ouvrirLeFil = useCallback(
    (promesse: PromesseOuverte) => {
      if (promesse.threadKey === null) return;
      const [environmentId, threadId] = promesse.threadKey.split(":");
      // Vide, pas seulement absent : un fil encore à l'état de brouillon donne
      // « env: », dont `split` rend bien deux morceaux — le second étant "".
      // Tester `undefined` laissait passer ce cas vers une route cassée.
      if (!environmentId || !threadId) return;
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId, threadId },
      });
    },
    [router],
  );

  const menu = useCallback(
    (promesse: PromesseOuverte, position: { x: number; y: number }) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clique = await settlePromise(() =>
          api.contextMenu.show([{ id: "barrer", label: "Barrer cette promesse" }], position),
        );
        if (clique._tag === "Failure") return;
        if (clique.value === "barrer") barrer(promesse.id);
      })();
    },
    [barrer],
  );

  if (ouvertes.length === 0) return null;

  return (
    // REPLIÉE PAR DÉFAUT — une ligne, pas une liste.
    //
    // Elle rendait TOUTES les promesses ouvertes, sans plafond : à 20, elle
    // mesurait près de 600 px et poussait hors de l'écran tout ce qui vient
    // après elle — la recherche, les espaces, les réglages. Ce n'était pas la
    // barre latérale qui était rognée, c'était cette section qui débordait.
    //
    // Le compte suffit au repos : savoir QU'IL Y EN A est l'information de
    // tous les jours ; savoir LESQUELLES est une consultation. On ouvre quand
    // on veut, et ça défile chez soi au lieu de pousser ailleurs.
    <div className="flex shrink-0 flex-col gap-0.5 px-2 pb-1.5">
      <button
        type="button"
        aria-expanded={ouverte}
        onClick={() => setOuverte((etat) => !etat)}
        className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 text-left text-sidebar-muted-foreground/70 transition-colors hover:bg-sidebar-row-hover"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 transition-transform duration-200",
            ouverte && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
          {ouvertes.length === 1
            ? "1 promesse en attente"
            : `${ouvertes.length} promesses en attente`}
        </span>
      </button>
      {ouverte ? (
        // Le verre déjà posé ce matin pour l'éditeur de thème : il réfracte le
        // voile coloré de la colonne, donc le panneau prend la couleur de
        // l'espace au lieu de poser un rectangle opaque par-dessus.
        <div className="t3-verre t3-verre-nuit flex max-h-[252px] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl p-1">
          {ouvertes.map((promesse) => (
            <Tooltip key={promesse.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Promesse : ${promesse.phrase}`}
                    onClick={() => ouvrirLeFil(promesse)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      menu(promesse, { x: event.clientX, y: event.clientY });
                    }}
                    className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-sidebar-row-hover"
                  >
                    <CircleDashedIcon className="size-3.5 shrink-0 text-sidebar-foreground/50" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-sidebar-foreground/75">
                      {promesse.phrase}
                    </span>
                  </button>
                }
              />
              <TooltipPopup side="right">{promesse.phrase}</TooltipPopup>
            </Tooltip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
