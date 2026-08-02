import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "@tanstack/react-router";
import { BrushIcon, MoreHorizontalIcon, MoveIcon, PlusIcon } from "lucide-react";

import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

import { settlePromise } from "@t3tools/client-runtime/state/runtime";

import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";

import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import { useSidebarSpacesStore, type SidebarSpace } from "../../sidebarSpacesStore";
import { useProjects, useThreadShells } from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import {
  makeSidebarThemeFromColors,
  sidebarThemeBackground,
  useSidebarThemeStore,
} from "../../sidebarThemeStore";
import { useTheme } from "../../hooks/useTheme";
import { SpaceIcon, SpaceIconPicker } from "./SpaceIconPicker";
import { SpaceThemePanel } from "./SpaceThemePanel";

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
/** Largeur de colonne + gouttière, toutes deux MESURÉES sur l'enregistrement. */
const PAS_COLONNE = 240 + 24;

export function SpacesBoard({ onFermer }: { onFermer: () => void }) {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  // Le thème que la palette écrit quand aucun espace n'est actif — c'est-à-dire
  // exactement quand on est dans « Tous », donc devant ce tableau.
  const themeParDefaut = useSidebarThemeStore((state) => state.theme);
  const { resolvedTheme } = useTheme();
  const assignments = useSidebarSpacesStore((state) => state.assignments);
  const renameSpace = useSidebarSpacesStore((state) => state.renameSpace);
  const deleteSpace = useSidebarSpacesStore((state) => state.deleteSpace);
  const reorderSpaces = useSidebarSpacesStore((state) => state.reorderSpaces);
  const setActiveSpace = useSidebarSpacesStore((state) => state.setActiveSpace);
  const setSpaceEmoji = useSidebarSpacesStore((state) => state.setSpaceEmoji);
  const createSpace = useSidebarSpacesStore((state) => state.createSpace);
  const router = useRouter();
  const threadShells = useThreadShells();

  /**
   * Le TITRE d'un fil, par sa clé.
   *
   * Sans ça, chaque ligne affichait son identifiant brut —
   * « c6ffa76d-6431-475f-98a7-dbc… ». Un tableau censé montrer d'un coup
   * d'œil ce qu'on a rangé, et où, ne montrait rien du tout.
   */
  const projects = useProjects();
  const fichesParCle = useMemo(() => {
    const racineParProjet = new Map(
      projects.map((projet) => [`${projet.environmentId}:${projet.id}`, projet.workspaceRoot]),
    );
    const parCle = new Map<
      string,
      { readonly titre: string; readonly environmentId: EnvironmentId; readonly cwd: string }
    >();
    for (const shell of threadShells) {
      parCle.set(scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)), {
        titre: shell.title,
        environmentId: shell.environmentId,
        cwd: racineParProjet.get(`${shell.environmentId}:${shell.projectId}`) ?? "",
      });
    }
    return parCle;
  }, [projects, threadShells]);

  const [renommage, setRenommage] = useState<{ id: string; valeur: string } | null>(null);

  /**
   * LE GLISSÉ CONTINU.
   *
   * C'était du glisser-déposer natif : image fantôme, et l'ordre ne changeait
   * qu'au LÂCHER. Chez Arc les colonnes s'échangent PENDANT le mouvement, et
   * c'est ça qu'on ressent — la main pousse, la rangée cède. Le natif ne sait
   * pas faire ça ; on écoute donc le pointeur.
   *
   * `indexDepart` est figé au premier appui. À tout instant le décalage visuel
   * vaut « distance parcourue − ce que la rangée a déjà bougé toute seule » :
   * sans ce retrait, la colonne sauterait d'une case à chaque échange.
   */
  const [glisse, setGlisse] = useState<{ readonly id: string; readonly decalage: number } | null>(
    null,
  );
  /** Ce que le geste garde en tête, hors du rendu : ça change à chaque pixel. */
  const gesteRef = useRef<{ id: string; origineX: number; indexDepart: number } | null>(null);

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

  /**
   * Les VOISINES, animées (technique FLIP).
   *
   * Réordonner le tableau les fait sauter : le flux les repose ailleurs d'une
   * image à l'autre. On mémorise donc leur position d'avant, on les y remet
   * d'un coup après le rendu, puis on les laisse revenir. Sans ça, l'échange
   * est juste correct — il n'est pas fluide, et c'est la fluidité qui fait
   * qu'on sent la rangée céder.
   */
  const refsColonnes = useRef(new Map<string, HTMLDivElement>());
  const positionsRef = useRef(new Map<string, number>());
  const ordreRef = useRef<string>("");
  const glisseId = glisse?.id ?? null;
  useLayoutEffect(() => {
    // Ne rien faire tant que l'ORDRE n'a pas changé. Le glissé provoque un
    // rendu à chaque pixel ; se remesurer à chacun relançait une animation
    // par-dessus la précédente, et la rangée tremblait au lieu de glisser.
    const ordre = spaces.map((espace) => espace.id).join(",");
    if (ordre === ordreRef.current) return;
    const avant = positionsRef.current;
    const apres = new Map<string, number>();
    for (const [id, element] of refsColonnes.current) {
      // `offsetLeft`, PAS `getBoundingClientRect` : le second inclut la
      // transformation en cours, donc il mesurait une position en plein vol et
      // la prenait pour la position de repos. C'était la boucle qui tremble.
      const x = element.offsetLeft;
      apres.set(id, x);
      const precedent = avant.get(id);
      if (precedent === undefined || precedent === x || id === glisseId) continue;
      element.style.transition = "none";
      element.style.transform = `translateX(${precedent - x}px)`;
      // Lecture forcée : sans elle le navigateur fusionne les deux écritures
      // et il n'y a aucune transition à voir.
      void element.offsetWidth;
      element.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
      element.style.transform = "";
    }
    positionsRef.current = apres;
    ordreRef.current = ordre;
  }, [glisseId, spaces]);

  /**
   * Le pointeur mène la danse jusqu'au relâchement, où qu'il aille.
   *
   * Les écouteurs se posent UNE fois par glissé. Ils dépendaient de `glisse` et
   * de `spaces` — donc on les retirait et reposait à chaque pixel parcouru, et
   * on relisait une liste figée dans la fermeture. On lit le magasin au moment
   * du geste : c'est la seule version qui ne peut pas être en retard.
   */
  useEffect(() => {
    if (glisseId === null) return;
    const surDeplacement = (event: PointerEvent) => {
      const geste = gesteRef.current;
      if (geste === null) return;
      const espaces = useSidebarSpacesStore.getState().spaces;
      const indexCourant = espaces.findIndex((espace) => espace.id === geste.id);
      if (indexCourant < 0) return;
      const parcouru = event.clientX - geste.origineX;
      const vise = Math.min(
        espaces.length - 1,
        Math.max(0, geste.indexDepart + Math.round(parcouru / PAS_COLONNE)),
      );
      if (vise !== indexCourant) {
        const voisine = espaces[vise];
        if (voisine !== undefined) reorderSpaces(geste.id, voisine.id);
      }
      // AVEC `vise`, PAS `indexCourant`. On vient de déplacer la colonne : sa
      // case est celle d'APRÈS. En retranchant l'ancienne, le décalage était
      // faux d'une largeur entière dès le premier échange, et la colonne
      // sautait sous le doigt. C'était « le swap bugué de fou » du 30/07.
      setGlisse({ id: geste.id, decalage: parcouru - (vise - geste.indexDepart) * PAS_COLONNE });
    };
    const surRelachement = () => {
      gesteRef.current = null;
      setGlisse(null);
    };
    window.addEventListener("pointermove", surDeplacement);
    window.addEventListener("pointerup", surRelachement);
    window.addEventListener("pointercancel", surRelachement);
    return () => {
      window.removeEventListener("pointermove", surDeplacement);
      window.removeEventListener("pointerup", surRelachement);
      window.removeEventListener("pointercancel", surRelachement);
    };
  }, [glisseId, reorderSpaces]);

  return (
    // Dimensions MESURÉES sur l'enregistrement Retina d'Arc (30/07, frames
    // 3600×2338 → CSS = pixels ÷ 2) : colonnes de 240 px, écarts de 24 px,
    // marge haute de 87 px. Mes valeurs d'origine — 216 et 12 — étaient des
    // estimations à l'œil, et fausses toutes les deux.
    <div className="flex h-full items-start gap-6 overflow-x-auto px-6 pt-[87px] pb-6">
      {spaces.map((space) => {
        const fils = filsDe(space.id);
        // LA MÊME RÉSOLUTION QUE LE VOILE DE LA COLONNE : espace > défaut >
        // gris. Le tableau sautait de l'espace au GRIS, sans passer par le
        // défaut — or la palette du bas de colonne, quand on est dans « Tous »,
        // écrit précisément dans ce défaut. Les couleurs choisies là n'avaient
        // donc aucun endroit où se voir, et le tableau restait gris : « ça ne
        // retient rien ». Elles étaient bien enregistrées, jamais relues.
        //
        // Et l'apparence suit le thème de l'app au lieu d'être clouée à
        // « dark » : un tableau en nuit sur une app en clair est le même
        // défaut que celui de la carte de couleurs.
        const fond =
          sidebarThemeBackground(
            space.theme ?? themeParDefaut ?? makeSidebarThemeFromColors(["#8a8f98"]),
            resolvedTheme,
          ) ?? undefined;
        const tenue = glisse?.id === space.id;
        return (
          <div
            key={space.id}
            ref={(element) => {
              if (element === null) refsColonnes.current.delete(space.id);
              else refsColonnes.current.set(space.id, element);
            }}
            style={
              tenue
                ? {
                    background: fond,
                    // Sous le doigt : pas de transition, sinon la colonne
                    // traîne derrière la main au lieu de la suivre.
                    transform: `translateX(${glisse?.decalage ?? 0}px) scale(1.03)`,
                    transition: "none",
                  }
                : { background: fond }
            }
            className={cn(
              // Une colonne = un espace, et son dégradé EST son identité :
              // c'est ce qui rend le tableau lisible d'un coup d'œil.
              // 240 px de large, coins de 10 px : mesurés, pas devinés.
              "flex h-full w-60 shrink-0 flex-col rounded-[10px] ring-1 ring-black/5",
              // Tenue : SOULEVÉE, pas effacée. Je la passais à 40 %
              // d'opacité — on perdait de vue ce qu'on déplaçait. Chez Arc
              // elle grossit et prend une ombre : elle passe DEVANT.
              tenue && "z-10 shadow-2xl",
            )}
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
              {/* L'icône n'est pas une décoration : chez Arc elle OUVRE le
                  sélecteur. La mienne ne réagissait à rien. */}
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Changer l'icône de ${space.name}`}
                      className="shrink-0 cursor-pointer rounded-md p-0.5 transition-colors hover:bg-black/5"
                    >
                      <SpaceIcon valeur={space.emoji} className="text-[14px]" />
                    </button>
                  }
                />
                <PopoverPopup className="p-0">
                  <SpaceIconPicker
                    valeur={space.emoji}
                    onChange={(valeur) => setSpaceEmoji(space.id, valeur)}
                  />
                </PopoverPopup>
              </Popover>
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
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold outline-none"
                />
              ) : (
                // 12 px mesurés, et volontairement PÂLE : l'encre du titre
                // relève à 74 de luminance quand celle des entrées tombe à 19
                // — le nom de l'espace s'efface derrière son contenu.
                <button
                  type="button"
                  onClick={() => setRenommage({ id: space.id, valeur: space.name })}
                  // Le renommage passe par le NOM : le pinceau, lui, ouvre les
                  // couleurs — c'est ce que fait Arc, et c'est ce que le
                  // pinceau annonce.
                  className="min-w-0 flex-1 cursor-text truncate text-left text-[12px] font-semibold text-black/45"
                >
                  {space.name}
                </button>
              )}
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Couleurs de ${space.name}`}
                      className="shrink-0 cursor-pointer rounded-md p-1 text-black/40 transition-colors hover:bg-black/5 hover:text-black/70"
                    >
                      <BrushIcon className="size-4" />
                    </button>
                  }
                />
                <PopoverPopup
                  // Le panneau porte son propre verre — la surface du popup ne
                  // doit pas l'assombrir (même réglage que dans la sidebar).
                  className="border-0! bg-transparent! p-0 shadow-2xl before:hidden"
                  viewportClassName="p-0 [--viewport-inline-padding:0px]"
                >
                  {/* Ciblé : on repeint CETTE colonne, pas l'espace courant. */}
                  <SpaceThemePanel spaceId={space.id} />
                </PopoverPopup>
              </Popover>
            </div>

            {/* Gouttière MESURÉE : l'icône démarre à 17 px du bord, fait 20 px
                de côté, et le libellé commence à 45 px — trois entrées
                mesurées, écart nul entre elles. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-[17px] py-1">
              {fils.length === 0 ? (
                <p className="py-3 text-[11px] text-black/35">Aucun fil rangé ici.</p>
              ) : (
                fils.map((threadKey) => {
                  const [environmentId, threadId] = threadKey.split(":");
                  const fiche = fichesParCle.get(threadKey);
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
                      // Hauteur de ligne de 41 px MESURÉE (82 px Retina, quatre
                      // fois de suite) : j'avais mis 28. Et l'encre est franche
                      // — c'est le contenu qui porte, pas le titre.
                      className="flex h-[41px] w-full cursor-pointer items-center gap-2 rounded-lg text-left text-[11px] font-semibold text-black/80 transition-colors hover:bg-black/8"
                    >
                      {/* La pastille de 20 px qui précède chaque entrée : c'est
                          elle qui pose la gouttière de 45 px du libellé. Arc y
                          met le favicon du site ; ici celui du projet. Le carré
                          gris ne subsiste que si le projet est inconnu — il ne
                          prétend alors à rien. */}
                      {fiche === undefined ? (
                        <span aria-hidden className="size-5 shrink-0 rounded-[5px] bg-black/12" />
                      ) : (
                        <ProjectFavicon
                          environmentId={fiche.environmentId}
                          cwd={fiche.cwd}
                          className="size-5 shrink-0 rounded-[5px]"
                        />
                      )}
                      {/* L'identifiant ne reste qu'en dernier recours — un fil
                          d'un autre environnement, pas encore chargé ici. Mieux
                          vaut une clé qu'une ligne vide, mais c'est un aveu. */}
                      <span className="truncate">{fiche?.titre ?? threadId ?? threadKey}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Le pied d'Arc : poignée à gauche, menu à droite. */}
            <div className="flex items-center justify-between px-3 pt-1 pb-2.5 text-black/35">
              {/* La poignée d'Arc : une croix de déplacement, pas des rainures
                  — et c'est ELLE qui démarre le glissé, pas la colonne
                  entière. Elle s'allume tant qu'on tient. */}
              <button
                type="button"
                aria-label={`Déplacer ${space.name}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  gesteRef.current = {
                    id: space.id,
                    origineX: event.clientX,
                    indexDepart: spaces.findIndex((espace) => espace.id === space.id),
                  };
                  setGlisse({ id: space.id, decalage: 0 });
                }}
                className={cn(
                  "cursor-grab rounded-md p-1 transition-colors active:cursor-grabbing",
                  tenue ? "bg-black/10 text-black/70" : "hover:bg-black/5",
                )}
              >
                <MoveIcon className="size-4" />
              </button>
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
        // Centré sur la HAUTEUR des colonnes, pas posé à 45 % de la fenêtre :
        // avec une seule colonne il partait bien plus bas que son voisinage.
        // `self-center` le cale sur la ligne, `mt-0` annule l'ancien décalage.
        className="mt-0 flex size-8 shrink-0 cursor-pointer items-center justify-center self-center rounded-full bg-white/70 text-black/60 shadow-sm transition-colors hover:bg-white"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
