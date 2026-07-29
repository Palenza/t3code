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
    <div className="fixed inset-0 z-50 flex bg-background/95 backdrop-blur-xl">
      {/* Le rail d'Arc : icône au-dessus, libellé dessous, l'actif en pastille. */}
      <nav className="flex w-24 shrink-0 flex-col items-center gap-2 py-6">
        {ONGLETS.map(({ cle, nom, Icone }) => (
          <button
            key={cle}
            type="button"
            onClick={() => ouvrir(cle)}
            className={cn(
              "flex w-20 cursor-pointer flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-colors",
              onglet === cle
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Icone className="size-5" />
            <span className="text-[11px] font-medium leading-tight">{nom}</span>
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
