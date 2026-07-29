import { useCallback, useMemo, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, MoonIcon, PlusIcon, SparklesIcon, SunIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  makeSidebarThemeFromColors,
  useSidebarThemeStore,
  type SidebarTheme,
  type SidebarThemeStop,
} from "../../sidebarThemeStore";

/**
 * L'éditeur de thème d'Arc, reconstruit sur les ~24 captures fondateur
 * (3e passe — la bonne). Ce que les captures enseignent :
 *
 * LA TOILE EST UNE PALETTE INVISIBLE. Déplacer le GROS rond ne déplace pas
 * qu'un point : ça MODULE sa couleur — horizontalement la teinte dérive,
 * verticalement elle s'éclaircit jusqu'au délavé ou fonce. Et les deux
 * satellites ne portent jamais la même couleur : ils sont recalculés en
 * HARMONIE (teintes voisines ±40°) à chaque geste. Un seul geste = position,
 * nuance et accords.
 *
 * TROIS RONDS MAXIMUM. La première page du nuancier = couleurs UNIES : un
 * clic pose UNE dominante (les satellites existants se réaccordent) ; « + »
 * ajoute un satellite harmonique, jusqu'à trois. La flèche → page des
 * GRADIENTS : un clic pose les trois ronds d'un coup.
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

/** Page 2 — gradients : un rond pose les TROIS couleurs préréglées. */
const GRADIENT_SWATCHES: ReadonlyArray<readonly [string, string, string]> = [
  ["#fbd87f", "#f2977a", "#f2a3c0"],
  ["#4caf7d", "#fbd87f", "#e4572e"],
  ["#4a7fd4", "#4caf7d", "#a8e6a3"],
  ["#5db3f0", "#2e9e6b", "#4fd1c5"],
  ["#8e5bd4", "#f2a3c0", "#5db3f0"],
  ["#f2a3c0", "#9b6fc3", "#5b8def"],
  ["#f28c28", "#e4572e", "#c2185b"],
  ["#2b2f55", "#4a3f78", "#7a5299"],
  ["#8d5a3b", "#c98d5f", "#f2dcc0"],
];

/** Les tailles d'Arc : la dominante pèse, les satellites suivent. */
const STOP_SIZES_PX = [44, 26, 22] as const;

const APPEARANCE_CHOICES = [
  { value: "auto", icon: SparklesIcon, label: "Suivre le système" },
  { value: "light", icon: SunIcon, label: "Toujours clair" },
  { value: "dark", icon: MoonIcon, label: "Toujours sombre" },
] as const;

// ---------------------------------------------------------------- couleur
// La palette invisible parle en HSL ; le store parle en hex. Conversions
// locales, en flottant pendant le drag pour ne jamais accumuler d'arrondis.

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

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

/** Les accords d'Arc : des voisines (±40°), jamais la même teinte. */
function harmonize(dominantHex: string, count: number): string[] {
  const { h, s, l } = hexToHsl(dominantHex);
  const satellites = [
    hslToHex(h - 40, Math.min(100, s + 4), Math.min(88, l + 7)),
    hslToHex(h + 40, Math.min(100, s + 4), Math.max(20, l - 6)),
  ];
  return satellites.slice(0, Math.max(0, count));
}

