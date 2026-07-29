import { useCallback, useMemo, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, MoonIcon, PlusIcon, SparklesIcon, SunIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
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
  const draggingGroupRef = useRef(false);

  // LE geste d'Arc (corrigé sur les ~20 captures fondateur, 2e passe) : les
  // couleurs ne se déplacent pas une à une — c'est UN GROUPE. On saisit le
  // GROS rond (la dominante), les satellites suivent en formation, et leur
  // ÉCARTEMENT dépend de la position : au centre de la toile ils se replient
  // sous la dominante (une seule couleur au voile), en s'éloignant ils se
  // déploient et le mélange s'ouvre. Un seul geste = position ET dosage.
  const groupStopsAround = useCallback(
    (x: number, y: number, colors: ReadonlyArray<string>): SidebarThemeStop[] => {
      const distanceFromCenter = Math.hypot(x - 0.5, y - 0.5);
      const spread = 0.02 + distanceFromCenter * 0.5;
      const lift = spread * 0.45;
      const clamp = (value: number) => Math.max(0.04, Math.min(0.96, value));
      return colors.map((color, index) => {
        if (index === 0) return { color, x: clamp(x), y: clamp(y) };
        const side = index === 1 ? -1 : 1;
        return { color, x: clamp(x + side * spread), y: clamp(y - lift) };
      });
    },
    [],
  );

  const moveGroupToPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (canvas === null || !draggingGroupRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      apply({
        ...current,
        stops: groupStopsAround(
          x,
          y,
          current.stops.map((stop) => stop.color),
        ),
      });
    },
    [apply, current, groupStopsAround],
  );

  const dominant = current.stops[0] ?? { color: "#5db3f0", x: 0.5, y: 0.45 };

  const addStop = useCallback(() => {
    if (current.stops.length >= MAX_SIDEBAR_THEME_STOPS) return;
    const palette = SPACE_THEME_PALETTES[(current.stops.length * 5 + 3) % SPACE_THEME_PALETTES.length]!;
    apply({
      ...current,
      stops: groupStopsAround(dominant.x, dominant.y, [
        ...current.stops.map((stop) => stop.color),
        palette[0],
      ]),
    });
  }, [apply, current, dominant.x, dominant.y, groupStopsAround]);
  const removeStop = useCallback(() => {
    if (current.stops.length <= 1) return;
    apply({
      ...current,
      stops: groupStopsAround(
        dominant.x,
        dominant.y,
        current.stops.slice(0, -1).map((stop) => stop.color),
      ),
    });
  }, [apply, current, dominant.x, dominant.y, groupStopsAround]);

  const applyPalette = useCallback(
    (color: string) => {
      // « Ça tourne » (verbatim fondateur) : la couleur cliquée devient la
      // DOMINANTE, les autres reculent d'un rang vers les satellites. Trois
      // clics successifs composent donc le trio entier, sans rien défaire.
      const rotated = [color, ...current.stops.map((stop) => stop.color)].slice(
        0,
        Math.max(3, Math.min(current.stops.length, MAX_SIDEBAR_THEME_STOPS)),
      );
      apply({ ...current, stops: groupStopsAround(dominant.x, dominant.y, rotated) });
    },
    [apply, current, dominant.x, dominant.y, groupStopsAround],
  );

  const isDarkCanvas =
    current.appearance === "dark" ||
    (current.appearance === "auto" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="flex w-72 flex-col">
      {/* La toile pointillée, en liquid glass : translucide, elle laisse le
          voile transparaître (« la carte a un peu liquid glass ») — jamais
          un blanc opaque qui éblouit. */}
      <div
        ref={canvasRef}
        className={cn(
          "relative m-2 h-64 touch-none rounded-xl bg-[radial-gradient(circle,var(--dot)_1px,transparent_1px)] bg-[size:8px_8px] transition-colors",
          isDarkCanvas
            ? "bg-neutral-900/45 [--dot:color-mix(in_oklab,white_16%,transparent)]"
            : "bg-white/45 [--dot:color-mix(in_oklab,black_14%,transparent)]",
        )}
        onPointerMove={(event) => {
          if (draggingGroupRef.current) {
            moveGroupToPointer(event.clientX, event.clientY);
          }
        }}
        onPointerUp={() => {
          draggingGroupRef.current = false;
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
        {/* Les satellites suivent, ils ne se saisissent pas : un seul geste
            pilote tout le groupe. Rendus AVANT la dominante pour glisser
            dessous quand le groupe se replie au centre. */}
        {current.stops.slice(1).map((stop, index) => {
          const size = STOP_SIZES_PX[index + 1] ?? 18;
          return (
            <span
              key={index}
              aria-hidden
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ring-2 ring-white transition-[left,top,width,height] duration-75"
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
          aria-label="Déplacer le mélange — les satellites suivent"
          onPointerDown={(event) => {
            event.preventDefault();
            draggingGroupRef.current = true;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Sans capture, le drag vit tant que le pointeur survole.
            }
          }}
          onPointerMove={(event) => {
            if (draggingGroupRef.current) {
              moveGroupToPointer(event.clientX, event.clientY);
            }
          }}
          onPointerUp={() => {
            draggingGroupRef.current = false;
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full shadow-md ring-[3px] ring-white active:cursor-grabbing"
          style={{
            left: `${dominant.x * 100}%`,
            top: `${dominant.y * 100}%`,
            width: STOP_SIZES_PX[0],
            height: STOP_SIZES_PX[0],
            backgroundColor: dominant.color,
          }}
        />
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
              aria-label={`Couleur ${palette[0]}`}
              onClick={() => applyPalette(palette[0])}
              className="size-6 cursor-pointer rounded-full ring-1 ring-black/10 transition-transform hover:scale-110"
              style={{
                // Un rond = UNE couleur, et « ça tourne » : elle devient la
                // dominante, les précédentes reculent vers les satellites.
                // En mode sombre, le nuancier s'assombrit avec le panneau.
                backgroundColor: isDarkCanvas
                  ? `color-mix(in oklab, ${palette[0]} 72%, black)`
                  : palette[0],
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
 * Le slider d'Arc, décortiqué image par image (vidéo fondateur 29/07) : la
 * sinusoïde n'est pas un rail décoratif — SON AMPLITUDE EST LA VALEUR. À
 * zéro la ligne est presque plate et le voile est délavé ; à fond la vague
 * est pleine et la couleur assume. Le contrôle mime son effet : c'est ça,
 * le « archi bien fait ».
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
    // Période 22 px sur 160 px, centrée sur y=14 ; l'amplitude suit la
    // valeur : 0,8 px (presque plat, jamais mort) → 8 px (pleine vague).
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
      className="group relative size-12 shrink-0 cursor-ns-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/15 opacity-0 transition-opacity group-hover:opacity-100"
      />
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
