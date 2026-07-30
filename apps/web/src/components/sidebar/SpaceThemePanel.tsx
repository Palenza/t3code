import { useCallback, useMemo, useRef, useState } from "react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  makeSidebarThemeFromColors,
  SIDEBAR_THEME_GRAIN_URL,
  useSidebarThemeStore,
  type SidebarTheme,
  type SidebarThemeStop,
} from "../../sidebarThemeStore";

/**
 * L'éditeur de thème d'Arc — recalé sur la MÉTROLOGIE du 30/07 soir :
 * 4 965 frames réelles à 120 Hz, résolution native, mesurées par programme
 * (scripts mesure_frames/mesure2/synthese, session du 30/07).
 *
 * Ce que la mesure a tranché contre l'implémentation précédente :
 *
 * LE TRIO EST UN ASSEMBLAGE RIGIDE PENDANT LE GLISSÉ. Ratio de déplacement
 * satellite/dominante : médiane 0,98 (p10 0,80 · p90 1,12) sur 244 mesures.
 * Le retard élastique d'avant (transition left/top 75 ms) était une faute —
 * en glissé, AUCUNE transition ; les transitions ne servent que les sauts
 * discrets (clic nuancier, promotion).
 *
 * RAYON COMMUN, ANGLES PROPRES. Les trois ronds vivent à la même distance
 * du centre de la toile (rayons mesurés 107/108/115 puis 163/164/174 selon
 * l'instant), mais leurs écarts angulaires VARIENT (61°, 92°, 149° observés) :
 * le ±42° forcé d'avant n'existe pas. Chaque rond garde SON angle ; bouger
 * la dominante fixe l'angle de celle-ci et le rayon de tous.
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
 * Deux apparences, plus trois : ordre fondateur du 30/07 — « le mode clair,
 * on va l'enlever, on garde le dark et l'automatique ».
 */
const APPEARANCE_CHOICES = [
  { value: "auto", label: "Suivre le système" },
  { value: "dark", label: "Toujours sombre" },
] as const;

// ---------------------------------------------------------------- couleur
// LA ROUE INVISIBLE (10 761 frames, vidéo précédente) : teinte = angle
// autour du centre (hue ≈ angle − 5°), pleine au centre, pâle au bord.

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - chroma / 2;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

/** La couleur de la roue à une position de toile. */
function wheelColorAt(x: number, y: number): string {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const hue = (Math.atan2(dy, dx) * 180) / Math.PI - 5;
  const dist = Math.hypot(dx, dy);
  const light = Math.min(86, 42 + dist * 75);
  const sat = Math.max(55, 95 - dist * 55);
  return hslToHex(hue, sat, light);
}

/** L'inverse : où poser un rond pour obtenir (au plus près) cette couleur. */
function wheelPositionOf(hex: string): { x: number; y: number } {
  const { h, l } = hexToHsl(hex);
  const angle = ((h + 5) * Math.PI) / 180;
  const distFromLight = (Math.min(86, Math.max(42, l)) - 42) / 75;
  const dist = Math.min(0.44, Math.max(0.06, distFromLight));
  return {
    x: 0.5 + Math.cos(angle) * dist,
    y: 0.5 + Math.sin(angle) * dist,
  };
}

const clampToile = (value: number) => Math.max(0.04, Math.min(0.96, value));

/** L'angle d'un arrêt autour du centre de la toile, en radians. */
const angleDe = (stop: { x: number; y: number }) => Math.atan2(stop.y - 0.5, stop.x - 0.5);

/**
 * Replace le trio pour une dominante posée en (x, y) : le trio TOURNE ET
 * RESPIRE EN BLOC autour du centre de la toile. Chaque satellite garde son
 * ÉCART D'ANGLE relatif à la dominante (écarts variés mesurés : 61°, 92°,
 * 149° selon l'arrangement) ; tous partagent le rayon du pointeur. C'est la
 * seule loi compatible avec les DEUX mesures : équidistances au centre
 * conservées, et ratio de déplacement satellite/dominante ≈ 1 pendant le
 * glissé. Un satellite manquant naît à ±140° (écartements larges observés).
 */
