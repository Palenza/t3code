import { useCallback, useEffect, useState } from "react";

import { ShieldIcon } from "lucide-react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { stackedThreadToast, toastManager } from "../ui/toast";

const MODE_PATH = "/api/mode";

interface ModeDisponible {
  readonly slug: string;
  readonly nom: string;
  readonly role: string;
  readonly quandUtiliser: string | null;
  readonly perimetre: ReadonlyArray<string>;
}

/**
 * Traduit des motifs de chemin en une phrase française.
 *
 * Le repli garde le motif brut plutôt que d'inventer : un périmètre inconnu
 * affiché de travers ferait croire à une protection qui n'est pas celle-là.
 */
function decrirePerimetre(motifs: ReadonlyArray<string>): string {
  const connus: ReadonlyArray<readonly [string, string]> = [
    ["**/*.md", "les fichiers de documentation"],
    ["docs/**", "le dossier de documentation"],
    ["**/*.test.ts", "les fichiers de test"],
    ["**/*.tsx", "les fichiers d'interface"],
  ];
  const phrases = motifs.map(
    (motif) => connus.find(([cle]) => cle === motif)?.[1] ?? `« ${motif} »`,
  );
  const uniques = [...new Set(phrases)];
  const liste =
    uniques.length <= 1
      ? (uniques[0] ?? "")
      : `${uniques.slice(0, -1).join(", ")} et ${uniques.at(-1)}`;
  return `Écrit librement dans ${liste}`;
}

/**
 * Le mode de travail — et surtout, ce qu'il INTERDIT.
 *
 * Chaque mode annonce son périmètre en clair, parce que c'est le seul détail
 * qui compte au moment de choisir : « Revue » n'est pas une intention polie,
 * c'est une impossibilité d'écrire. Le libellé dit donc l'interdiction, pas
 * l'intention.
 *
 * Silencieux tant qu'aucun mode restrictif n'est posé : un badge permanent
 * pour dire « rien n'est restreint » serait du bruit.
 */
function useModeTravail() {
  const [disponibles, setDisponibles] = useState<ReadonlyArray<ModeDisponible>>([]);
  const [actif, setActif] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);

  const relire = useCallback(async () => {
    try {
      const reponse = await fetch(resolvePrimaryEnvironmentHttpUrl(MODE_PATH), {
        cache: "no-store",
      });
      if (!reponse.ok) return;
      const etat = (await reponse.json()) as {
        actif: string | null;
        disponibles: ReadonlyArray<ModeDisponible>;
      };
      setDisponibles(etat.disponibles);
      setActif(etat.actif);
    } catch {
      // Serveur local absent : le sélecteur reste muet plutôt que menteur.
    }
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  const poser = useCallback(async (slug: string | null) => {
    try {
      const reponse = await fetch(resolvePrimaryEnvironmentHttpUrl(MODE_PATH), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const corps = (await reponse.json()) as {
        pose?: boolean;
        comptes?: number;
        comptesTotal?: number;
        comptesSautes?: number;
        raison?: string;
      };
      if (corps.pose !== true) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Mode non appliqué",
            description: corps.raison ?? "Le serveur local a refusé.",
          }),
        );
        return;
      }
      setActif(slug);
      setOuvert(false);
      // Le nombre de comptes touchés est DIT : un mode qui ne s'applique à
      // rien (aucun compte avec dossier propre) ressemblerait à un succès.
      toastManager.add(
        stackedThreadToast({
          type: corps.comptes === 0 ? "error" : "info",
          title: corps.comptes === 0 ? "Mode sans effet" : "Mode appliqué",
          description:
            corps.comptes === 0
              ? "Aucun compte n'a de dossier de configuration propre — rien n'a été restreint."
              : // La portée EXACTE, comptes sautés compris. On disait « 3 comptes »
                // sans dire sur combien — or un compte sans dossier propre est
                // SAUTÉ, et sur cette machine c'est le principal : douze des
                // quatorze fils actifs continuaient d'écrire malgré la
                // bannière « partout » (audit 30/07).
                (corps.comptesSautes ?? 0) > 0
                ? `${corps.comptes} compte${(corps.comptes ?? 0) > 1 ? "s" : ""} sur ${corps.comptesTotal} — ${corps.comptesSautes} sans dossier propre n'${(corps.comptesSautes ?? 0) > 1 ? "ont" : "a"} PAS été restreint${(corps.comptesSautes ?? 0) > 1 ? "s" : ""}.`
                : `${corps.comptes} compte${(corps.comptes ?? 0) > 1 ? "s" : ""} sur ${corps.comptesTotal} — tous restreints.`,
        }),
      );
    } catch {
      toastManager.add(
        stackedThreadToast({ type: "error", title: "Le serveur local n'a pas répondu" }),
      );
    }
  }, []);

  const modeActif = disponibles.find((mode) => mode.slug === actif) ?? null;
  const restreint = (modeActif?.perimetre.length ?? 0) > 0 || modeActif?.slug === "revue";
  return { disponibles, actif, ouvert, setOuvert, poser, modeActif, restreint };
}

/**
 * Le choix des modes — partagé par toutes les surfaces qui l'affichent.
 */
