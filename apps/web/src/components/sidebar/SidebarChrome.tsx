import { GaugeIcon, PlugIcon, SettingsIcon, SlidersHorizontalIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { APP_BUILD_VERSION, APP_DISPLAY_NAME } from "../../branding";
import { cn } from "../../lib/utils";
import { SidebarCarnet } from "./SidebarCarnet";
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
  // LA SIGNATURE DE RAPTOR, et rien d'autre.
  //
  // Cet en-tête disait « T3 · Code · RAPTOR » : le glyphe de l'amont, son nom,
  // et le nôtre en troisième position. Décision fondateur du 02/08 — « je veux
  // me détacher absolument des mentions de l'amont, moi c'est Raptor » — le
  // mot-signature devient le tout. On garde la braise : c'était déjà la nôtre.
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1.5 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      {/* RAPTOR : braise dégradée + halo, comme une signature chauffée à
          blanc. Le dégradé est peint DANS le texte (background-clip), donc
          il garde son éclat sur n'importe quelle couleur de bandeau. */}
      <span
        className={cn(
          "sidebar-brand-word truncate text-[15px] font-bold uppercase tracking-[0.22em]",
          onBackdrop
            ? "bg-gradient-to-r from-[#ffd9a8] via-[#ff9d4d] to-[#ff5a1f] bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(255,120,40,0.55)]"
            : "text-foreground",
        )}
      >
        Raptor
      </span>
    </Link>
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
        className="h-[min(72vh,40rem)] max-h-(--available-height) w-[min(720px,60vw)] overflow-hidden p-0"
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
    <SidebarFooter className="p-[var(--sidebar-content-inset)]">
      <SidebarForkUpdatePill />
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      {/* Le mode de travail est un RÉGLAGE, pas un favori : en tête de sidebar
          il s'intercalait entre les liens épinglés et la recherche, coupant
          la grille en deux (capture 30/07). Sa place est ici, avec General et
          Providers. */}
      {/* Le carnet EN PREMIER : une panne que le système n'a pas su lire est
          la chose la plus urgente à voir, et la seule qui se paie en fils
          morts si elle reste invisible. */}
      <SidebarCarnet />
      {/* Le REGLAGE vit dans le composeur (à côté de Build) ; ici ne reste que
          le CRI quand un mode restrictif désarme les agents. */}
      <SidebarModeTravail />
      {/* La mémoire a DÉMÉNAGÉ dans la barre du composeur, à côté du modèle et
          du mode — même registre : sous quelles règles ce message part-il ?
          La garder ici EN PLUS faisait deux entrées pour une seule chose, et
          rendait la colonne plus longue sans rien apprendre de neuf. */}
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
      {/* LA VERSION, EN PERMANENCE — et ce n'est pas cosmétique.
       *
       * Le 01/08, Enzo a piloté une app 149 commits en retard sans le savoir,
       * pendant qu'on empilait des correctifs qu'il ne voyait pas. Quatre
       * diagnostics faux sont nés de cet écart, et la journée entière avec.
       * Rien à l'écran ne disait quelle version tournait.
       *
       * Discret par construction — un chiffre qu'on ne lit que lorsqu'on le
       * cherche. Mais quand on le cherche, il est là, et il change à chaque
       * DMG.
       *
       * `APP_BUILD_VERSION`, et surtout PAS `APP_VERSION` : le second est la
       * version de l'app web, qui sert à la détection d'écart client/serveur
       * et que seule la CI bumpe. Il affichait 0.0.31 pendant qu'Enzo faisait
       * tourner un DMG 0.0.73 (sa capture du 02/08) — un numéro faux à
       * l'endroit exact censé empêcher les numéros faux. */}
      <div
        className="px-2 pb-0.5 text-right text-[10px] text-sidebar-muted-foreground/45 tabular-nums"
        title={`${APP_DISPLAY_NAME} ${APP_BUILD_VERSION}`}
      >
        v{APP_BUILD_VERSION}
      </div>
    </SidebarFooter>
  );
});
