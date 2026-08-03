import type { ServerProvider, ServerProviderSkill } from "@t3tools/contracts";

/** Une skill, plus le provider qui la porte — sans ça, deux skills de même nom
 * venant de deux providers seraient indistinguables dans la liste. */
export type SkillListee = ServerProviderSkill & { readonly provider: string };

/**
 * La liste PLATE des skills de tous les providers, triée par nom.
 *
 * Extraite du composant pour être testable sans monter de React — comme
 * `session-logic` et `composer-logic`. Ce qui compte ici n'est pas le cas
 * nominal mais la DÉDUPLICATION : le même dossier de skills peut être partagé
 * par plusieurs instances de provider (Enzo a trois comptes Claude qui lisent
 * les mêmes skills). Sans dédup, il verrait chaque skill en triple et croirait
 * à un défaut.
 */
export function listerSkillsDesProviders(
  providers: ReadonlyArray<ServerProvider> | undefined,
): ReadonlyArray<SkillListee> {
  if (providers === undefined) return [];
  const parCle = new Map<string, SkillListee>();
  for (const provider of providers) {
    for (const skill of provider.skills ?? []) {
      // La CLÉ est le chemin quand il existe : c'est lui qui identifie une
      // skill sur le disque. Deux instances qui lisent le même dossier rendent
      // le même chemin, donc une seule entrée.
      const cle = skill.path || `${provider.instanceId}:${skill.name}`;
      if (parCle.has(cle)) continue;
      parCle.set(cle, { ...skill, provider: provider.displayName ?? provider.instanceId });
    }
  }
  return [...parCle.values()].toSorted((a, b) =>
    (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name, "fr"),
  );
}

/**
 * Le filtre de recherche : nom, nom affiché et description.
 *
 * Une recherche qui cache une correspondance est cassée — la règle est reprise
 * d'Hermès (`609cd28b`), la seule moitié de leur travail sur le menu `/` qui
 * nous concerne. On cherche donc AUSSI dans la description : c'est souvent le
 * seul endroit où le mot qu'on a en tête se trouve.
 */
export function filtrerSkills(
  skills: ReadonlyArray<SkillListee>,
  recherche: string,
): ReadonlyArray<SkillListee> {
  const terme = recherche.trim().toLowerCase();
  if (terme.length === 0) return skills;
  return skills.filter((skill) =>
    [skill.name, skill.displayName, skill.description, skill.shortDescription]
      .filter((champ): champ is string => typeof champ === "string")
      .some((champ) => champ.toLowerCase().includes(terme)),
  );
}

/**
 * LE CHEMIN, RACCOURCI — mais jamais AMBIGU.
 *
 * La portée affichée disait « project » pour une skill vivant dans
 * `~/.claude/skills` : le découvreur l'avait bien trouvée sous
 * `<cwd>/.claude/skills`, donc « project » au sens du code — et « mon projet »
 * au sens du lecteur. Deux sens pour un mot, sur le seul repère de l'écran.
 *
 * On montre le chemin, qui n'a qu'un sens. Raccourci à ses deux derniers
 * segments parlants (`<dossier>/skills/<nom>` → `Palenza/…/ma-skill`), le
 * complet restant dans l'infobulle : un identifiant tronqué qui ne dit pas
 * qu'il l'est vaut le mensonge qu'il remplace.
 */
export function cheminLisible(chemin: string): string {
  const morceaux = chemin.split("/").filter(Boolean);
  // Le fichier terminal est toujours SKILL.md — il n'apprend rien, on le coupe.
  const utiles = morceaux.at(-1) === "SKILL.md" ? morceaux.slice(0, -1) : morceaux;
  const nom = utiles.at(-1) ?? chemin;
  // Le segment qui SITUE : le dossier au-dessus de `skills/`, c'est-à-dire
  // `.claude` → on remonte encore d'un cran pour tomber sur le vrai lieu.
  const iSkills = utiles.lastIndexOf("skills");
  const lieu = iSkills > 1 ? utiles[iSkills - 2] : iSkills === 1 ? utiles[0] : undefined;
  return lieu === undefined ? nom : `${lieu} › ${nom}`;
}
