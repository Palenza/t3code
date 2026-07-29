import { PaletteIcon } from "lucide-react";

import { SpaceThemePanel } from "../sidebar/SpaceThemePanel";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

/**
 * Le thème de la sidebar, dans les Réglages — et c'est EXACTEMENT le même
 * instrument que le clic droit sur la barre d'espaces.
 *
 * Il y avait ici, jusqu'au 30/07, un SECOND éditeur : une page à six
 * pastilles avec trois curseurs séparés (intensité, grain, angle), écrite
 * avant que la mécanique d'Arc ne soit mesurée image par image. Elle a
 * survécu à son remplaçant, si bien que l'app proposait deux éditeurs qui ne
 * se comportaient pas pareil — six ronds ici, trois là ; des curseurs ici,
 * une vague et une molette là. Le fondateur est tombé sur l'ancien et a
 * tranché : « c'est du n'importe quoi ».
 *
 * Deux façons de régler la même chose, c'est une de trop. La page n'est plus
 * qu'un cadre autour du vrai panneau : ce qu'on apprend d'un côté vaut de
 * l'autre, et il ne reste qu'une mécanique à faire évoluer.
 */
export function ThemeSettingsPanel() {
  return (
    <SettingsPageContainer>
      <SettingsSection title="Thème de la sidebar" icon={<PaletteIcon className="size-4.5" />}>
        <p className="max-w-xl px-3 text-[13px] leading-[1.45] text-muted-foreground/80 sm:px-4">
          Attrape le gros rond : la teinte suit ta main, les satellites s'accordent. Chaque espace
          peut porter son propre thème.
        </p>
        <div className="flex justify-center px-3 py-4 sm:px-4">
          <SpaceThemePanel />
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
