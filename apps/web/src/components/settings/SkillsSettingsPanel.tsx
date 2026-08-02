import { useAtomValue } from "@effect/atom-react";
import { useMemo, useState } from "react";

import { primaryServerConfigAtom } from "../../state/server";
import { Input } from "../ui/input";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { filtrerSkills, listerSkillsDesProviders } from "./skillsSettings.logic";

/**
 * VOIR SES SKILLS — le manque le plus net face à ZCode (relevé le 01/08).
 *
 * Eux ont une page Skills : recherche, portée, un interrupteur par skill.
 * Nous en avions ZÉRO : les skills se chargeaient, se rechargeaient à chaud,
 * s'invoquaient — et Enzo n'avait aucun endroit pour savoir lesquelles étaient
 * là. Un mécanisme qu'on ne peut pas regarder ne se corrige qu'en devinant.
 *
 * Cette première version est en LECTURE SEULE, et c'est délibéré : la liste
 * arrive déjà côté client dans le snapshot du provider (`ServerProviderSkill`),
 * donc l'afficher ne demande aucune plomberie serveur. L'interrupteur, lui,
 * exigerait d'écrire `enabled` côté serveur — un second chantier, qu'on ne
 * mélange pas à celui-ci.
 *
 * Voir, d'abord. Régler, ensuite.
 */
export function SkillsSettingsPanel() {
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const [recherche, setRecherche] = useState("");

  const skills = useMemo(
    () => listerSkillsDesProviders(serverConfig?.providers),
    [serverConfig?.providers],
  );
  const visibles = useMemo(() => filtrerSkills(skills, recherche), [skills, recherche]);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Skills">
        <div className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            Les skills chargées par tes providers. Invocables dans le chat avec{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">$nom-de-skill</code>. Cette vue
            est en lecture seule : l&apos;activation par skill viendra ensuite.
          </p>

          <Input
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Chercher une skill…"
            aria-label="Chercher une skill"
          />

          {/* Un compte VIDE et un compte FILTRÉ ne disent pas la même chose : le
              premier est un état du système, le second un état de ta recherche.
              Les confondre laisserait croire qu'il n'y a aucune skill alors
              qu'on vient juste de mal taper. */}
          {skills.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune skill chargée. Elles vivent dans les dossiers de skills de tes providers et se
              rechargent à chaud quand leur contenu change.
            </p>
          ) : visibles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune skill ne correspond à «&nbsp;{recherche}&nbsp;» — {skills.length} chargée
              {skills.length > 1 ? "s" : ""} au total.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {visibles.length} sur {skills.length}
              </p>
              <ul className="grid gap-2">
                {visibles.map((skill) => (
                  <li
                    key={`${skill.provider}:${skill.name}`}
                    className="grid gap-1 rounded-lg border border-border/55 px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-foreground text-sm">
                        {skill.displayName ?? skill.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {skill.scope ?? skill.provider}
                      </span>
                    </div>
                    {skill.description ? (
                      <p className="text-muted-foreground text-xs leading-5">{skill.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
