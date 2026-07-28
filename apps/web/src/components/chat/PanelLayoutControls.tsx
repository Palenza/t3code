import {
  ListTodoIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelBottomIcon,
  PanelRightIcon,
} from "lucide-react";
import { memo } from "react";

import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface PanelLayoutControlsProps {
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  tasksAvailable: boolean;
  tasksOpen: boolean;
  /** Live count of running tools/agents — the glanceable "something is working". */
  tasksRunningCount: number;
  onToggleTerminal: () => void;
  onToggleRightPanel: () => void;
  onToggleTasks: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  tasksAvailable,
  tasksOpen,
  tasksRunningCount,
  onToggleTerminal,
  onToggleRightPanel,
  onToggleTasks,
}: PanelLayoutControlsProps) {
  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="relative shrink-0 [-webkit-app-region:no-drag]"
              pressed={tasksOpen}
              onPressedChange={onToggleTasks}
              aria-label="Toggle tasks panel"
              variant="ghost"
              size="sm"
              disabled={!tasksAvailable}
            >
              <ListTodoIcon className="size-3.5" />
              {tasksRunningCount > 0 ? (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold tabular-nums text-primary-foreground"
                  aria-label={`${tasksRunningCount} running`}
                >
                  {tasksRunningCount > 9 ? "9+" : tasksRunningCount}
                </span>
              ) : null}
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {tasksAvailable
            ? tasksRunningCount > 0
              ? `Tasks — ${tasksRunningCount} running`
              : "Tasks"
            : "Tasks panel is unavailable"}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label="Toggle terminal drawer"
              variant="ghost"
              size="sm"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-3.5" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {terminalAvailable
            ? `Toggle terminal drawer${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
            : "Terminal drawer is unavailable"}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={rightPanelOpen}
              onPressedChange={onToggleRightPanel}
              aria-label="Toggle right panel"
              variant="ghost"
              size="sm"
              disabled={!rightPanelAvailable}
            >
              <PanelRightIcon className="size-3.5" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {rightPanelAvailable
            ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}`
            : "Right panel is unavailable"}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const label = maximized ? "Restore panel size" : "Maximize panel";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            {maximized ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});
