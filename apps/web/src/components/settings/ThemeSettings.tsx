import { useCallback, useRef, useState } from "react";

import { MinusIcon, MoonIcon, PaletteIcon, PlusIcon, SparklesIcon, SunIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { useTheme } from "../../hooks/useTheme";
import { useSidebarSpacesStore } from "../../sidebarSpacesStore";
import {
  DEFAULT_STOP_POSITIONS,
  MAX_SIDEBAR_THEME_STOPS,
  makeSidebarThemeFromColors,
  SIDEBAR_THEME_GRAIN_URL,
  SIDEBAR_THEME_PRESETS,
  sidebarThemeBackground,
  sidebarThemeGrainOpacity,
  useSidebarThemeStore,
  type SidebarTheme,
  type SidebarThemeStop,
} from "../../sidebarThemeStore";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const DEFAULT_THEME: SidebarTheme = makeSidebarThemeFromColors(["#4caf7d", "#ef6292"]);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Arc-style theme editor (retour fondateur 29/07, calqué sur l'éditeur de
 * Spaces d'Arc) : la toile pointillée EST l'aperçu — chaque couleur est une
 * pastille qu'on déplace au doigt, le dégradé suit en direct, et la sidebar
 * (l'aperçu grandeur nature) se repeint à chaque geste. Un thème par projet,
 * comme un Space.
 */
export function ThemeSettingsPanel() {
  const defaultTheme = useSidebarThemeStore((state) => state.theme);
  const themesByProject = useSidebarThemeStore((state) => state.themesByProject);
  const activeProjectKey = useSidebarThemeStore((state) => state.activeProjectKey);
  const setTheme = useSidebarThemeStore((state) => state.setTheme);
  const clearTheme = useSidebarThemeStore((state) => state.clearTheme);
  const setProjectTheme = useSidebarThemeStore((state) => state.setProjectTheme);
  const clearProjectTheme = useSidebarThemeStore((state) => state.clearProjectTheme);
  const { resolvedTheme } = useTheme();

  const spaces = useSidebarSpacesStore((state) => state.spaces);
  const activeSpaceId = useSidebarSpacesStore((state) => state.activeSpaceId);
  const setSpaceTheme = useSidebarSpacesStore((state) => state.setSpaceTheme);
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null;

  const [scope, setScope] = useState<"default" | "project" | "space">(() => {
    if (activeSpaceId !== null) return "space";
    return activeProjectKey !== null && themesByProject[activeProjectKey] !== undefined
      ? "project"
      : "default";
  });
  const projectScopeAvailable = activeProjectKey !== null;
  const spaceScopeAvailable = activeSpace !== null;
  const effectiveScope =
    scope === "space" && spaceScopeAvailable
      ? "space"
      : scope === "project" && projectScopeAvailable
        ? "project"
        : "default";

  const storedTheme =
    effectiveScope === "space"
      ? (activeSpace?.theme ?? null)
      : effectiveScope === "project" && activeProjectKey !== null
        ? (themesByProject[activeProjectKey] ?? null)
        : defaultTheme;
  const active = storedTheme !== null;
  const current = storedTheme ?? DEFAULT_THEME;

  const [selectedStopIndex, setSelectedStopIndex] = useState(0);
  const selectedStop = current.stops[Math.min(selectedStopIndex, current.stops.length - 1)];

  const apply = useCallback(
    (next: SidebarTheme) => {
      if (effectiveScope === "space" && activeSpace !== null) {
        setSpaceTheme(activeSpace.id, next);
        return;
      }
      if (effectiveScope === "project" && activeProjectKey !== null) {
        setProjectTheme(activeProjectKey, next);
        return;
      }
      setTheme(next);
    },
    [activeProjectKey, activeSpace, effectiveScope, setProjectTheme, setSpaceTheme, setTheme],
  );
  const disable = useCallback(() => {
    if (effectiveScope === "space" && activeSpace !== null) {
      setSpaceTheme(activeSpace.id, null);
      return;
    }
    if (effectiveScope === "project" && activeProjectKey !== null) {
      clearProjectTheme(activeProjectKey);
      return;
    }
    clearTheme();
  }, [activeProjectKey, activeSpace, clearProjectTheme, clearTheme, effectiveScope, setSpaceTheme]);

  const patch = (partial: Partial<SidebarTheme>) => apply({ ...current, ...partial });
  const patchStop = (index: number, stop: Partial<SidebarThemeStop>) => {
    const stops = current.stops.map((existing, i) =>
      i === index ? { ...existing, ...stop } : existing,
    );
    apply({ ...current, stops });
  };

  const addStop = () => {
    if (current.stops.length >= MAX_SIDEBAR_THEME_STOPS) return;
    const preset =
      SIDEBAR_THEME_PRESETS[(current.stops.length * 3 + 2) % SIDEBAR_THEME_PRESETS.length] ??
      "#5db3f0";
    const position = DEFAULT_STOP_POSITIONS[current.stops.length] ?? { x: 0.5, y: 0.5 };
    apply({ ...current, stops: [...current.stops, { color: preset, ...position }] });
    setSelectedStopIndex(current.stops.length);
  };
  const removeSelectedStop = () => {
    if (current.stops.length <= 1) return;
    const stops = current.stops.filter((_, i) => i !== selectedStopIndex);
    apply({ ...current, stops });
    setSelectedStopIndex(Math.max(0, selectedStopIndex - 1));
  };

  // ------------------------------------------------------------------
  // Canvas drag — plain pointer events, positions in fractions of the box.
  // ------------------------------------------------------------------
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const moveStopToPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const index = dragIndexRef.current;
    if (canvas === null || index === null) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    patchStop(index, { x, y });
  };

  const canvasBackground = sidebarThemeBackground(current, resolvedTheme);
  const grainOpacity = sidebarThemeGrainOpacity(current);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Sidebar theme" icon={<PaletteIcon className="size-4.5" />}>
        <p className="max-w-xl px-3 text-[13px] leading-[1.45] text-muted-foreground/80 sm:px-4">
          Drag the colour dots — the canvas and the sidebar repaint live, Arc-style. Each project
          can carry its own theme, like a Space.
        </p>

        <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-4">
          <div className="flex overflow-hidden rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setScope("default")}
              className={cn(
                "cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors",
                effectiveScope === "default"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Default theme
            </button>
            <button
              type="button"
              disabled={!projectScopeAvailable}
              onClick={() => setScope("project")}
              title={
                projectScopeAvailable
                  ? undefined
                  : "Scope the sidebar to a project first (the project filter at the top)."
              }
              className={cn(
                "cursor-pointer border-l border-border/60 px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                effectiveScope === "project"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Current project
            </button>
            <button
              type="button"
              disabled={!spaceScopeAvailable}
              onClick={() => setScope("space")}
              title={
                spaceScopeAvailable
                  ? undefined
                  : "Ouvre d'abord un espace (la barre d'icônes en bas de la sidebar)."
              }
              className={cn(
                "cursor-pointer border-l border-border/60 px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                effectiveScope === "space"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {activeSpace ? `Espace ${activeSpace.emoji} ${activeSpace.name}` : "Espace"}
            </button>
          </div>

          <div className="ml-auto flex overflow-hidden rounded-lg border border-border/60">
            {(
              [
                { value: "auto", icon: <SparklesIcon className="size-3.5" />, label: "Auto" },
                { value: "light", icon: <SunIcon className="size-3.5" />, label: "Light" },
                { value: "dark", icon: <MoonIcon className="size-3.5" />, label: "Dark" },
              ] as const
            ).map((mode, index) => (
              <button
                key={mode.value}
                type="button"
                aria-label={`${mode.label} appearance`}
                onClick={() => patch({ appearance: mode.value })}
                className={cn(
                  "cursor-pointer px-2.5 py-1.5 transition-colors",
                  index > 0 && "border-l border-border/60",
                  current.appearance === mode.value
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode.icon}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 pt-4 sm:px-4">
          <div
            ref={canvasRef}
            className="relative h-64 w-full max-w-xl touch-none overflow-hidden rounded-2xl border border-border/60 bg-muted/40"
            style={{ background: canvasBackground ?? undefined }}
            onPointerMove={(event) => {
              if (dragIndexRef.current !== null) {
                moveStopToPointer(event.clientX, event.clientY);
              }
            }}
            onPointerUp={() => {
              dragIndexRef.current = null;
            }}
          >
            {/* Dotted texture over the live gradient — the Arc canvas look. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  "radial-gradient(color-mix(in oklab, var(--color-foreground) 26%, transparent) 1px, transparent 1px)",
                backgroundSize: "14px 14px",
              }}
            />
            {grainOpacity > 0 ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 mix-blend-overlay"
                style={{
                  backgroundImage: `url("${SIDEBAR_THEME_GRAIN_URL}")`,
                  opacity: grainOpacity,
                }}
              />
            ) : null}
            {current.stops.map((stop, index) => (
              <button
                key={`${stop.color}:${current.stops.slice(0, index).filter((s) => s.color === stop.color).length}`}
                type="button"
                aria-label={`Colour dot ${index + 1}`}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragIndexRef.current = index;
                  setSelectedStopIndex(index);
                }}
                onPointerMove={(event) => {
                  if (dragIndexRef.current === index) {
                    moveStopToPointer(event.clientX, event.clientY);
                  }
                }}
                onPointerUp={() => {
                  dragIndexRef.current = null;
                }}
                className={cn(
                  "absolute size-9 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-4 border-white shadow-md transition-transform active:cursor-grabbing",
                  index === selectedStopIndex ? "scale-110 ring-2 ring-ring" : "hover:scale-105",
                )}
                style={{
                  left: `${stop.x * 100}%`,
                  top: `${stop.y * 100}%`,
                  backgroundColor: stop.color,
                }}
              />
            ))}
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Remove selected colour"
                disabled={current.stops.length <= 1}
                onClick={removeSelectedStop}
              >
                <MinusIcon className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Add a colour"
                disabled={current.stops.length >= MAX_SIDEBAR_THEME_STOPS}
                onClick={addStop}
              >
                <PlusIcon className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 pt-4 sm:px-4">
          {SIDEBAR_THEME_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Paint selected dot ${preset}`}
              onClick={() => patchStop(selectedStopIndex, { color: preset })}
              className={cn(
                "size-7 cursor-pointer rounded-full border border-border/60 transition-transform hover:scale-110",
                selectedStop?.color === preset
                  ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : null,
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
          <label
            className="relative ml-1 inline-flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border"
            aria-label="Custom colour"
            title="Custom colour"
          >
            <span
              className="absolute inset-1 rounded-full"
              style={{ backgroundColor: selectedStop?.color ?? "#5db3f0" }}
            />
            <input
              type="color"
              value={selectedStop?.color ?? "#5db3f0"}
              onChange={(event) => patchStop(selectedStopIndex, { color: event.currentTarget.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div className="grid max-w-xl gap-4 px-3 pt-4 sm:px-4">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Intensity
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(current.intensity * 100)}
              onChange={(event) => patch({ intensity: Number(event.currentTarget.value) / 100 })}
              aria-label="Theme intensity"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Grain
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(current.grain * 100)}
              onChange={(event) => patch({ grain: Number(event.currentTarget.value) / 100 })}
              aria-label="Theme grain"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Gradient angle
            <input
              type="range"
              min={0}
              max={360}
              value={Math.round(current.angle)}
              onChange={(event) => patch({ angle: Number(event.currentTarget.value) })}
              aria-label="Gradient angle"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 px-3 pt-4 pb-2 sm:px-4">
          {!active ? (
            <Button size="sm" onClick={() => apply(current)}>
              {effectiveScope === "space"
                ? "Enable for this space"
                : effectiveScope === "project"
                  ? "Enable for this project"
                  : "Enable theme"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={disable}>
              {effectiveScope === "space"
                ? "Remove space theme"
                : effectiveScope === "project"
                  ? "Remove project theme"
                  : "No theme"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground/70">
            {active
              ? "Live on the sidebar."
              : effectiveScope === "space"
                ? "This space follows the project or default theme."
                : effectiveScope === "project"
                  ? "This project follows the default theme."
                  : "Off — the sidebar keeps the default look."}
          </p>
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