export function SpaceThemePanel() {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const setSpaceTheme = useSidebarSpacesStore((state) => state.setSpaceTheme);
  const defaultTheme = useSidebarThemeStore((state) => state.theme);
  const setDefaultTheme = useSidebarThemeStore((state) => state.setTheme);

  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null;
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
  const dragRef = useRef<{
    lastX: number;
    lastY: number;
    color: { h: number; s: number; l: number };
  } | null>(null);

  const dominant = current.stops[0] ?? { color: "#f2a3c0", x: 0.5, y: 0.42 };

  /** Positions du groupe : dominante au point, satellites déployés selon la
   * distance au centre (repliés au centre = une seule couleur au voile). */
  const groupStops = useCallback(
    (x: number, y: number, colors: ReadonlyArray<string>): SidebarThemeStop[] => {
      const distance = Math.hypot(x - 0.5, y - 0.5);
      const spread = 0.03 + distance * 0.42;
      const clamp = (value: number) => Math.max(0.05, Math.min(0.95, value));
      return colors.map((color, index) => {
        if (index === 0) return { color, x: clamp(x), y: clamp(y) };
        const side = index === 1 ? -1 : 1;
        return { color, x: clamp(x + side * spread), y: clamp(y - spread * 0.5) };
      });
    },
    [],
  );

  const moveGroup = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const drag = dragRef.current;
      if (canvas === null || drag === null) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      // LA PALETTE INVISIBLE : le déplacement MODULE la couleur — la teinte
      // dérive horizontalement, la lumière suit la verticale (monter =
      // éclaircir jusqu'au délavé, descendre = foncer). En delta, pas en
      // absolu : le jaune reste de la famille du jaune tant qu'on ne
      // traverse pas la toile entière.
      drag.color.h += (x - drag.lastX) * 160;
      drag.color.l = Math.max(16, Math.min(90, drag.color.l - (y - drag.lastY) * 110));
      drag.lastX = x;
      drag.lastY = y;
      const dominantHex = hslToHex(drag.color.h, drag.color.s, drag.color.l);
      const colors = [dominantHex, ...harmonize(dominantHex, current.stops.length - 1)];
      apply({ ...current, stops: groupStops(x, y, colors) });
    },
    [apply, current, groupStops],
  );

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const rect = canvas.getBoundingClientRect();
      dragRef.current = {
        lastX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        lastY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
        color: hexToHsl(dominant.color),
      };
    },
    [dominant.color],
  );

  const applySolid = useCallback(
    (color: string) => {
      // Un rond uni = LA dominante change ; les satellites présents se
      // réaccordent autour d'elle, la composition reste.
      const colors = [color, ...harmonize(color, current.stops.length - 1)];
      apply({ ...current, stops: groupStops(dominant.x, dominant.y, colors) });
    },
    [apply, current, dominant.x, dominant.y, groupStops],
  );

  const applyGradient = useCallback(
    (trio: readonly [string, string, string]) => {
      // Un gradient = les trois ronds d'un coup, préréglés.
      apply({ ...current, stops: groupStops(dominant.x, dominant.y, trio) });
    },
    [apply, current, dominant.x, dominant.y, groupStops],
  );

  const addStop = useCallback(() => {
    if (current.stops.length >= MAX_ARC_STOPS) return;
    const colors = [
      dominant.color,
      ...harmonize(dominant.color, current.stops.length),
    ];
    apply({ ...current, stops: groupStops(dominant.x, dominant.y, colors) });
  }, [apply, current, dominant.color, dominant.x, dominant.y, groupStops]);
  const removeStop = useCallback(() => {
    if (current.stops.length <= 1) return;
    apply({
      ...current,
      stops: groupStops(
        dominant.x,
        dominant.y,
        current.stops.slice(0, -1).map((stop) => stop.color),
      ),
    });
  }, [apply, current, dominant.x, dominant.y, groupStops]);

  const isDarkCanvas =
    current.appearance === "dark" ||
    (current.appearance === "auto" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const mutedControl = isDarkCanvas
    ? "text-white/50 hover:text-white/80"
    : "text-neutral-400 hover:text-neutral-600";

  return (
    // Le PANNEAU ENTIER suit le mode édité (☀️ = crème translucide, 🌙 =
    // nuit translucide) — nuancier, vague et molette compris, comme sur les
    // captures : Arc n'a jamais un bas sombre sous une toile claire.
    <div
      className={cn(
        "flex w-[340px] flex-col rounded-lg backdrop-blur-xl transition-colors",
        isDarkCanvas ? "bg-neutral-900/78" : "bg-[#f6efe6]/85",
      )}
    >
      {/* La toile-palette : tout le haut du panneau, pointillée, sans
          sous-carte encadrée. */}
      <div
        ref={canvasRef}
        className={cn(
          "relative h-[360px] touch-none rounded-t-lg bg-[radial-gradient(circle,var(--dot)_1px,transparent_1px)] bg-[size:9px_9px]",
          isDarkCanvas
            ? "[--dot:color-mix(in_oklab,white_15%,transparent)]"
            : "[--dot:color-mix(in_oklab,black_13%,transparent)]",
        )}
        onPointerMove={(event) => {
          if (dragRef.current !== null) moveGroup(event.clientX, event.clientY);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        <div className="absolute inset-x-0 top-3 flex items-center justify-center gap-2">
          {APPEARANCE_CHOICES.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => apply({ ...current, appearance: value })}
              className={cn(
                "flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors",
                current.appearance === value
                  ? isDarkCanvas
                    ? "bg-white/15 text-white"
                    : "bg-black/10 text-neutral-700"
                  : mutedControl,
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        {current.stops.slice(1).map((stop, index) => {
          const size = STOP_SIZES_PX[index + 1] ?? 20;
          return (
            <span
              key={index}
              aria-hidden
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ring-2 ring-white transition-[left,top,background-color] duration-75"
              style={{
                left: `${stop.x * 100}%`,
                top: `${stop.y * 100}%`,
                width: size,
                height: size,
                backgroundColor: stop.color,
              }}
            />
          );
        })}
        <button
          type="button"
          aria-label="Mélanger — la position module la couleur, les satellites s'accordent"
          onPointerDown={(event) => {
            event.preventDefault();
            beginDrag(event.clientX, event.clientY);
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Sans capture, le drag vit tant que le pointeur survole.
            }
          }}
          onPointerMove={(event) => {
            if (dragRef.current !== null) moveGroup(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full shadow-md ring-[3px] ring-white transition-[background-color] duration-75 active:cursor-grabbing"
          style={{
            left: `${dominant.x * 100}%`,
            top: `${dominant.y * 100}%`,
            width: STOP_SIZES_PX[0],
            height: STOP_SIZES_PX[0],
            backgroundColor: dominant.color,
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

      {/* Le nuancier : page 1 des UNIS (un rond = la dominante), flèche →
          page des GRADIENTS (un rond = les trois d'un coup). */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <button
          type="button"
          aria-label="Couleurs unies"
          disabled={swatchPage === 0}
          onClick={() => setSwatchPage(0)}
          className={cn("flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30", mutedControl)}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div className="flex flex-1 items-center justify-between">
          {swatchPage === 0
            ? SOLID_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Couleur ${color}`}
                  onClick={() => applySolid(color)}
                  className="size-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: isDarkCanvas
                      ? `color-mix(in oklab, ${color} 72%, black)`
                      : color,
                  }}
                />
              ))
            : GRADIENT_SWATCHES.map((trio) => (
                <button
                  key={trio.join("-")}
                  type="button"
                  aria-label={`Gradient ${trio.join(", ")}`}
                  onClick={() => applyGradient(trio)}
                  className="size-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${trio[0]} 0%, ${trio[1]} 50%, ${trio[2]} 100%)`,
                    ...(isDarkCanvas ? { filter: "brightness(0.78)" } : {}),
                  }}
                />
              ))}
        </div>
        <button
          type="button"
          aria-label="Gradients préréglés"
          disabled={swatchPage === 1}
          onClick={() => setSwatchPage(1)}
          className={cn("flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30", mutedControl)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* La vague d'intensité + la molette de grain. */}
      <div className="flex items-center gap-4 px-4 pt-1 pb-3.5">
        <IntensityWave
          dark={isDarkCanvas}
          value={current.intensity}
          onChange={(intensity) => apply({ ...current, intensity })}
        />
        <GrainDial dark={isDarkCanvas} value={current.grain} onChange={(grain) => apply({ ...current, grain })} />
      </div>
    </div>
  );
}

/**
 * Le slider d'Arc : la sinusoïde n'est pas un rail décoratif — SON AMPLITUDE
 * EST LA VALEUR. Presque plate quand la couleur est délavée, pleine quand
 * elle assume. La pilule reste la poignée de position.
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
  const wavePath = useMemo(() => {
    const amplitude = 0.8 + Math.max(0, Math.min(1, props.value)) * 7.2;
    const points: string[] = [];
    for (let x = 0; x <= 160; x += 2) {
      const y = 14 - Math.sin((x / 22) * Math.PI * 2) * amplitude;
      points.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
    }
    return points.join(" ");
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
      className="relative h-10 flex-1 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <svg viewBox="0 0 160 28" className="absolute inset-y-1 w-full" preserveAspectRatio="none">
        <path
          d={wavePath}
          fill="none"
          stroke={props.dark ? "rgb(255 255 255 / 0.45)" : "rgb(60 60 65 / 0.5)"}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        aria-hidden
        className="absolute top-1/2 h-10 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10"
        style={{ left: `${props.value * 100}%` }}
      />
    </div>
  );
}

/** La molette de grain : cadran pointillé, index qui tourne, disque central
 * révélé au survol. Drag vertical (+ flèches clavier). */
function GrainDial(props: { dark: boolean; value: number; onChange: (value: number) => void }) {
  const draggingRef = useRef<{ startY: number; startValue: number } | null>(null);
  const DOTS = 12;
  const angle = -135 + props.value * 270;
  return (
    <div
      role="slider"
      aria-label="Grain de la texture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.value * 100)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") props.onChange(Math.max(0, props.value - 0.05));
        if (event.key === "ArrowUp") props.onChange(Math.min(1, props.value + 0.05));
      }}
      onPointerDown={(event) => {
        draggingRef.current = { startY: event.clientY, startValue: props.value };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Sans capture, le drag vit tant que le pointeur reste au-dessus.
        }
      }}
      onPointerMove={(event) => {
        const drag = draggingRef.current;
        if (drag === null) return;
        const delta = (drag.startY - event.clientY) / 90;
        props.onChange(Math.max(0, Math.min(1, drag.startValue + delta)));
      }}
      onPointerUp={() => {
        draggingRef.current = null;
      }}
      className="group relative size-12 shrink-0 cursor-ns-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className={cn("absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100", props.dark ? "bg-white/15" : "bg-black/10")}
      />
      {Array.from({ length: DOTS }, (_, index) => {
        const dotAngle = (index / DOTS) * 360;
        return (
          <span
            key={index}
            aria-hidden
            className={cn("absolute left-1/2 top-1/2 size-[3px] rounded-full", props.dark ? "bg-white/40" : "bg-black/30")}
            style={{
              transform: `translate(-50%, -50%) rotate(${dotAngle}deg) translateY(-21px)`,
            }}
          />
        );
      })}
      <span
        aria-hidden
        className={cn("absolute left-1/2 top-1/2 h-3 w-[3px] -translate-x-1/2 rounded-full", props.dark ? "bg-white/80" : "bg-black/60")}
        style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-13px)` }}
      />
    </div>
  );
}
