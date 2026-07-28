import { GitBranchIcon, HandshakeIcon, RefreshCwIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import {
  RAISON_ILLISIBLE,
  RAISON_INJOIGNABLE,
  TABLEAU_MUET_TITRE,
  presentTableauLocal,
  type CompteClaudeVue,
  type ReseauAffiliationVue,
  type TableauLocalEtat,
} from "./tableauLocal";

const TONE_BAR: Record<CompteClaudeVue["limites"][number]["tone"], string> = {
  normal: "bg-muted-foreground/60",
  warning: "bg-warning",
  critical: "bg-destructive",
};

const TONE_TEXT: Record<CompteClaudeVue["limites"][number]["tone"], string> = {
  normal: "text-muted-foreground/80",
  warning: "text-warning",
  critical: "text-destructive",
};

const TABLEAU_PATH = "/api/tableau-local/etat";
const FETCH_TIMEOUT_MS = 5_000;
/** Same cadence as the dashboard's own page. */
const POLL_INTERVAL_MS = 60_000;

async function lireTableauLocal(): Promise<TableauLocalEtat> {
  let response: Response;
  try {
    response = await fetch(resolvePrimaryEnvironmentHttpUrl(TABLEAU_PATH), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { kind: "muet", raison: RAISON_INJOIGNABLE };
  }
  if (!response.ok) {
    return { kind: "muet", raison: RAISON_INJOIGNABLE };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "muet", raison: RAISON_ILLISIBLE };
  }
  return presentTableauLocal(payload, Date.now());
}

function LigneEtat({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <div className="rounded-xl px-3 py-2 sm:px-4">
      <div className="text-[13px] font-medium tracking-[-0.005em] text-foreground">{cle}</div>
      <p className="max-w-xl text-[13px] leading-[1.45] text-muted-foreground/80">{valeur}</p>
    </div>
  );
}

function CompteBloc({ compte }: { compte: CompteClaudeVue }) {
  return (
    <div className="rounded-xl px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-medium tracking-[-0.005em] text-foreground">
          {compte.label}
        </span>
        <span className="text-xs text-muted-foreground">{compte.email}</span>
        {compte.actif ? (
          <span className="rounded-full border border-border px-1.5 text-[10px] leading-4 text-muted-foreground">
            actif
          </span>
        ) : null}
      </div>
      {compte.etat !== null ? (
        <p className="max-w-xl text-[12px] leading-[1.45] text-warning">{compte.etat}</p>
      ) : null}
      <div className="mt-1.5 grid max-w-xl gap-1.5">
        {compte.limites.map((limite) => (
          <div key={limite.nom} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
              <span className="text-muted-foreground/70">{limite.nom}</span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                {limite.resetLabel ? (
                  <span className="text-muted-foreground/50">{limite.resetLabel}</span>
                ) : null}
                <span className={cn("font-medium tabular-nums", TONE_TEXT[limite.tone])}>
                  {limite.pctLabel}
                </span>
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(limite.barPct)}
              aria-label={`${limite.nom} utilisé`}
            >
              <div
                className={cn("h-full rounded-full", TONE_BAR[limite.tone])}
                style={{ width: `${limite.barPct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {compte.ageLabel !== null ? (
        <p className="pt-1 text-[10px] leading-4 text-muted-foreground/50">{compte.ageLabel}</p>
      ) : null}
    </div>
  );
}

function ReseauBloc({ reseau }: { reseau: ReseauAffiliationVue }) {
  return (
    <div className="rounded-xl px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-medium tracking-[-0.005em] text-foreground">
          {reseau.nom}
        </span>
        {reseau.compteurs !== null ? (
          <span className="text-xs text-muted-foreground">{reseau.compteurs}</span>
        ) : null}
      </div>
      {reseau.acceptes.length > 0 ? (
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground/80">
          <span className="text-foreground/70">Acceptés :</span> {reseau.acceptes.join(" · ")}
        </p>
      ) : null}
      {reseau.attente.length > 0 ? (
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground/60">
          <span className="text-foreground/70">En attente :</span> {reseau.attente.join(" · ")}
        </p>
      ) : null}
      {reseau.refuses.length > 0 ? (
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground/60">
          <span className="text-foreground/70">Refusés :</span> {reseau.refuses.join(" · ")}
        </p>
      ) : null}
      {reseau.indetermines.length > 0 ? (
        <p className="max-w-2xl text-[13px] leading-[1.45] text-muted-foreground/60">
          <span className="text-foreground/70">À trancher :</span> {reseau.indetermines.join(" · ")}
        </p>
      ) : null}
      {reseau.note !== null ? (
        <p className="max-w-2xl text-xs leading-[1.45] text-muted-foreground/50">{reseau.note}</p>
      ) : null}
    </div>
  );
}

export function TableauLocalSettingsPanel() {
  const [etat, setEtat] = useState<TableauLocalEtat | null>(null);
  // Guards against an older in-flight read landing after a newer one.
  const generationRef = useRef(0);

  const rafraichir = useCallback(async () => {
    const generation = ++generationRef.current;
    const prochain = await lireTableauLocal();
    if (generationRef.current === generation) {
      setEtat(prochain);
    }
  }, []);

  useEffect(() => {
    void rafraichir();
    const id = setInterval(() => void rafraichir(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      // Any read still in flight is now stale by definition.
      generationRef.current += 1;
    };
  }, [rafraichir]);

  const boutonRafraichir = (
    <Button size="xs" variant="ghost" onClick={() => void rafraichir()}>
      <RefreshCwIcon className="mx-1 size-3.5" />
      Rafraîchir
    </Button>
  );

  return (
    <SettingsPageContainer>
      {etat === null ? (
        <p className="px-3 text-sm text-muted-foreground sm:px-4">Lecture du tableau local…</p>
      ) : etat.kind === "muet" ? (
        <SettingsSection title={TABLEAU_MUET_TITRE} headerAction={boutonRafraichir}>
          <div className="mx-3 rounded-xl border border-dashed border-border px-4 py-6 sm:mx-4">
            <p className="text-sm text-muted-foreground">{etat.raison}</p>
            <p className="pt-1 text-[13px] text-muted-foreground/70">
              La vue se remplira d'elle-même dès que les sources répondront.
            </p>
          </div>
        </SettingsSection>
      ) : (
        <>
          {etat.vue.comptes !== null ? (
            <SettingsSection
              title="Comptes Claude"
              icon={<UsersIcon className="size-4.5" />}
              headerAction={boutonRafraichir}
            >
              {etat.vue.comptes.map((compte) => (
                <CompteBloc key={`${compte.label}-${compte.email}`} compte={compte} />
              ))}
            </SettingsSection>
          ) : null}
          {etat.vue.affiliation !== null ? (
            <SettingsSection
              title="Affiliation"
              icon={<HandshakeIcon className="size-4.5" />}
              headerAction={etat.vue.comptes === null ? boutonRafraichir : undefined}
            >
              <p className="px-3 text-xs text-muted-foreground sm:px-4">
                {etat.vue.affiliation.totalLabel} — {etat.vue.affiliation.ageLabel}
              </p>
              {etat.vue.affiliation.reseaux.map((reseau) => (
                <ReseauBloc key={reseau.nom} reseau={reseau} />
              ))}
            </SettingsSection>
          ) : null}
          {etat.vue.depot !== null ? (
            <SettingsSection
              title="Dépôt"
              icon={<GitBranchIcon className="size-4.5" />}
              headerAction={etat.vue.affiliation === null ? boutonRafraichir : undefined}
            >
              <LigneEtat cle="Branche" valeur={etat.vue.depot.branche} />
              {etat.vue.depot.etatLabel !== null ? (
                <LigneEtat cle="Non déployé" valeur={etat.vue.depot.etatLabel} />
              ) : null}
            </SettingsSection>
          ) : null}
          {etat.vue.instant !== null ? (
            <p className="px-3 text-xs text-muted-foreground/70 sm:px-4">
              Instantané du tableau : {etat.vue.instant}
            </p>
          ) : null}
        </>
      )}
    </SettingsPageContainer>
  );
}
