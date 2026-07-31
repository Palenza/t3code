import { useCallback, useMemo, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useTheme } from "../../hooks/useTheme";
import { useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  makeSidebarThemeFromColors,
  SIDEBAR_THEME_GRAIN_URL,
  useSidebarThemeStore,
  type SidebarTheme,
} from "../../sidebarThemeStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  ajouterRond,
  deplacerFigure,
  poserFigure,
  retirerRond,
  stopsAvecCouleurs,
  stopsDepuisPoints,
  wheelColorAt,
  wheelPositionOf,
} from "./SpaceThemePanel.logic";

/**
 * L'éditeur de thème d'Arc.
 *
 * La géométrie de la toile vit dans `SpaceThemePanel.logic.ts` — elle porte
 * l'invariant « les ronds restent TOUJOURS à distance égale », et il est
 * testé. Ici on ne fait que la peau : le verre, le nuancier, la vague, la
 * molette.
 *
 * L'apparence claire/sombre du panneau suit le THÈME DE L'APP
 * (`useTheme().resolvedTheme`), jamais la préférence système brute. La
 * version précédente interrogeait `matchMedia("(prefers-color-scheme:dark)")`
 * en direct : sur une app forcée en nuit avec un macOS en clair, le panneau
 * se peignait en CLAIR par-dessus du noir — d'où les chevrons illisibles et
 * les icônes qui « disparaissaient » au survol (elles s'assombrissaient vers
 * le fond gris au lieu de s'éclaircir).
 */

const MAX_ARC_STOPS = 3;

/** Page 1 — couleurs unies, un rond = une dominante. */
const SOLID_SWATCHES: ReadonlyArray<string> = [
  "#f2ead9",
  "#f2a3c0",
  "#9b6fc3",
  "#ef8a70",
  "#fbd87f",
  "#a5d977",
  "#4fd1c5",
  "#5b8def",
  "#6b5b95",
];

/**
 * Page 2 — les 9 gradients de la page 2 d'Arc, relevés sur les frames
 * (crème, rose, mauve sombre, orange-rouge, or, vert-jaune, turquoise,
 * bleu-violet, ardoise). Un clic pose les trois ronds d'un coup.
 */
const GRADIENT_SWATCHES: ReadonlyArray<readonly [string, string, string]> = [
  ["#f4efe2", "#efe6d4", "#e6d9c2"],
  ["#f6b4c8", "#f2a3c0", "#e78fb2"],
  ["#8a6a86", "#7c5f79", "#6a4f68"],
  ["#f08a62", "#e8785a", "#d95f70"],
  ["#f2cd68", "#eebb4d", "#e8a53f"],
  ["#c8e065", "#a8d455", "#8fc94f"],
  ["#59d8b2", "#4fd1c5", "#3fb8c9"],
  ["#7d92e8", "#7a82e0", "#8f6fd9"],
  ["#63638f", "#565683", "#4a4a70"],
];

/** Tailles d'Arc (1 919 frames, σ 0) : dominante 34 css, satellites 20. */
const STOP_SIZES_PX = [34, 20, 20] as const;

/**
 * UN SEUL MODE — ordre fondateur du 31/07 : « on va aussi enlever le mode
 * nuit, c'est moche ; on garde qu'un seul mode, celui avec les trois étoiles
 * scintillantes ». Le 30/07 avait déjà retiré le mode clair. Il ne reste donc
 * plus de CHOIX à faire : les étoiles ne sont plus un bouton, ce sont
 * l'ENSEIGNE de ce que fait la carte — les couleurs suivent le thème de
 * l'app. Le champ `appearance` reste dans le type (des thèmes enregistrés le
 * portent encore) ; le panneau le remet à « auto » dès qu'il écrit.
 */
const MODE_TITRE = "Dynamique";
const MODE_EXPLICATION = "Les couleurs suivent le thème de l'app.";

/**
 * Le socle, en chiffres NOMMÉS. La largeur du rail de la vague se DÉDUIT du
 * reste : elle était écrite en dur (242) à côté de son calcul en commentaire,
 * donc changer l'écart vague/molette déréglait silencieusement la longueur
 * d'onde mesurée. Ici, c'est impossible.
 */
