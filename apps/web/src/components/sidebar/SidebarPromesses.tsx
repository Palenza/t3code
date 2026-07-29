import { useCallback } from "react";

import { useRouter } from "@tanstack/react-router";
import { CircleDashedIcon } from "lucide-react";

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

  const ouvrirLeFil = useCallback(
    (promesse: PromesseOuverte) => {
      if (promesse.threadKey === null) return;
      const [environmentId, threadId] = promesse.threadKey.split(":");
      if (environmentId === undefined || threadId === undefined) return;
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
    <div className="flex flex-col gap-0.5 px-2 pb-1.5">
      <p className="px-2 pt-1 pb-0.5 text-[11px] font-medium text-sidebar-muted-foreground/70">
        {ouvertes.length === 1 ? "1 promesse en attente" : `${ouvertes.length} promesses en attente`}
      </p>
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
  );
}
