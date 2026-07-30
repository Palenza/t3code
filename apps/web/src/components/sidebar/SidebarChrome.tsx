import { GaugeIcon, PlugIcon, SettingsIcon, SlidersHorizontalIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { SidebarMemoire } from "./SidebarMemoire";
import { SidebarModeTravail } from "./SidebarModeTravail";
import { GeneralSettingsPanel, ProviderSettingsPanel } from "../settings/SettingsPanels";
import { TableauLocalSettingsPanel } from "../settings/TableauLocalSettings";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
// L'union des deux côtés en UN seul import : la fusion en avait laissé deux.
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
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
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

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
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1.5 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <T3Wordmark />
      <span
        className={cn(
          "sidebar-brand-word truncate text-base font-medium tracking-tight",
          // BLANC PUR sur le bandeau (demande fondateur 29/07) : sur
          // l'ardoise griffée, un gris se noie.
          onBackdrop ? "text-white" : "text-muted-foreground",
        )}
      >
        Code
      </span>
      {/* Le canal du fork, dit à sa place : « T3 Code Raptor ». En braise
          cuivre sur le bandeau griffé, pour prolonger l'icône. */}
      {/* RAPTOR : braise dégradée + halo, comme une signature chauffée à
          blanc. Le dégradé est peint DANS le texte (background-clip), donc
          il garde son éclat sur n'importe quelle couleur de bandeau. */}
      <span
        className={cn(
          "sidebar-brand-word truncate text-[13px] font-bold uppercase tracking-[0.2em]",
          onBackdrop
            ? "bg-gradient-to-r from-[#ffd9a8] via-[#ff9d4d] to-[#ff5a1f] bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(255,120,40,0.55)]"
            : "text-muted-foreground/70",
        )}
      >
        Raptor
      </span>
    </Link>
  );
}

function T3Wordmark() {
  // Fork identity (29/07 au soir) : le glyphe redit T3 — le fork garde le nom
  // amont, son canal s'appelle RAPTOR. Le T est le dessin amont ; le 3 est
  // tracé à la même graisse.
  return (
    <svg
      aria-label="T3"
      className="h-3.5 w-auto shrink-0"
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
  { label: "General", to: "/settings/general", panneau: "general", Icone: SlidersHorizontalIcon },
  { label: "Providers", to: "/settings/providers", panneau: "providers", Icone: PlugIcon },
  {
    label: "Tableau local",
    to: "/settings/tableau-local",
    panneau: "tableau",
    Icone: GaugeIcon,
  },
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
        // Fermeture LENTE : le trajet sidebar → panneau passe au-dessus du
        // contenu, et la sidebar en peek se referme sous le curseur pendant
        // le voyage. 240 ms coupaient le pont en route (30/07).
        closeDelay={600}
        render={
          <SidebarMenuButton
            className="h-7 text-[13px] text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={() => onNavigate(link.to)}
          >
            {/* Une VRAIE icône : le `pl-6` d'avant réservait la place d'une
                icône absente, si bien que les trois libellés flottaient dans
                le vide pendant que « Settings », juste dessous, en portait
                une — trois lignes décalées sans repère (capture 30/07). */}
            <link.Icone />
            <span className="truncate">{link.label}</span>
          </SidebarMenuButton>
        }
      />
      <PopoverPopup
        // Ancré sur le LIEN survolé, pas sur la sidebar : ancré sur elle, le
        // panneau s'ouvrait au milieu d'une colonne pleine hauteur, donc loin
        // de la souris — « ça ne s'affiche pas en face de la souris, du coup
        // elle disparaît » (30/07). Il se déploie maintenant à hauteur du
        // lien, et `sideOffset` court garde le pont souris franchissable.
        side="right"
        // ALIGNÉ PAR LE BAS, pas centré. Centré sur « Tableau local » — un lien
        // posé à 72 px du bord — il ne restait que 142 px de positionneur et le
        // panneau débordait de 419 px sous la fenêtre (mesuré le 30/07).
        // Aligné par la fin, il monte à partir du lien et dispose de toute la
        // hauteur au-dessus.
        align="end"
        sideOffset={6}
        // `max-h-full` : le panneau ne dépasse JAMAIS son positionneur.
        //
        // Il était borné à `min(80vh,44rem)` — 576 px quelle que soit la
        // position du lien. Ouvert depuis « Tableau local », posé à 72 px du
        // bas, il débordait de 419 px sous la fenêtre : les trois quarts hors
        // écran (mesuré le 30/07). `--available-height` ne sauve rien — elle
        // vaut la fenêtre entière (710 px), pas la place sous l'ancre.
        //
        // La place réelle, c'est le POSITIONNEUR : 142 px à cette hauteur-là.
        // Un panneau de 696 px n'y tient pas, et aucun alignement n'y change
        // rien. Il devient donc un APERÇU qui défile — jamais rogné, jamais
        // hors champ — et le contenu entier reste à un clic, sur sa page.
        className="max-h-full w-[min(720px,60vw)] overflow-hidden p-0"
        viewportClassName="max-h-full overflow-y-auto overscroll-contain p-0 [--viewport-inline-padding:0px]"
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
      {/* Le mode de travail est un RÉGLAGE, pas un favori : en tête de sidebar
          il s'intercalait entre les liens épinglés et la recherche, coupant
          la grille en deux (capture 30/07). Sa place est ici, avec General et
          Providers. */}
      {/* La mémoire AVANT le mode : ce que l'app a retenu de toi pèse sur
          chaque session, et c'était jusqu'ici invisible et irrévocable. */}
      <SidebarMemoire />
      <SidebarModeTravail />
      <SidebarMenu>
        {SIDEBAR_QUICK_LINKS.map((link) => (
          <SidebarMenuItem key={link.to}>
            <QuickSettingLink link={link} onNavigate={navigateClosingMobile} />
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