const PANNEAU_LARGEUR = 358;
const SOCLE_PADDING_X = 16;
/** L'écart entre la vague et la molette — l'ancien (12) les collait. */
const ECART_VAGUE_MOLETTE = 20;
const MOLETTE_TAILLE = 72;
const RAIL_LARGEUR = PANNEAU_LARGEUR - 2 * SOCLE_PADDING_X - ECART_VAGUE_MOLETTE - MOLETTE_TAILLE;

/**
 * Le verre liquide n'ondule pas si l'utilisateur a demandé moins de
 * mouvement. Lu une fois : le panneau se monte bien après le chargement, et
 * une préférence d'accessibilité ne change pas en cours de glissé.
 */
const MOUVEMENT_REDUIT =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

/**
 * `spaceId` vise un espace PRÉCIS plutôt que l'espace courant (tableau des
 * espaces). Absent, le panneau édite l'espace actif.
 */
export function SpaceThemePanel({ spaceId }: { readonly spaceId?: string } = {}) {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const cibleId = spaceId ?? activeSpaceId;
  const setSpaceTheme = useSidebarSpacesStore((state) => state.setSpaceTheme);
  const defaultTheme = useSidebarThemeStore((state) => state.theme);
  const setDefaultTheme = useSidebarThemeStore((state) => state.setTheme);
  const { resolvedTheme } = useTheme();

  const activeSpace = spaces.find((space) => space.id === cibleId) ?? null;
  const enregistre =
    (activeSpace ? activeSpace.theme : defaultTheme) ?? makeSidebarThemeFromColors(["#f2a3c0"]);
  // Un seul mode : un thème enregistré avec une apparence ÉPINGLÉE (mode nuit
  // d'avant le 31/07) est relu comme « auto », et repart en « auto » à la
  // première retouche. Rien à migrer, rien qui reste coincé en nuit.
  const current: SidebarTheme =
    enregistre.appearance === "auto" ? enregistre : { ...enregistre, appearance: "auto" };
  const apply = useCallback(
    (next: SidebarTheme) => {
      if (activeSpace) {
        setSpaceTheme(activeSpace.id, next);
        return;
      }
      setDefaultTheme(next);
    },
    [activeSpace, setDefaultTheme, setSpaceTheme],
  );

  const [swatchPage, setSwatchPage] = useState(0);

  // ------------------------------------------------------------- la toile
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  // L'état ne sert que le STYLE : glissé = zéro transition (assemblage
  // rigide mesuré), saut discret = glissade 200 ms.
  const [enGlisse, setEnGlisse] = useState(false);

  const dominant = current.stops[0] ?? { color: wheelColorAt(0.62, 0.4), x: 0.62, y: 0.4 };

  const moveGroup = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (canvas === null || !draggingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      // TRANSLATION de toute la figure : les écarts entre ronds sont
      // invariants par translation, donc « à distance égale » tient sans
      // qu'on ait à le rattraper après coup.
      apply({ ...current, stops: stopsDepuisPoints(deplacerFigure(current.stops, x, y)) });
    },
    [apply, current],
  );

  const finDeGlisse = useCallback(() => {
    draggingRef.current = false;
    setEnGlisse(false);
  }, []);

  const applySolid = useCallback(
    (color: string) => {
      // UNE couleur unie = UN rond, avec la couleur EXACTE de la pastille.
      // (Reproche fondateur : revenir des gradients aux unis laissait trois
      // ronds ; « si je choisis le jaune, ça me met que le rond jaune ».)
      const position = wheelPositionOf(color);
      apply({
        ...current,
        stops: stopsAvecCouleurs(poserFigure(position.x, position.y, 1), [color]),
      });
    },
    [apply, current],
  );

  const applyGradient = useCallback(
    (trio: readonly [string, string, string]) => {
      // Un gradient = TROIS ronds, aux couleurs EXACTES du préréglage,
      // ancrés sur le premier ton.
      const position = wheelPositionOf(trio[0]);
      apply({ ...current, stops: stopsAvecCouleurs(poserFigure(position.x, position.y, 3), trio) });
    },
    [apply, current],
  );

  const addStop = useCallback(() => {
    if (current.stops.length >= MAX_ARC_STOPS) return;
    // Les ronds déjà là GARDENT leur couleur — ajouter un point ne doit pas
    // repeindre le choix de l'utilisateur. Seul le nouveau se lit sur la
    // roue, et il naît du côté pâle : « ça garde le plus blanc ».
    apply({
      ...current,
      stops: stopsAvecCouleurs(
        ajouterRond(current.stops, MAX_ARC_STOPS),
        current.stops.map((stop) => stop.color),
      ),
    });
  }, [apply, current]);
  const removeStop = useCallback(() => {
    if (current.stops.length <= 1) return;
    // Les rescapés ne bougent pas : ils gardent position ET couleur, donc
    // l'écart entre eux survit tel quel.
    const restants = retirerRond(current.stops).length;
    apply({ ...current, stops: current.stops.slice(0, restants) });
  }, [apply, current]);

  // Plus de mode épinglé : la carte suit le thème de l'app, point. (Et
  // JAMAIS `matchMedia` en direct — c'est ce qui peignait la carte en clair
  // par-dessus une app en nuit quand le macOS, lui, était en clair.)
  const isDarkCanvas = resolvedTheme === "dark";

  const mutedControl = isDarkCanvas
    ? "text-white/70 hover:bg-white/12 hover:text-white"
    : "text-neutral-600 hover:bg-black/8 hover:text-neutral-900";

  // Glissé : rigide. Saut discret : glissade. (Mesure : ratio 0,98 en drag.)
  const transitionRonds = enGlisse
    ? "none"
    : "left 200ms cubic-bezier(0.22,1,0.36,1), top 200ms cubic-bezier(0.22,1,0.36,1), background-color 120ms";

  return (
    // 358 × 510 css MESURÉS (bords à ±1 px sur frame claire et sombre),
    // coins larges. Le panneau EST du verre liquide : il réfracte le fond
    // (Chromium), et retombe sur un verre dépoli propre ailleurs.
    <div
      className={cn(
        "t3-verre relative flex w-[358px] flex-col overflow-hidden rounded-2xl",
        isDarkCanvas ? "t3-verre-nuit" : "t3-verre-jour",
      )}
    >
      <VerreLiquideDefs />
      {/* La toile-palette : pointillée. Panneau total 510 css (mesure bords
          13→1033 crop) ; la séparation toile/socle mesurée oscille entre 369
          et 393 selon la frame — 372 tient les deux. */}
      <div
        ref={canvasRef}
        className={cn(
          "relative h-[372px] touch-none rounded-t-2xl bg-[radial-gradient(circle,var(--dot)_1px,transparent_1px)] bg-[size:9px_9px]",
          isDarkCanvas
            ? "[--dot:color-mix(in_oklab,white_22%,transparent)]"
            : "[--dot:color-mix(in_oklab,black_18%,transparent)]",
        )}
        onPointerMove={(event) => {
          if (draggingRef.current) moveGroup(event.clientX, event.clientY);
        }}
        onPointerUp={finDeGlisse}
      >
        <div className="absolute inset-x-0 top-3 flex items-center justify-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={`${MODE_TITRE} — ${MODE_EXPLICATION}`}
                  className={cn(
                    "t3-etoiles flex size-7 items-center justify-center rounded-lg",
                    isDarkCanvas ? "text-white/85" : "text-neutral-700",
                  )}
                >
                  <EtoilesScintillantes />
                </span>
              }
            />
            <TooltipPopup side="top">
              {MODE_TITRE} — {MODE_EXPLICATION}
            </TooltipPopup>
          </Tooltip>
        </div>
        {current.stops.slice(1).map((stop, index) => {
          const size = STOP_SIZES_PX[index + 1] ?? 20;
          return (
            <button
              // L'index EST l'identité stable pendant le glissé (une clé
              // couleur/position remonterait le bouton à chaque frame).
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              type="button"
              aria-label={`Prendre cette couleur comme dominante`}
              onPointerDown={(event) => {
                // Promotion : le satellite DEVIENT la dominante, sur place —
                // échange de rôles, pas de rotation du trio. Un triangle
                // équilatéral vu depuis n'importe quel sommet reste
                // équilatéral : l'invariant survit à la permutation.
                event.preventDefault();
                event.stopPropagation();
                const stops = [...current.stops];
                const [promu] = stops.splice(index + 1, 1);
                if (promu === undefined) return;
                apply({ ...current, stops: [promu, ...stops] });
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full shadow-sm ring-2 ring-white hover:scale-110"
              style={{
                left: `${stop.x * 100}%`,
                top: `${stop.y * 100}%`,
                width: size,
                height: size,
                backgroundColor: stop.color,
                transition: transitionRonds,
              }}
            />
          );
        })}
        <button
          type="button"
          aria-label="Mélanger — la position module la couleur, les ronds gardent leur écart"
          onPointerDown={(event) => {
            event.preventDefault();
            draggingRef.current = true;
            setEnGlisse(true);
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Sans capture, le drag vit tant que le pointeur survole.
            }
          }}
          onPointerMove={(event) => {
            if (draggingRef.current) moveGroup(event.clientX, event.clientY);
          }}
          onPointerUp={finDeGlisse}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full shadow-md ring-[3px] ring-white active:cursor-grabbing"
          style={{
            left: `${dominant.x * 100}%`,
            top: `${dominant.y * 100}%`,
            width: STOP_SIZES_PX[0],
            height: STOP_SIZES_PX[0],
            backgroundColor: dominant.color,
            transition: transitionRonds,
          }}
        />
        <div className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Retirer un rond"
            disabled={current.stops.length <= 1}
            onClick={removeStop}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent",
              mutedControl,
            )}
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Ajouter un rond"
            disabled={current.stops.length >= MAX_ARC_STOPS}
            onClick={addStop}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent",
              mutedControl,
            )}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Le SOCLE laiteux : nuancier + vague + molette. */}
      <div className={cn("flex flex-col", isDarkCanvas ? "bg-neutral-900/40" : "bg-white/45")}>
        {/* Le nuancier GLISSE entre ses pages (mesure : ~300 ms par page). */}
        <div className="flex items-center gap-1 px-2.5 pt-3 pb-1.5">
          <FlecheNuancier
            direction="gauche"
            libelle="Couleurs unies"
            disabled={swatchPage === 0}
            onClick={() => setSwatchPage(0)}
            muted={mutedControl}
          />
          {/* Le rembourrage EST la correction du rognage : les pastilles
              grandissent de 10 % au survol (24 → 26,4 css) et l'anneau
              ajoute 1 css ; sans ces 6 css de marge intérieure, le masque
              qui fait glisser les pages leur coupait les bords. */}
          <div className="relative flex-1 overflow-hidden px-1.5 py-1.5">
            <div
              className="flex w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
              style={{ transform: swatchPage === 0 ? "translateX(0%)" : "translateX(-50%)" }}
            >
              <div className="flex w-1/2 items-center justify-between">
                {SOLID_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Couleur ${color}`}
                    tabIndex={swatchPage === 0 ? 0 : -1}
                    onClick={() => applySolid(color)}
                    // La pastille montre la couleur qu'elle POSE — pas une
                    // version assombrie d'elle-même : le jaune doit donner
                    // le jaune.
                    className="size-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex w-1/2 items-center justify-between">
                {GRADIENT_SWATCHES.map((trio) => (
                  <button
                    key={trio.join("-")}
                    type="button"
                    aria-label={`Gradient ${trio.join(", ")}`}
                    tabIndex={swatchPage === 1 ? 0 : -1}
                    onClick={() => applyGradient(trio)}
                    // Le liseré d'Arc : un anneau INTÉRIEUR sombre du propre
                    // ton de la pastille (relevé sur zoom natif).
                    className="size-6 cursor-pointer rounded-full shadow-[inset_0_0_0_2px_rgba(0,0,0,0.14)] transition-transform hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${trio[0]} 0%, ${trio[1]} 50%, ${trio[2]} 100%)`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <FlecheNuancier
            direction="droite"
            libelle="Dégradés préréglés"
            disabled={swatchPage === 1}
            onClick={() => setSwatchPage(1)}
            muted={mutedControl}
          />
        </div>

        {/* La vague d'intensité + la molette de grain. L'écart vient de la
            constante, pas d'une classe : c'est le même nombre qui décide de
            l'espace ICI et de la largeur du rail LÀ-BAS. */}
        <div
          className="flex items-center pt-1.5 pb-4"
          style={{
            paddingLeft: SOCLE_PADDING_X,
            paddingRight: SOCLE_PADDING_X,
            gap: ECART_VAGUE_MOLETTE,
          }}
        >
          <IntensityWave
            dark={isDarkCanvas}
            value={current.intensity}
            onChange={(intensity) => apply({ ...current, intensity })}
          />
          <GrainDial
            dark={isDarkCanvas}
            couleur={dominant.color}
            value={current.grain}
            onChange={(grain) => apply({ ...current, grain })}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Le filtre de réfraction du verre liquide (feTurbulence → feDisplacementMap),
 * technique vérifiée. L'id est constant : deux panneaux montés en même temps
 * poseraient deux `<filter>` BYTE POUR BYTE identiques, le navigateur résout
 * le premier — inerte. `@supports` (index.css) fait retomber Safari/Firefox
 * sur un verre dépoli propre.
 */
function VerreLiquideDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter
        id="t3-verre-liquide"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        colorInterpolationFilters="sRGB"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.008 0.010"
          numOctaves={2}
          seed={7}
          result="bruit"
        >
          {MOUVEMENT_REDUIT ? null : (
            <animate
              attributeName="baseFrequency"
              dur="18s"
              values="0.008 0.010;0.012 0.008;0.008 0.010"
              repeatCount="indefinite"
            />
          )}
        </feTurbulence>
        <feGaussianBlur in="bruit" stdDeviation="2.4" result="bruitDoux" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="bruitDoux"
          scale={44}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

/**
 * Les flèches de page du nuancier. Elles étaient quasi invisibles : gris pâle
 * sur socle pâle, et 30 % d'opacité une fois désactivées. Une commande qu'on
 * ne voit pas est une commande qui n'existe pas — d'où la pastille au survol,
 * le contraste plein et l'info-bulle qui dit où mène la flèche.
 */
function FlecheNuancier(props: {
  direction: "gauche" | "droite";
  libelle: string;
  disabled: boolean;
  muted: string;
  onClick: () => void;
}) {
  const Icone = props.direction === "gauche" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={props.libelle}
            disabled={props.disabled}
            onClick={props.onClick}
            className={cn(
              "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent",
              props.muted,
            )}
          >
            <Icone className="size-[18px]" strokeWidth={2.25} />
          </button>
        }
      />
      <TooltipPopup side="top">{props.libelle}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Les étoiles de l'apparence dynamique. Elles scintillent EN PERMANENCE
 * (l'animation vit dans index.css) et le survol ne fait que les presser :
 * l'ancienne version n'animait qu'au survol, en descendant à 35 % d'opacité —
 * l'icône avait l'air de s'ÉTEINDRE quand on la visait.
 */
function EtoilesScintillantes() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <path
        className="t3-etoile"
        d="M6 1.2 7.3 4.2 10.3 5.5 7.3 6.8 6 9.8 4.7 6.8 1.7 5.5 4.7 4.2Z"
        fill="currentColor"
      />
      <path
        className="t3-etoile t3-etoile-2"
        d="M11.8 6.6 12.6 8.4 14.4 9.2 12.6 10 11.8 11.8 11 10 9.2 9.2 11 8.4Z"
        fill="currentColor"
      />
      <path
        className="t3-etoile t3-etoile-3"
        d="M7.6 10.8 8.2 12.2 9.6 12.8 8.2 13.4 7.6 14.8 7 13.4 5.6 12.8 7 12.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * La vague d'Arc, re-mesurée à 120 Hz (4 965 frames, natif). Contre la
 * version précédente, deux corrections tranchées par la mesure :
 *
 * — UNE SEULE VAGUE CONTINUE, pleine largeur, amplitude UNIFORME : la
 *   demi-amplitude suit la course (≈ 1 css à 10 %, 14,25 css à 95 %,
 *   linéaire), la longueur d'onde est FIXE (36 css, σ 1,1-1,9 sur toute la
 *   plage utile). La « queue » après la poignée a la MÊME amplitude — elle
 *   est seulement PLUS PÂLE (luminance de trait 117-122 avant la poignée,
 *   165-172 après, sur les mêmes frames). L'ancienne queue à 0,55× n'existe
 *   pas.
 * — La vague roule sur une PISTE : bande arrondie pâle de 16 css, pleine
 *   largeur, que les crêtes débordent. Trait 3,5 css. Poignée 22 × 54 css.
 */
function IntensityWave(props: { dark: boolean; value: number; onChange: (value: number) => void }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const valueFromPointer = (clientX: number) => {
    const rail = railRef.current;
    if (rail === null) return;
    const rect = rail.getBoundingClientRect();
    props.onChange(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };
  // Le viewBox colle au rendu 1:1, sinon la longueur d'onde mesurée (36 css)
  // se déforme. La largeur vient de RAIL_LARGEUR, déduite du socle.
  const LARGEUR = RAIL_LARGEUR;
  const HAUTEUR = 56;
  const [remplie, pale] = useMemo(() => {
    const valeur = Math.max(0, Math.min(1, props.value));
    const amplitude = valeur * 14.25;
    const xPoignee = 4 + valeur * (LARGEUR - 8);
    const trace = (depuis: number, jusqu: number): string => {
      if (jusqu - depuis < 2) return "";
      const points: string[] = [];
      for (let x = depuis; x <= jusqu; x += 2) {
        const y = HAUTEUR / 2 - Math.sin((x / 36) * Math.PI * 2) * amplitude;
        points.push(`${x === depuis ? "M" : "L"}${x} ${y.toFixed(1)}`);
      }
      return points.join(" ");
    };
    return [trace(4, xPoignee), trace(xPoignee, LARGEUR - 4)];
  }, [props.value]);
  return (
    <div
      ref={railRef}
      role="slider"
      aria-label="Intensité des couleurs"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.value * 100)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") props.onChange(Math.max(0, props.value - 0.05));
        if (event.key === "ArrowRight") props.onChange(Math.min(1, props.value + 0.05));
      }}
      onPointerDown={(event) => {
        draggingRef.current = true;
        valueFromPointer(event.clientX);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Sans capture, le drag vit tant que le pointeur reste au-dessus.
        }
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) valueFromPointer(event.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      className="relative h-[60px] flex-1 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* La piste : bande pâle que la vague déborde (mesure : 16 css). */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 right-0 left-0 h-4 -translate-y-1/2 rounded-full",
          props.dark ? "bg-white/12" : "bg-white/45",
        )}
      />
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="absolute inset-x-0 top-1/2 h-[56px] w-full -translate-y-1/2"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Après la poignée : MÊME amplitude, trait pâle. */}
        <path
          d={pale}
          fill="none"
          stroke={props.dark ? "rgb(255 255 255 / 0.26)" : "rgb(52 62 58 / 0.24)"}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d={remplie}
          fill="none"
          stroke={props.dark ? "rgb(255 255 255 / 0.72)" : "rgb(52 62 58 / 0.68)"}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        aria-hidden
        className="absolute top-1/2 h-[54px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10"
        style={{ left: `${props.value * 100}%` }}
      />
    </div>
  );
}