function ModeTravailChoix({
  disponibles,
  actif,
  poser,
}: {
  readonly disponibles: ReadonlyArray<ModeDisponible>;
  readonly actif: string | null;
  readonly poser: (slug: string | null) => Promise<void>;
}) {
  return (
    <>
      {/* Ce que ce réglage EST, dit en une phrase — « je ne sais pas ce que ça
          veut dire » (reproche 30/07). */}
      <p className="px-2.5 pt-1 pb-2 text-xs leading-snug text-muted-foreground">
        Ce que tes agents ont le DROIT de faire, sur tous tes comptes : chaque mode restreint
        l'écriture et les commandes. Il reste actif jusqu'à ce que tu en choisisses un autre.
      </p>
      {disponibles.map((mode) => (
        <button
          key={mode.slug}
          type="button"
          onClick={() => void poser(mode.slug)}
          className={cn(
            "flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent",
            mode.slug === actif && "bg-accent",
          )}
        >
          <span className="text-sm font-medium">{mode.nom}</span>
          <span className="text-xs text-muted-foreground">{mode.role}</span>
          {mode.perimetre.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {decrirePerimetre(mode.perimetre)} — approbation demandée ailleurs
            </span>
          ) : mode.slug === "revue" ? (
            <span className="text-xs text-muted-foreground">Aucune écriture possible</span>
          ) : null}
        </button>
      ))}
    </>
  );
}

/**
 * La variante COMPOSEUR — à côté de Build, là où l'on décide ce qu'un tour a
 * le droit de faire (déplacement fondateur 30/07 : « s'il est utile, il doit
 * être à côté du build »). Amber quand un mode restrictif est posé : un
 * réglage qui désarme les agents doit crier là où l'on tape.
 */
export function ModeTravailComposerControl() {
  const { disponibles, actif, ouvert, setOuvert, poser, modeActif, restreint } = useModeTravail();
  if (disponibles.length === 0) return null;
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Mode de travail : ${modeActif?.nom ?? "aucune restriction"}`}
            // L'explication du mode ACTIF, au survol. `role` et
            // `quandUtiliser` vivent déjà dans la donnée du mode et n'étaient
            // montrés nulle part : un picto bouclier et un mot ne disent pas
            // ce que l'agent a le droit de faire. En `title` plutôt qu'en
            // info-bulle React, pour ne pas envelopper un déclencheur de
            // popover dans un second déclencheur.
            title={
              modeActif
                ? [modeActif.nom, modeActif.role, modeActif.quandUtiliser]
                    .filter(Boolean)
                    .join("\n")
                : "Aucun mode : l'agent n'est restreint sur rien."
            }
            className={cn(
              "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap transition-colors",
              restreint
                ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40 hover:bg-amber-500/25"
                : "text-muted-foreground/70 hover:text-foreground/80",
            )}
          >
            <ShieldIcon className="size-3.5 shrink-0" />
            {/* Le mode ACTIF se lit toujours, pas seulement quand il
                restreint : « Mode » tout court ne dit pas dans lequel on est,
                et l'Atelier — le plus permissif — était justement celui qu'on
                ne voyait jamais nommé. */}
            <span className="hidden sm:inline">{modeActif?.nom ?? "Mode"}</span>
          </button>
        }
      />
      <PopoverPopup side="top" className="w-80 p-1.5">
        <ModeTravailChoix disponibles={disponibles} actif={actif} poser={poser} />
      </PopoverPopup>
    </Popover>
  );
}

/**
 * L'ancienne surface latérale — conservée UNIQUEMENT comme bannière d'alerte
 * quand un mode restrictif est actif : le composeur porte le réglage, la
 * sidebar porte le cri.
 */
export function SidebarModeTravail() {
  const { disponibles, ouvert, setOuvert, actif, poser, modeActif, restreint } = useModeTravail();
  if (disponibles.length === 0 || !restreint) return null;

  return (
    <div className="px-2 pb-1">
      <Popover open={ouvert} onOpenChange={setOuvert}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Mode de travail"
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors",
                // Un mode restrictif DÉSARME tous les agents, sur tous les
                // comptes, dans tous les projets. Il portait un simple liseré
                // gris : le 30/07 le fondateur a passé un tour entier à
                // diagnostiquer « Bash exists but is not enabled in this
                // context » sans faire le lien avec ce bouton. Un réglage qui
                // casse le travail doit CRIER, pas chuchoter.
                restreint
                  ? "h-auto flex-col items-start gap-0.5 bg-amber-500/15 py-1.5 text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-500/25"
                  : "h-7 text-sidebar-foreground/55 hover:bg-sidebar-row-hover",
              )}
            >
              <span className="flex w-full items-center gap-2">
                <ShieldIcon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                  {modeActif?.nom ?? "Mode de travail"}
                </span>
              </span>
              {restreint ? (
                <span className="pl-[22px] text-[11px] leading-tight text-amber-200/80">
                  {modeActif?.slug === "revue"
                    ? "Tes agents ne peuvent NI écrire NI lancer de commande."
                    : "Écriture restreinte pour tes agents."}
                </span>
              ) : null}
            </button>
          }
        />
        <PopoverPopup className="w-80 p-1.5">
          <ModeTravailChoix disponibles={disponibles} actif={actif} poser={poser} />
        </PopoverPopup>
      </Popover>
    </div>
  );
}
