import { useAtomValue } from "@effect/atom-react";
import { SettingsIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { APP_STAGE_LABEL } from "../../branding";
import { cn } from "../../lib/utils";
import { primaryServerConfigAtom } from "../../state/server";
import { resolveSidebarStageBadgeLabel } from "../Sidebar.logic";
import { GeneralSettingsPanel, ProviderSettingsPanel } from "../settings/SettingsPanels";
import { TableauLocalSettingsPanel } from "../settings/TableauLocalSettings";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarStageBackdrop, resolveSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { SidebarForkUpdatePill } from "./SidebarForkUpdatePill";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useSidebarStageLabel();
  const backdropVariant = resolveSidebarStageBackdropVariant(stageLabel);

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
        )}
      />
      <SidebarBrand onBackdrop={backdropVariant !== null} />
    </SidebarHeader>
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <T3Wordmark />
      <span
        className={cn(
          "truncate text-sm font-medium tracking-tight",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
      {/* Le canal du fork, dit à sa place : « T3 Code Raptor ». En braise
          cuivre sur le bandeau griffé, pour prolonger l'icône. */}
      <span
        className={cn(
          "truncate text-[11px] font-semibold uppercase tracking-[0.14em]",
          onBackdrop ? "text-[#ff9d4d]" : "text-muted-foreground/70",
        )}
      >
        Raptor
      </span>
    </Link>
  );
}

function useSidebarStageLabel() {
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;

  return resolveSidebarStageBadgeLabel({
    primaryServerVersion,
    fallbackStageLabel: APP_STAGE_LABEL,
  });
}

function T3Wordmark() {
  // Fork identity (29/07 au soir) : le glyphe redit T3 — le fork garde le nom
  // amont, son canal s'appelle RAPTOR. Le T est le dessin amont ; le 3 est
  // tracé à la même graisse.
  return (
    <svg
      aria-label="T3"
      className="h-2.5 w-auto shrink-0"
      viewBox="15.5309 37 94.3941 56.96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M33.4509 93V47.56H15.5309V37H64.3309V47.56H46.4109V93H33.4509Z"
        fill="currentColor"
      />
      <path
        d="M69 93.96C63.6 93.96 59.2 92.6 55.8 89.88C52.4 87.16 50.5 83.24 50.1 78.12H62.9C63.2 80.36 64.02 82.02 65.36 83.1C66.7 84.18 68.5 84.72 70.76 84.72C73.16 84.72 75.02 84.1 76.34 82.86C77.66 81.62 78.32 79.94 78.32 77.82C78.32 75.5 77.56 73.76 76.04 72.6C74.52 71.44 72.28 70.86 69.32 70.86H65.9V61.98H69.32C71.88 61.98 73.82 61.42 75.14 60.3C76.46 59.18 77.12 57.6 77.12 55.56C77.12 53.64 76.54 52.14 75.38 51.06C74.22 49.98 72.6 49.44 70.52 49.44C68.44 49.44 66.8 49.98 65.6 51.06C64.4 52.14 63.68 53.68 63.44 55.68H50.82C51.18 50.8 52.98 47.02 56.22 44.34C59.46 41.66 63.72 40.32 69 40.32C74.6 40.32 79.02 41.68 82.26 44.4C85.5 47.12 87.12 50.78 87.12 55.38C87.12 58.02 86.44 60.3 85.08 62.22C83.72 64.14 81.84 65.46 79.44 66.18V66.42C82.32 67.06 84.56 68.44 86.16 70.56C87.76 72.68 88.56 75.28 88.56 78.36C88.56 83.16 86.82 86.94 83.34 89.7C79.86 92.54 74.98 93.96 69 93.96Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Un clic au lieu de Settings → sous-page (retour fondateur 29/07, façon
// Arc) : les pages du quotidien vivent directement dans la sidebar.
const SIDEBAR_QUICK_LINKS = [
  { label: "General", to: "/settings/general", panneau: "general" },
  { label: "Providers", to: "/settings/providers", panneau: "providers" },
  { label: "Tableau local", to: "/settings/tableau-local", panneau: "tableau" },
] as const;

/**
 * Le réglage s'ouvre AU SURVOL, dans un panneau flottant ancré au bord de la
 * sidebar — comme l'éditeur de couleurs. Plus de navigation vers une page
 * dont il faut revenir par « Back » (reproche fondateur 29/07 : « je ne veux
 * pas cliquer, je veux passer ma souris »). La souris peut traverser jusqu'au
 * panneau sans qu'il se referme : c'est un survol avec délai, pas un tooltip.
 */
function QuickSettingLink({
  link,
  onNavigate,
}: {
  readonly link: (typeof SIDEBAR_QUICK_LINKS)[number];
  readonly onNavigate: (to: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger
        openOnHover
        delay={160}
        closeDelay={240}
        render={
          <SidebarMenuButton
            className="h-7 text-[13px] text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={() => onNavigate(link.to)}
          >
            <span className="truncate">{link.label}</span>
          </SidebarMenuButton>
        }
      />
      <PopoverPopup
        anchor={() => document.querySelector("[data-app-sidebar]")}
        side="right"
        align="end"
        sideOffset={14}
        className="max-h-[80vh] w-[min(720px,60vw)] overflow-hidden p-0"
        viewportClassName="max-h-[80vh] overflow-y-auto p-0 [--viewport-inline-padding:0px]"
      >
        <div className="px-5 py-4">
          {link.panneau === "general" ? (
            <GeneralSettingsPanel />
          ) : link.panneau === "providers" ? (
            <ProviderSettingsPanel />
          ) : (
            <TableauLocalSettingsPanel />
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const navigateClosingMobile = useCallback(
    (to: string) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({ to });
    },
    [isMobile, navigate, setOpenMobile],
  );
  const handleSettingsClick = useCallback(() => {
    navigateClosingMobile("/settings");
  }, [navigateClosingMobile]);

  return (
    <SidebarFooter className="p-2">
      <SidebarForkUpdatePill />
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarMenu>
        {SIDEBAR_QUICK_LINKS.map((link) => (
          <SidebarMenuItem key={link.to}>
            <QuickSettingLink link={link} onNavigate={navigateClosingMobile} />
            <SidebarMenuButton
              className="hidden"
              onClick={() => navigateClosingMobile(link.to)}
            >
              <span className="pl-6">{link.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});