/**
 * La molette de grain d'Arc, mesurée : 20 CRANS de 18° (19 pointillés + la
 * pilule qui occupe le cran courant ; repos observés uniquement à 0° et 18°),
 * pilule TANGENTE à l'anneau, disque central de 40 css qui porte l'aperçu
 * GRAINÉ de la couleur dominante (vide + crayon à zéro).
 *
 * ROUE INFINIE : on tourne dans les deux sens sans butée ; passer le cran
 * max remet à zéro (mesuré en plein tour : grain plein → nul → plein,
 * t = 42 s et 44 s de la capture). C'est un geste ROTATIF, pas un drag
 * vertical.
 */
function GrainDial(props: {
  dark: boolean;
  couleur: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const CRANS = 20;
  const PAS = 360 / CRANS;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef<{ dernierAngle: number; accumule: number } | null>(null);
  const notch = Math.max(0, Math.min(CRANS - 1, Math.round(props.value * (CRANS - 1))));

  const angleDuPointeur = (clientX: number, clientY: number): number | null => {
    const root = rootRef.current;
    if (root === null) return null;
    const rect = root.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };
  const poserCran = (prochain: number) => {
    const borne = ((prochain % CRANS) + CRANS) % CRANS;
    props.onChange(borne / (CRANS - 1));
  };

  return (
    <div
      ref={rootRef}
      role="slider"
      // Le picto seul ne dit pas ce qu'il fait — le titre l'explique,
      // sans envelopper un contrôle À GLISSER dans un déclencheur
      // d'info-bulle (qui lui volerait ses évènements de pointeur).
      title={`Grain — ${notch === 0 ? "aucun" : `${notch} sur ${CRANS - 1}`}. Tourner la molette texture le fond ; le tour complet revient à zéro.`}
      aria-label="Grain de la texture — roue sans fin, le cran après le maximum revient à zéro"
      aria-valuemin={0}
      aria-valuemax={CRANS - 1}
      aria-valuenow={notch}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowLeft") poserCran(notch - 1);
        if (event.key === "ArrowUp" || event.key === "ArrowRight") poserCran(notch + 1);
      }}
      onWheel={(event) => {
        poserCran(notch + (event.deltaY > 0 ? -1 : 1));
      }}
      onPointerDown={(event) => {
        const angle = angleDuPointeur(event.clientX, event.clientY);
        if (angle === null) return;
        rotationRef.current = { dernierAngle: angle, accumule: 0 };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Sans capture, la rotation vit tant que le pointeur survole.
        }
      }}
      onPointerMove={(event) => {
        const rotation = rotationRef.current;
        if (rotation === null) return;
        const angle = angleDuPointeur(event.clientX, event.clientY);
        if (angle === null) return;
        let delta = angle - rotation.dernierAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        rotation.dernierAngle = angle;
        rotation.accumule += delta;
        const crans = Math.trunc(rotation.accumule / PAS);
        if (crans !== 0) {
          rotation.accumule -= crans * PAS;
          poserCran(notch + crans);
        }
      }}
      className="relative size-[72px] shrink-0 cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      {/* Les 20 crans : allumés jusqu'au cran courant, la pilule POSÉE
                sur le cran courant, tangente à l'anneau. */}
      {Array.from({ length: CRANS }, (_, index) => {
        if (index === notch) return null;
        const allume = index < notch;
        return (
          <span
            key={index}
            aria-hidden
            className={cn(
              "absolute top-1/2 left-1/2 size-[6px] rounded-full transition-colors",
              allume
                ? props.dark
                  ? "bg-white/85"
                  : "bg-black/55"
                : props.dark
                  ? "bg-white/30"
                  : "bg-black/20",
            )}
            style={{
              transform: `translate(-50%, -50%) rotate(${index * PAS - 90}deg) translateX(30px)`,
            }}
          />
        );
      })}
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 h-[16px] w-[10px] rounded-full bg-white shadow-sm ring-1 ring-black/10"
        style={{
          transform: `translate(-50%, -50%) rotate(${notch * PAS - 90}deg) translateX(30px) rotate(90deg)`,
        }}
      />
      {/* Le disque central montre TOUJOURS la couleur dominante — elle suit
          les ronds en direct pendant qu'on les déplace — et le grain par
          DESSUS, dosé par le cran. Avant, à zéro il n'y avait qu'un crayon :
          on ne voyait ni la couleur, ni ce que la molette ajoutait (reproche
          fondateur du 31/07). À zéro le disque est donc lisse ; chaque cran
          ajoute sa dose, visiblement. */}
      <span
        aria-hidden
        className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-black/15 transition-colors"
        style={{ backgroundColor: props.couleur }}
      >
        <span
          className="absolute inset-0 mix-blend-overlay"
          style={{
            backgroundImage: `url("${SIDEBAR_THEME_GRAIN_URL}")`,
            // MÊME COURBE que le voile de la sidebar (puissance 0,75), mais
            // déployée jusqu'à 1 : sur 40 css, la course du voile (plafond
            // 0,42) ne se lirait pas. Sans plafonnement — une première
            // version amplifiée saturait dès le cran 9, et les six derniers
            // crans se ressemblaient tous (vérifié au rendu).
            opacity: props.value ** 0.75,
          }}
        />
      </span>
    </div>
  );
}
