import { useRef } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Point d'entrée visible du dépôt de fichiers du composeur.
 *
 * Collage et glisser-déposer alimentent déjà `addComposerFiles` ; ce bouton
 * ouvre le sélecteur sur le MÊME chemin, pour que le tri (image → inline,
 * reste → mention) et toutes les limites tiennent à un seul endroit.
 *
 * AUCUN filtre `accept`. L'ancienne version posait `accept="image/*"` en
 * expliquant que « la charge utile des providers ne prend que des images ».
 * C'est vrai de la voie inline seulement : un fichier peut aussi partir en
 * MENTION — un lien `[nom](chemin)` dans le prompt, que l'agent ouvre
 * lui-même. Un PDF, un CSV, un .mov, un dossier passent donc tous ; c'est
 * `composerFileIntake` qui décide de la voie.
 */
export function ComposerAttachButton({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Reset so picking the same file twice still fires onChange.
          event.target.value = "";
          if (files.length > 0) {
            onFiles(files);
          }
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              type="button"
              className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Joindre des fichiers"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <PlusIcon className="size-4" />
            </Button>
          }
        />
        {/* Le sélecteur natif d'un `<input type=file>` ne sait pas prendre un
            DOSSIER — ça, c'est le glisser-déposer qui le fait. On le dit
            plutôt que de laisser l'utilisateur chercher. */}
        <TooltipPopup side="top">
          Joindre des fichiers — glissez un dossier pour l'ajouter
        </TooltipPopup>
      </Tooltip>
    </>
  );
}
