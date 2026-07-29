import { useCallback, useMemo, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, MoonIcon, PlusIcon, SparklesIcon, SunIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  DEFAULT_STOP_POSITIONS,
  MAX_SIDEBAR_THEME_STOPS,
  makeSidebarThemeFromColors,
  useSidebarThemeStore,
  type SidebarTheme,
  type SidebarThemeStop,
} from "../../sidebarThemeStore";

/**
 * L'éditeur de thème flottant, réplique du panneau d'Arc (captures fondateur
 * 29/07, décortiquées point par point) : toile pointillée qui suit le mode
 * (✨ auto / ☀️ clair / 🌙 sombre), pastilles DÉPLAÇABLES à tailles
 * décroissantes (la première domine le mélange), − / + pour en retirer ou
 * ajouter, une rangée de PALETTES paginée — chaque rond est un trio prêt à
 * poser, pas une couleur seule —, la VAGUE d'intensité, et la MOLETTE de
 * grain. Il édite l'espace ACTIF quand il y en a un, sinon le thème par
 * défaut de la sidebar.
 */

/** Chaque palette = un TRIO assorti ; cliquer la pose entière sur la toile. */
const SPACE_THEME_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  // Page 1 — les classiques d'Arc : pastels francs, un rond par famille.
  ["#f5ead9", "#e8d9c8", "#d8c5b2"],
  ["#f2a3c0", "#f7c59f", "#fbe3a3"],
  ["#9b6fc3", "#c39ad9", "#e2c8ef"],
  ["#e4572e", "#f28f6b", "#f9c5ad"],
  ["#f28c28", "#f7b32b", "#fbd87f"],
  ["#c6d92e", "#8fd14f", "#4caf7d"],
  ["#2e9e6b", "#5bc98c", "#a3e6c0"],
  ["#5db3f0", "#4fd1c5", "#8ee6d9"],
  ["#3f51b5", "#7986cb", "#b3bdea"],
  // Page 2 — les mélanges que le fondateur a cités, et des nuits.
  ["#fbd87f", "#f28c28", "#f2a3c0"],
  ["#4caf7d", "#fbd87f", "#e4572e"],
  ["#4a7fd4", "#4caf7d", "#a8e6a3"],
  ["#5db3f0", "#2e9e6b", "#4fd1c5"],
  ["#8e5bd4", "#f2a3c0", "#5db3f0"],
  ["#8d5a3b", "#c98d5f", "#f2dcc0"],
  ["#5a6b8c", "#8295b5", "#b8c4d9"],
  ["#2b2f55", "#4a3f78", "#7a5299"],
  ["#1c2530", "#54677a", "#d5dde5"],
];
const PALETTES_PER_PAGE = 9;

/** Les tailles d'Arc : la première pastille pèse visiblement plus lourd. */
const STOP_SIZES_PX = [44, 30, 24, 22, 20, 18] as const;

const APPEARANCE_CHOICES = [
  { value: "auto", icon: SparklesIcon, label: "Suivre le système" },
  { value: "light", icon: SunIcon, label: "Toujours clair" },
  { value: "dark", icon: MoonIcon, label: "Toujours sombre" },
] as const;

