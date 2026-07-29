import { useEffect } from "react";

import { ArchiveIcon, LayersIcon, XIcon } from "lucide-react";
import { create } from "zustand";

import { cn } from "../../lib/utils";
import { SpacesBoard } from "./SpacesBoard";

/**
 * La bibliothèque — la vue plein écran d'Arc, ouverte au swipe deux doigts
 * vers la DROITE depuis le bord (ou par ⌘⇧E).
 *
 * Chez Arc le rail de gauche porte six entrées : Media, Downloads, Easels,
 * Spaces, Boosts, Archived Tabs. Quatre d'entre elles n'ont aucun sens ici —
 * on ne télécharge rien, il n'y a ni toiles ni boosts. Les inventer pour
 * faire nombre donnerait un rail à moitié vide qui ment sur ce que l'app
 * sait faire ; on n'en garde donc que deux, celles qui existent VRAIMENT :
 * les Espaces et les fils archivés.
 */

interface BibliothequeState {
  ouverte: boolean;
  onglet: "espaces" | "archives";
  ouvrir: (onglet?: "espaces" | "archives") => void;
  fermer: () => void;
}

export const useBibliothequeStore = create<BibliothequeState>()((set) => ({
  ouverte: false,
  onglet: "espaces",
  ouvrir: (onglet) => set({ ouverte: true, ...(onglet === undefined ? {} : { onglet }) }),
  fermer: () => set({ ouverte: false }),
}));

const ONGLETS = [
  { cle: "espaces" as const, nom: "Espaces", Icone: LayersIcon },
  { cle: "archives" as const, nom: "Fils archivés", Icone: ArchiveIcon },
];

export function BibliothequeOverlay() {
  const ouverte = useBibliothequeStore((state) => state.ouverte);
  const onglet = useBibliothequeStore((state) => state.onglet);
  const ouvrir = useBibliothequeStore((state) => state.ouvrir);
  const fermer = useBibliothequeStore((state) => state.fermer);

  // Échap referme, comme toute vue plein écran.
  useEffect(() => {
    if (!ouverte) return;
    const surTouche = (event: KeyboardEvent) => {
      if (event.key === "Escape") fermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouverte, fermer]);

  if (!ouverte) return null;

  return (
    // Fond MESURÉ chez Arc : #101010, quasi opaque — pas un voile flou. Les
    // colonnes colorées ne ressortent que sur un noir franc ; un fond
    // translucide les aurait délavées (mesure 30/07).
    <div className="fixed inset-0 z-50 flex bg-[#101010]">
      {/* Le rail d'Arc : icône au-dessus, libellé dessous, l'actif en pastille.
          MESURÉ au second passage : 140 px de large (frontière nette à 280 px
          Retina), et surtout un PAS VERTICAL de 100 px entre entrées — mesuré
          trois fois de suite sans variation. C'est un rail très aéré ; le mien
          les empilait à 60 px, ce qui en faisait une liste. */}
      <nav className="flex w-[140px] shrink-0 flex-col items-center pt-8">
        {ONGLETS.map(({ cle, nom, Icone }) => (
          <button
            key={cle}
            type="button"
            onClick={() => ouvrir(cle)}
            className={cn(
              "flex h-[100px] w-[92px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-2 transition-colors",
              onglet === cle
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icone className="size-5" />
            {/* 11 px : hauteur de glyphes mesurée à 17 px Retina. */}
            <span className="text-[11px] font-semibold leading-tight">{nom}</span>
          </button>
        ))}
        <button
          type="button"
          aria-label="Fermer la bibliothèque"
          onClick={fermer}
          className="mt-auto flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </nav>

      <div className="min-w-0 flex-1">
        {onglet === "espaces" ? (
          <SpacesBoard onFermer={fermer} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Les fils archivés vivent dans Réglages → Archive.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