function replacerTrio(
  stops: ReadonlyArray<SidebarThemeStop>,
  x: number,
  y: number,
  count: number,
): SidebarThemeStop[] {
  const rayon = Math.min(0.46, Math.hypot(x - 0.5, y - 0.5));
  const angleDominante = Math.atan2(y - 0.5, x - 0.5);
  const ancienne = stops[0];
  const angleAncien = ancienne === undefined ? angleDominante : angleDe(ancienne);
  return Array.from({ length: count }, (_, index) => {
    const existant = stops[index];
    const ecart =
      index === 0
        ? 0
        : existant !== undefined
          ? angleDe(existant) - angleAncien
          : ((index === 1 ? 140 : -140) * Math.PI) / 180;
    const angle = angleDominante + ecart;
    const px = index === 0 ? clampToile(x) : clampToile(0.5 + Math.cos(angle) * rayon);
    const py = index === 0 ? clampToile(y) : clampToile(0.5 + Math.sin(angle) * rayon);
    return { color: wheelColorAt(px, py), x: px, y: py };
  });
}

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

  const activeSpace = spaces.find((space) => space.id === cibleId) ?? null;
  const current: SidebarTheme =
    (activeSpace ? activeSpace.theme : defaultTheme) ?? makeSidebarThemeFromColors(["#f2a3c0"]);
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
      apply({ ...current, stops: replacerTrio(current.stops, x, y, current.stops.length) });
    },
    [apply, current],
  );

  const finDeGlisse = useCallback(() => {
    draggingRef.current = false;
    setEnGlisse(false);
  }, []);

  const applySolid = useCallback(
    (color: string) => {
      const position = wheelPositionOf(color);
      apply({
        ...current,
        stops: replacerTrio(current.stops, position.x, position.y, current.stops.length),
      });
    },
    [apply, current],
  );

  const applyGradient = useCallback(
    (trio: readonly [string, string, string]) => {
      // Le gradient pose TROIS ronds d'un coup, ancrés sur le premier ton.
      const position = wheelPositionOf(trio[0]);
      apply({ ...current, stops: replacerTrio([], position.x, position.y, 3) });
    },
    [apply, current],
  );

  const addStop = useCallback(() => {
    if (current.stops.length >= MAX_ARC_STOPS) return;
    apply({
      ...current,
      stops: replacerTrio(current.stops, dominant.x, dominant.y, current.stops.length + 1),
    });
  }, [apply, current, dominant.x, dominant.y]);
  const removeStop = useCallback(() => {
    if (current.stops.length <= 1) return;
    apply({
      ...current,
      stops: replacerTrio(current.stops, dominant.x, dominant.y, current.stops.length - 1),
    });
  }, [apply, current, dominant.x, dominant.y]);

  const isDarkCanvas =
    current.appearance === "dark" ||
    (current.appearance === "auto" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const mutedControl = isDarkCanvas
    ? "text-white/50 hover:text-white/80"
    : "text-neutral-400 hover:text-neutral-600";

  // Glissé : rigide. Saut discret : glissade. (Mesure : ratio 0,98 en drag.)
  const transitionRonds = enGlisse
    ? "none"
    : "left 200ms cubic-bezier(0.22,1,0.36,1), top 200ms cubic-bezier(0.22,1,0.36,1), background-color 120ms";

  return (
    // 358 × 510 css MESURÉS (bords à ±1 px sur frame claire et sombre),
    // coins larges. Verre mince : la toile laisse passer, le socle est laiteux.
    <div
      className={cn(
        "flex w-[358px] flex-col overflow-hidden rounded-2xl backdrop-blur-2xl backdrop-saturate-150 transition-colors",
        isDarkCanvas ? "bg-neutral-900/28" : "bg-white/28",
      )}
    >
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
        <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-2">
          {APPEARANCE_CHOICES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => apply({ ...current, appearance: value })}
              className={cn(
                "t3-etoiles flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors",
                current.appearance === value
                  ? isDarkCanvas
                    ? "bg-white/15 text-white"
                    : "bg-black/10 text-neutral-700"
                  : mutedControl,
              )}
            >
              {value === "auto" ? <EtoilesScintillantes /> : <MoonIcon className="size-4" />}
            </button>
          ))}
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
                // échange de rôles, pas de rotation du trio.
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
          aria-label="Mélanger — la position module la couleur, les satellites gardent leur angle"
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
              "flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30",
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
              "flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30",
              mutedControl,
            )}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Le SOCLE laiteux : nuancier + vague + molette. */}
      <div className={cn("flex flex-col", isDarkCanvas ? "bg-neutral-900/45" : "bg-white/55")}>
        {/* Le nuancier GLISSE entre ses pages (mesure : ~300 ms par page). */}
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5">
          <button
            type="button"
            aria-label="Couleurs unies"
            disabled={swatchPage === 0}
            onClick={() => setSwatchPage(0)}
            className={cn(
              "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30",
              mutedControl,
            )}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <div className="relative flex-1 overflow-hidden">
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
                    className="size-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: isDarkCanvas
                        ? `color-mix(in oklab, ${color} 72%, black)`
                        : color,
                    }}
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
                      ...(isDarkCanvas ? { filter: "brightness(0.78)" } : {}),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Gradients préréglés"
            disabled={swatchPage === 1}
            onClick={() => setSwatchPage(1)}
            className={cn(
              "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30",
              mutedControl,
            )}
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>

        {/* La vague d'intensité + la molette de grain. */}
        <div className="flex items-center gap-3 px-4 pt-1.5 pb-4">
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
 * Les étoiles de l'apparence automatique — elles SCINTILLENT au survol
 * (mesure : bouffées de ~200 ms toutes les 0,5-1 s pendant 7,5 s de survol
 * observées sur la cellule de l'icône). Trois étoiles, délais décalés ;
 * l'animation vit dans index.css (`t3-etoile-scintille`).
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
  // Largeur de rail = 358 − px-4 (32) − gap-3 (12) − molette (72) : le
  // viewBox colle au rendu 1:1, la longueur d'onde reste 36 css, mesurée.
  const LARGEUR = 242;
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
      onPointerUp={() => {
        rotationRef.current = null;
      }}
      className="relative size-[72px] shrink-0 cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      {/* Les 20 crans : allumés jusqu'au cran courant, la pilule POSÉE sur
          le cran courant, tangente à l'anneau. */}
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
      {notch > 0 ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-black/15"
          style={{
            backgroundColor: `color-mix(in oklab, ${props.couleur} 52%, ${props.dark ? "#2a2e2c" : "#c9cdc9"})`,
          }}
        >
          {/* L'aperçu vivant : le grain lui-même, dosé par la valeur. */}
          <span
            className="absolute inset-0 mix-blend-overlay"
            style={{
              backgroundImage: `url("${SIDEBAR_THEME_GRAIN_URL}")`,
              opacity: 0.35 + 0.65 * props.value,
            }}
          />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
            props.dark ? "text-white/60" : "text-black/45",
          )}
        >
          <PencilIcon className="size-3.5" />
        </span>
      )}
    </div>
  );
}