export function SpaceThemePanel() {
  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const setSpaceTheme = useSidebarSpacesStore((state) => state.setSpaceTheme);
  const defaultTheme = useSidebarThemeStore((state) => state.theme);
  const setDefaultTheme = useSidebarThemeStore((state) => state.setTheme);

  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null;
  const current: SidebarTheme =
    (activeSpace ? activeSpace.theme : defaultTheme) ??
    makeSidebarThemeFromColors([SPACE_THEME_PALETTES[1]![0], SPACE_THEME_PALETTES[1]![1]]);
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

  const [palettePage, setPalettePage] = useState(0);
  const pageCount = Math.ceil(SPACE_THEME_PALETTES.length / PALETTES_PER_PAGE);
  const visiblePalettes = useMemo(
    () =>
      SPACE_THEME_PALETTES.slice(
        palettePage * PALETTES_PER_PAGE,
        (palettePage + 1) * PALETTES_PER_PAGE,
      ),
    [palettePage],
  );

  // ------------------------------------------------------------- la toile
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const moveStopToPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const index = dragIndexRef.current;
      if (canvas === null || index === null) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const stops = current.stops.map((stop, i) => (i === index ? { ...stop, x, y } : stop));
      apply({ ...current, stops });
    },
    [apply, current],
  );

  const addStop = useCallback(() => {
    if (current.stops.length >= MAX_SIDEBAR_THEME_STOPS) return;
    const palette = SPACE_THEME_PALETTES[(current.stops.length * 5 + 3) % SPACE_THEME_PALETTES.length]!;
    const position = DEFAULT_STOP_POSITIONS[current.stops.length] ?? { x: 0.5, y: 0.5 };
    apply({ ...current, stops: [...current.stops, { color: palette[0], ...position }] });
  }, [apply, current]);
  const removeStop = useCallback(() => {
    if (current.stops.length <= 1) return;
    apply({ ...current, stops: current.stops.slice(0, -1) });
  }, [apply, current]);

  const applyPalette = useCallback(
    (palette: readonly [string, string, string]) => {
      // Le trio remplace les couleurs mais respecte les POSITIONS déjà
      // arrangées — changer d'ambiance ne défait pas la composition.
      const positions: ReadonlyArray<{ x: number; y: number }> =
        current.stops.length >= 3
          ? current.stops
          : DEFAULT_STOP_POSITIONS.slice(0, 3).map((position) => position);
      const stops: SidebarThemeStop[] = palette.map((color, index) => ({
        color,
        x: positions[index]?.x ?? 0.5,
        y: positions[index]?.y ?? 0.5,
      }));
      apply({ ...current, stops });
    },
    [apply, current],
  );

  const isDarkCanvas =
    current.appearance === "dark" ||
    (current.appearance === "auto" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="flex w-72 flex-col">
      {/* La toile pointillée — claire ou sombre selon le mode choisi. */}
      <div
        ref={canvasRef}
        className={cn(
          "relative m-2 h-64 touch-none rounded-xl bg-[radial-gradient(circle,var(--dot)_1px,transparent_1px)] bg-[size:8px_8px] transition-colors",
          isDarkCanvas
            ? "bg-neutral-800 [--dot:color-mix(in_oklab,white_14%,transparent)]"
            : "bg-neutral-100 [--dot:color-mix(in_oklab,black_12%,transparent)]",
        )}
        onPointerMove={(event) => {
          if (dragIndexRef.current !== null) {
            moveStopToPointer(event.clientX, event.clientY);
          }
        }}
        onPointerUp={() => {
          dragIndexRef.current = null;
        }}
      >
        <div className="absolute inset-x-0 top-2 flex items-center justify-center gap-1">
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
                    : "bg-black/10 text-neutral-800"
                  : isDarkCanvas
                    ? "text-white/50 hover:text-white/80"
                    : "text-neutral-400 hover:text-neutral-600",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        {current.stops.map((stop, index) => {
          const size = STOP_SIZES_PX[index] ?? 18;
          return (
            <button
              key={index}
              type="button"
              aria-label={`Pastille ${index + 1} — glisser pour déplacer`}
              onPointerDown={(event) => {
                event.preventDefault();
                dragIndexRef.current = index;
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // Sans capture, le drag vit tant que le pointeur survole.
                }
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full shadow-md ring-[3px] ring-white transition-[width,height] active:cursor-grabbing"
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
        <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Retirer une pastille"
            disabled={current.stops.length <= 1}
            onClick={removeStop}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30",
              isDarkCanvas
                ? "text-white/50 hover:text-white/80"
                : "text-neutral-400 hover:text-neutral-600",
            )}
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Ajouter une pastille"
            disabled={current.stops.length >= MAX_SIDEBAR_THEME_STOPS}
            onClick={addStop}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-30",
              isDarkCanvas
                ? "text-white/50 hover:text-white/80"
                : "text-neutral-400 hover:text-neutral-600",
            )}
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Les palettes : un rond = un trio, posé entier d'un clic. */}
      <div className="flex items-center gap-1 px-3 pb-1">
        <button
          type="button"
          aria-label="Palettes précédentes"
          disabled={palettePage === 0}
          onClick={() => setPalettePage((page) => Math.max(0, page - 1))}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-30"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div className="flex flex-1 items-center justify-between">
          {visiblePalettes.map((palette) => (
            <button
              key={palette.join("-")}
              type="button"
              aria-label={`Palette ${palette.join(", ")}`}
              onClick={() => applyPalette(palette)}
              className="size-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
              style={{
                background: `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 50%, ${palette[2]} 100%)`,
              }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Palettes suivantes"
          disabled={palettePage >= pageCount - 1}
          onClick={() => setPalettePage((page) => Math.min(pageCount - 1, page + 1))}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-30"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* La vague d'intensité + la molette de grain, comme Arc. */}
      <div className="flex items-center gap-4 px-4 pt-1 pb-3">
        <IntensityWave
          value={current.intensity}
          onChange={(intensity) => apply({ ...current, intensity })}
        />
        <GrainDial value={current.grain} onChange={(grain) => apply({ ...current, grain })} />
      </div>
    </div>
  );
}

/**
 * Le slider d'Arc : une sinusoïde comme rail, une pilule comme poignée. La
 * position de la pilule LE LONG de la vague est la valeur — la vague, elle,
 * dit ce que le réglage fait (de l'ondulation dans la couleur).
 */
function IntensityWave(props: { value: number; onChange: (value: number) => void }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const valueFromPointer = (clientX: number) => {
    const rail = railRef.current;
    if (rail === null) return;
    const rect = rail.getBoundingClientRect();
    props.onChange(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };
  const wavePath = useMemo(() => {
    // Amplitude 7 px, période 22 px sur 160 px de large, centrée sur y=14.
    const points: string[] = [];
    for (let x = 0; x <= 160; x += 2) {
      const y = 14 - Math.sin((x / 22) * Math.PI * 2) * 7;
      points.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
    }
    return points.join(" ");
  }, []);
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
        // Capture APRÈS le seek, et sans jamais l'exiger : un pointeur déjà
        // levé (ou synthétique) fait échouer la capture, pas le réglage.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Le drag continuera tant que le pointeur reste au-dessus.
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
          stroke="color-mix(in oklab, var(--color-muted-foreground) 55%, transparent)"
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

/**
 * La molette de grain : un cadran de points, un index qui tourne. Glisser
 * verticalement (ou molette) ajuste — le geste circulaire exact d'Arc
 * demanderait plus qu'il ne rend.
 */
function GrainDial(props: { value: number; onChange: (value: number) => void }) {
  const draggingRef = useRef<{ startY: number; startValue: number } | null>(null);
  const DOTS = 12;
  // L'index balaie de -135° (valeur 0) à +135° (valeur 1).
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
      className="relative size-12 shrink-0 cursor-ns-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {Array.from({ length: DOTS }, (_, index) => {
        const dotAngle = (index / DOTS) * 360;
        return (
          <span
            key={index}
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[3px] rounded-full bg-muted-foreground/40"
            style={{
              transform: `translate(-50%, -50%) rotate(${dotAngle}deg) translateY(-21px)`,
            }}
          />
        );
      })}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 h-3 w-[3px] -translate-x-1/2 rounded-full bg-muted-foreground"
        style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-13px)` }}
      />
    </div>
  );
}
