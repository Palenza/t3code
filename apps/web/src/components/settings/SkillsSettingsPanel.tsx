import { useAtomValue } from "@effect/atom-react";
import { useMemo, useState } from "react";

import { primaryServerConfigAtom } from "../../state/server";
import { Input } from "../ui/input";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { cheminLisible, filtrerSkills, listerSkillsDesProviders } from "./skillsSettings.logic";

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
          {/*
            CE QUE CETTE LISTE COUVRE — dit, parce qu'elle ne couvre pas ce
            qu'on croit (03/08).

            Les skills viennent de l'instantané du PROVIDER, découvert depuis
            le dossier de travail du SERVEUR (`ServerConfig.cwd`) — pas depuis
            le projet affiché à l'écran. Sur la machine du fondateur, ça donnait
            UNE skill (celle de `~/.claude/skills`) pendant que Palenza en a 18
            et t3code 4, aucune visible.

            Pire : cette unique skill s'affichait avec la portée « project »,
            parce que le découvreur l'avait trouvée sous `<cwd>/.claude/skills`
            — techniquement vrai, faux pour qui lit. Le CHEMIN, lui, ne peut
            pas mentir : c'est lui qu'on montre désormais.
          */}
          <p className="text-muted-foreground text-xs">
            Découvertes depuis le dossier de travail du serveur, pas depuis le projet affiché — les
            skills d&apos;un projet n&apos;apparaissent donc que si c&apos;est le même dossier.
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
                      {/* La PORTÉE disait « project » pour une skill du dossier
                          de compte : techniquement le découvreur l'avait bien
                          trouvée sous `<cwd>/.claude/skills`, mais « project »
                          se lit « mon projet ». Le chemin ne laisse aucune
                          place au malentendu. */}
                      <span
                        className="shrink-0 truncate text-muted-foreground text-xs"
                        title={skill.path}
                      >
                        {cheminLisible(skill.path)}
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
