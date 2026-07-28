import { useRef } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Visible entry point to the composer's existing image-attachment pipeline.
 *
 * Paste and drag-and-drop already feed `addComposerImages`; this button opens
 * a file picker into the same path, so every limit (count, size, image-only)
 * is enforced in exactly one place. The input accepts images only because the
 * providers' turn payload does — offering more here would be a lie.
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
        accept="image/*"
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
              aria-label="Attach images"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <PlusIcon className="size-4" />
            </Button>
          }
        />
        <TooltipPopup side="top">Attach images</TooltipPopup>
      </Tooltip>
    </>
  );
}
