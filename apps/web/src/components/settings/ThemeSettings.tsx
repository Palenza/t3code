import { PaletteIcon, PlusIcon, XIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import {
  SIDEBAR_THEME_PRESETS,
  useSidebarThemeStore,
  type SidebarTheme,
} from "../../sidebarThemeStore";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const DEFAULT_THEME: SidebarTheme = { colors: ["#5db3f0", "#9c5fd4"], intensity: 0.5, grain: 0.25 };

/**
 * Arc-style sidebar theme editor. The preview is the sidebar itself, live —
 * every change lands in the store and paints immediately, which beats any
 * thumbnail. No theme by default: the upstream look until the user chooses.
 */
export function ThemeSettingsPanel() {
  const theme = useSidebarThemeStore((state) => state.theme);
  const setTheme = useSidebarThemeStore((state) => state.setTheme);
  const clearTheme = useSidebarThemeStore((state) => state.clearTheme);

  const current = theme ?? DEFAULT_THEME;
  const active = theme !== null;

  const apply = (next: Partial<SidebarTheme>) => setTheme({ ...current, ...next });
  const setColor = (index: number, color: string) => {
    const colors = [...current.colors];
    colors[index] = color;
    apply({ colors });
  };
  const removeColor = (index: number) => {
    if (current.colors.length <= 1) return;
    apply({ colors: current.colors.filter((_, i) => i !== index) });
  };

  return (
    <SettingsPageContainer>
      <SettingsSection title="Sidebar theme" icon={<PaletteIcon className="size-4.5" />}>
        <p className="max-w-xl px-3 text-[13px] leading-[1.45] text-muted-foreground/80 sm:px-4">
          Pick one to three colours: the sidebar takes a soft gradient wash blended toward the
          app's light or dark background, Arc-style. The sidebar itself is the live preview.
        </p>

        <div className="px-3 pt-3 sm:px-4">
          <p className="pb-2 text-xs font-medium text-muted-foreground">Presets</p>
          <div className="flex flex-wrap gap-2">
            {SIDEBAR_THEME_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Use ${preset}`}
                onClick={() => apply({ colors: [preset] })}
                className={cn(
                  "size-7 cursor-pointer rounded-full border border-border/60 transition-transform hover:scale-110",
                  active && current.colors[0] === preset && current.colors.length === 1
                    ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    : null,
                )}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </div>

        <div className="px-3 pt-4 sm:px-4">
          <p className="pb-2 text-xs font-medium text-muted-foreground">Colours</p>
          <div className="flex items-center gap-2">
            {current.colors.map((color, index) => (
              <span
                key={`${color}:${current.colors.slice(0, index).filter((c) => c === color).length}`}
                className="relative"
              >
                <input
                  type="color"
                  value={color}
                  aria-label={`Colour ${index + 1}`}
                  onChange={(event) => setColor(index, event.currentTarget.value)}
                  className="size-9 cursor-pointer rounded-lg border border-border/60 bg-transparent p-0.5"
                />
                {current.colors.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove colour ${index + 1}`}
                    onClick={() => removeColor(index)}
                    className="absolute -top-1.5 -right-1.5 flex size-4 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-2.5" />
                  </button>
                ) : null}
              </span>
            ))}
            {current.colors.length < 3 ? (
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Add a colour"
                onClick={() =>
                  apply({ colors: [...current.colors, current.colors.at(-1) ?? "#5db3f0"] })
                }
              >
                <PlusIcon className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid max-w-md gap-4 px-3 pt-4 sm:px-4">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Intensity
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(current.intensity * 100)}
              onChange={(event) => apply({ intensity: Number(event.currentTarget.value) / 100 })}
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
              onChange={(event) => apply({ grain: Number(event.currentTarget.value) / 100 })}
              aria-label="Theme grain"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 px-3 pt-4 pb-2 sm:px-4">
          {!active ? (
            <Button size="sm" onClick={() => setTheme(current)}>
              Enable theme
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={clearTheme}>
              No theme
            </Button>
          )}
          <p className="text-xs text-muted-foreground/70">
            {active ? "Live on the sidebar." : "Off — the sidebar keeps the default look."}
          </p>
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
