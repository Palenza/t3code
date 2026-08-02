import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, CircleCheckIcon } from "lucide-react";

import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";

import { cn } from "../lib/utils";
import { resolveSidebarV2Status } from "./Sidebar.logic";
import { useThreadShells } from "../state/entities";
import { useSidebarSpacesStore } from "../sidebarSpacesStore";
import { sidebarThemeAccent, useSidebarThemeStore } from "../sidebarThemeStore";
import {
  finsDeTache,
  photographier,
  retourApresSaut,
  retourEncoreUtile,
  type Emplacement,
} from "../finDeTacheAilleurs";
import { toastManager } from "./ui/toast";

/**
 * « Une tâche vient de finir DANS UN AUTRE ESPACE » — la veille, et le retour.
 *
 * Demande fondateur, mot pour mot : je lance une tâche dans l'espace Design,
 * je pars travailler ailleurs, elle finit — il faut que je le voie, que le
 * clic me pose dans le bon espace ET le bon fil, et que je puisse REVENIR
 * d'où je venais.
 *
 * La RÈGLE (quoi notifier, et quand se taire) vit dans `finDeTacheAilleurs.ts`
 * et y est testée. Ce composant ne fait que la brancher : il regarde les fils,
 * il pose le toast, il navigue, il tient la pastille de retour.
 *
 * Rien à l'écran tant qu'il ne se passe rien.
 */
export function VeilleFinDeTache() {
  const threads = useThreadShells();
  const navigate = useNavigate();
  /**
   * Le chemin par le ROUTEUR, pas par `window.location`.
   *
   * Première version : je lisais `window.location.pathname` dans les
   * effets. Ce n'est pas une valeur réactive — revenir à la main sur le
   * fil d'origine ne relançait donc aucun effet, et la pastille « Revenir »
   * restait affichée en proposant d'aller là où on était déjà.
   */
  const chemin = useLocation({ select: (lieu) => lieu.pathname });
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const assignments = useSidebarSpacesStore((state) => state.assignments);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const setActiveSpace = useSidebarSpacesStore((state) => state.setActiveSpace);
  const themeParDefaut = useSidebarThemeStore((state) => state.theme);

  /** La photo du tour précédent — `null` au tout premier passage. */
  const precedentRef = useRef<ReadonlyMap<string, boolean> | null>(null);
  const [retour, setRetour] = useState<Emplacement | null>(null);

  // Les valeurs volatiles passent par une réf : le comparateur ne doit
  // dépendre QUE des fils, sinon changer d'espace relancerait la détection et
  // notifierait des fins déjà vues.
  const contexteRef = useRef({ assignments, activeSpaceId, spaces, themeParDefaut });
  contexteRef.current = { assignments, activeSpaceId, spaces, themeParDefaut };

  const sauter = useCallback(
    (destination: Emplacement, depart: Emplacement) => {
      setRetour(retourApresSaut({ depart, arrivee: destination }));
      if (destination.spaceId !== contexteRef.current.activeSpaceId) {
        setActiveSpace(destination.spaceId);
      }
      const [environmentId, threadId] = destination.threadKey.split(":");
      if (environmentId === undefined || threadId === undefined) return;
      void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
    },
    [navigate, setActiveSpace],
  );

  useEffect(() => {
    const etats = threads.map((thread) => {
      const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      return { threadKey: key, travaille: resolveSidebarV2Status(thread) === "working" };
    });
    const {
      assignments: rangement,
      activeSpaceId: espaceActif,
      spaces: tousLesEspaces,
    } = contexteRef.current;

    // Le fil REGARDÉ est celui de la route courante ; on le lit sur le lieu,
    // pas dans l'état, pour rester juste même juste après une navigation.
    const [, envCourant, filCourant] = chemin.split("/");
    const filActif =
      envCourant !== undefined && filCourant !== undefined ? `${envCourant}:${filCourant}` : null;

    const fins = finsDeTache({
      precedent: precedentRef.current,
      courant: etats,
      threadKeyActif: filActif,
      espaceDuFil: (threadKey) => rangement[threadKey] ?? null,
    });
    precedentRef.current = photographier(etats);
    if (fins.length === 0) return;

    for (const fin of fins) {
      // Une tâche finie dans l'espace qu'on regarde DÉJÀ n'a pas besoin d'un
      // toast : la colonne le montre. On ne notifie que ce qui est ailleurs.
      if (fin.spaceId === espaceActif) continue;
      const espace = tousLesEspaces.find((candidat) => candidat.id === fin.spaceId) ?? null;
      const accent = sidebarThemeAccent(espace?.theme ?? contexteRef.current.themeParDefaut);
      const depart: Emplacement = {
        spaceId: espaceActif,
        threadKey: filActif ?? "",
      };
      toastManager.add({
        type: "success",
        title: espace ? `Terminé dans ${espace.name}` : "Une tâche vient de finir",
        // La PASTILLE DE COULEUR porte la palette de l'espace — consigne
        // fondateur : « si quelqu'un change la palette de couleur, ça change
        // aussi la palette de ses notifs ». On sait d'où vient la notification
        // avant même d'avoir lu son texte.
        data: {
          leadingIcon: (
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
          ),
        },
        actionProps: {
          children: "Ouvrir",
          onClick: () => sauter({ spaceId: fin.spaceId, threadKey: fin.threadKey }, depart),
        },
      });
    }
  }, [threads, sauter, chemin]);

  // Le retour s'efface dès qu'on est revenu par ses propres moyens.
  useEffect(() => {
    const [, env, fil] = chemin.split("/");
    const position: Emplacement = {
      spaceId: activeSpaceId,
      threadKey: env !== undefined && fil !== undefined ? `${env}:${fil}` : "",
    };
    setRetour((actuel) => retourEncoreUtile(actuel, position));
  }, [activeSpaceId, chemin]);

  if (retour === null) return null;

  const espaceDeRetour = spaces.find((espace) => espace.id === retour.spaceId) ?? null;
  return (
    // LA PASTILLE DE RETOUR — la moitié qui manque partout ailleurs. Une
    // notification qui déplace sans ramener règle la visibilité en créant une
    // perte ; le point de départ est mémorisé à l'instant du saut.
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--workspace-topbar-height)+8px)] z-40 flex justify-center">
      <button
        type="button"
        onClick={() => {
          const cible = retour;
          setRetour(null);
          // L'espace revient TOUJOURS — c'est la moitié du retour qui marche
          // même quand on ne regardait aucun fil au départ (vue d'accueil,
          // tableau des espaces). Ma première version sortait tôt dans ce
          // cas : la clé de fil était vide, `split(":")` ne rendait pas deux
          // morceaux, et le bouton ne faisait RIEN — un bouton mort, le pire
          // des états puisqu'il a l'air de marcher.
          setActiveSpace(cible.spaceId);
          const [environmentId, threadId] = cible.threadKey.split(":");
          if (!environmentId || !threadId) return;
          void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
        }}
        className={cn(
          "t3-verre t3-verre-nuit pointer-events-auto flex h-8 cursor-pointer items-center gap-2",
          "rounded-full px-3 text-[12px] font-medium text-foreground/85 transition-transform hover:scale-[1.03]",
        )}
      >
        <ArrowLeftIcon className="size-3.5 shrink-0" />
        <span>Revenir{espaceDeRetour ? ` à ${espaceDeRetour.name}` : ""}</span>
        <CircleCheckIcon className="size-3.5 shrink-0 opacity-40" />
      </button>
    </div>
  );
}
