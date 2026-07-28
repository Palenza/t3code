/**
 * Turns the payload of the backend's /api/tableau-local/etat into something
 * renderable. The payload merges two independent local sources:
 *
 *   - `affiliation` — Palenza's structured affiliation state
 *     (`data/etat-affiliation.json`, written by `scripts/etat-affiliation.mjs`
 *     from LIVE network APIs, self-stamped with `genere_le`);
 *   - `tableau` — the local `cc-tableau` dashboard (127.0.0.1:8318), of which
 *     only the repository pane is shown here.
 *
 * Both come from outside this repo, so nothing about their shape is trusted:
 * every field is re-checked, a malformed part is dropped, and a fully
 * unreadable payload degrades to the same "muet" state as an unreachable
 * server — the view never breaks, and never presents a guess as a fact.
 *
 * Per-account quota gauges already exist on the provider cards and are
 * deliberately not duplicated here.
 */

export interface ReseauAffiliationVue {
  readonly nom: string;
  /** e.g. "22 acceptés · 36 en attente" — only non-zero parts are named. */
  readonly compteurs: string | null;
  readonly acceptes: ReadonlyArray<string>;
  readonly attente: ReadonlyArray<string>;
  readonly refuses: ReadonlyArray<string>;
  /** Names the network's API cannot classify (e.g. Kwanko pending-or-refused). */
  readonly indetermines: ReadonlyArray<string>;
  readonly note: string | null;
}

export interface AffiliationVue {
  /** Age of the generation run, always attached — a state without a date is a claim. */
  readonly ageLabel: string;
  /** Cross-network totals, e.g. "54 acceptés · 53 en attente · 9 refusés". */
  readonly totalLabel: string;
  readonly reseaux: ReadonlyArray<ReseauAffiliationVue>;
}

export interface LimiteCompteVue {
  readonly nom: string;
  /** Rounded display label, e.g. "94 %" — never invented, absent limits are dropped. */
  readonly pctLabel: string;
  /** Clamped to 0–100 for the bar; a bar cannot be 103 % long. */
  readonly barPct: number;
  readonly tone: "normal" | "warning" | "critical";
  readonly resetLabel: string | null;
}

export interface CompteClaudeVue {
  readonly label: string;
  readonly email: string;
  readonly actif: boolean;
  /** cc-tableau's own honest state ("jeton périmé…", "endpoint saturé…") — null when "ok". */
  readonly etat: string | null;
  readonly ageLabel: string | null;
  readonly limites: ReadonlyArray<LimiteCompteVue>;
}

export interface TableauDepotVue {
  readonly branche: string;
  /** e.g. "62 commit(s) non déployé(s) · 117 fichier(s) modifié(s)" */
  readonly etatLabel: string | null;
}

export interface TableauLocalVue {
  readonly comptes: ReadonlyArray<CompteClaudeVue> | null;
  readonly affiliation: AffiliationVue | null;
  readonly depot: TableauDepotVue | null;
  /** Server-side timestamp of the dashboard snapshot, as served. */
  readonly instant: string | null;
}

export type TableauLocalEtat =
  | { readonly kind: "muet"; readonly raison: string }
  | { readonly kind: "present"; readonly vue: TableauLocalVue };

/** The one wording for a dashboard that cannot be read, wherever it comes from. */
export const TABLEAU_MUET_TITRE = "Tableau local muet";
export const RAISON_INJOIGNABLE =
  "Ni le tableau local (127.0.0.1:8318) ni l'état d'affiliation ne répondent.";
export const RAISON_ILLISIBLE = "Le tableau local a répondu, mais sa réponse est illisible.";

export const formatAgeReleve = (ageMin: number | null): string => {
  if (ageMin === null || !Number.isFinite(ageMin) || ageMin < 0) {
    return "âge du relevé inconnu";
  }
  const minutes = Math.floor(ageMin);
  if (minutes < 1) {
    return "relevé à l'instant";
  }
  if (minutes < 60) {
    return `relevé il y a ${minutes} min`;
  }
  const heures = Math.floor(minutes / 60);
  if (heures < 48) {
    return heures === 1 ? "relevé il y a 1 h" : `relevé il y a ${heures} h`;
  }
  return `relevé il y a ${Math.floor(heures / 24)} j`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/** cc-tableau serves counts sometimes as numbers, sometimes as strings ("62"). */
const readCount = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
};

const readStringList = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.flatMap((v) => (readString(v) === null ? [] : [v as string])) : [];

const compteur = (n: number, singulier: string, pluriel = `${singulier}s`): string =>
  `${n} ${n === 1 ? singulier : pluriel}`;

const parseReseau = (value: unknown): ReseauAffiliationVue | null => {
  if (!isRecord(value)) {
    return null;
  }
  const nom = readString(value.reseau);
  if (nom === null) {
    return null;
  }
  const acceptes = readStringList(value.acceptes);
  const attente = readStringList(value.attente);
  const refuses = readStringList(value.refuses);
  const indetermines = readStringList(value.indetermines);
  const morceaux = [
    ...(acceptes.length > 0 ? [compteur(acceptes.length, "accepté")] : []),
    ...(attente.length > 0 ? [`${attente.length} en attente`] : []),
    ...(refuses.length > 0 ? [compteur(refuses.length, "refusé")] : []),
    ...(indetermines.length > 0 ? [`${indetermines.length} à trancher au dashboard`] : []),
  ];
  return {
    nom,
    compteurs: morceaux.length === 0 ? null : morceaux.join(" · "),
    acceptes,
    attente,
    refuses,
    indetermines,
    note: readString(value.note),
  };
};

const parseAffiliation = (value: unknown, now: number): AffiliationVue | null => {
  if (!isRecord(value)) {
    return null;
  }
  const reseaux = Array.isArray(value.reseaux)
    ? value.reseaux.flatMap((r) => {
        const parsed = parseReseau(r);
        return parsed === null ? [] : [parsed];
      })
    : [];
  if (reseaux.length === 0) {
    return null;
  }
  const genereLe = readString(value.genere_le);
  const genereMs = genereLe === null ? Number.NaN : Date.parse(genereLe);
  const ageMin = Number.isNaN(genereMs) ? null : Math.max(0, (now - genereMs) / 60_000);
  const total = (lire: (r: ReseauAffiliationVue) => ReadonlyArray<string>): number =>
    reseaux.reduce((somme, r) => somme + lire(r).length, 0);
  const nAcceptes = total((r) => r.acceptes);
  const nAttente = total((r) => r.attente);
  const nRefuses = total((r) => r.refuses);
  return {
    ageLabel: formatAgeReleve(ageMin),
    totalLabel: [
      compteur(nAcceptes, "accepté"),
      `${nAttente} en attente`,
      compteur(nRefuses, "refusé"),
    ].join(" · "),
    reseaux,
  };
};

/** cc-tableau thresholds: 50 % warns, 85 % is the wall. */
const toneForPct = (pct: number): LimiteCompteVue["tone"] =>
  pct >= 85 ? "critical" : pct >= 50 ? "warning" : "normal";

const formatReset = (value: unknown): string | null => {
  const iso = readString(value);
  if (iso === null) {
    return null;
  }
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) {
    return null;
  }
  return `remise à zéro ${new Date(instant).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const parseLimite = (value: unknown): LimiteCompteVue | null => {
  if (!isRecord(value)) {
    return null;
  }
  const nom = readString(value.nom);
  const pct = typeof value.pct === "number" && Number.isFinite(value.pct) ? value.pct : null;
  if (nom === null || pct === null) {
    return null;
  }
  return {
    nom,
    pctLabel: `${Math.round(pct)} %`,
    barPct: Math.max(0, Math.min(100, pct)),
    tone: toneForPct(pct),
    resetLabel: formatReset(value.reset),
  };
};

const parseComptes = (value: unknown): ReadonlyArray<CompteClaudeVue> | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const comptes = value.flatMap((compte): CompteClaudeVue[] => {
    if (!isRecord(compte)) {
      return [];
    }
    const email = readString(compte.email);
    if (email === null) {
      return [];
    }
    const etat = readString(compte.etat);
    const ageMin =
      typeof compte.mesure_age_min === "number" && Number.isFinite(compte.mesure_age_min)
        ? compte.mesure_age_min
        : null;
    return [
      {
        label: readString(compte.label) ?? "?",
        email,
        actif: compte.actif === true,
        etat: etat === "ok" ? null : etat,
        ageLabel: ageMin === null ? null : formatAgeReleve(ageMin).replace("relevé", "mesuré"),
        limites: Array.isArray(compte.limites)
          ? compte.limites.flatMap((l) => {
              const parsed = parseLimite(l);
              return parsed === null ? [] : [parsed];
            })
          : [],
      },
    ];
  });
  return comptes.length === 0 ? null : comptes;
};

const parseDepot = (value: unknown): TableauDepotVue | null => {
  if (!isRecord(value)) {
    return null;
  }
  const branche = readString(value.branche);
  if (branche === null) {
    return null;
  }
  const devant = readCount(value.devant);
  const sale = readCount(value.sale);
  const morceaux = [
    ...(devant === null ? [] : [`${devant} commit(s) non déployé(s)`]),
    ...(sale === null ? [] : [`${sale} fichier(s) modifié(s)`]),
  ];
  return { branche, etatLabel: morceaux.length === 0 ? null : morceaux.join(" · ") };
};

export const presentTableauLocal = (payload: unknown, now: number): TableauLocalEtat => {
  if (!isRecord(payload)) {
    return { kind: "muet", raison: RAISON_ILLISIBLE };
  }
  const affiliation = parseAffiliation(payload.affiliation, now);
  const tableau = isRecord(payload.tableau) ? payload.tableau : null;
  const comptes = tableau === null ? null : parseComptes(tableau.quotas);
  const depot = tableau === null ? null : parseDepot(tableau.git);
  // A payload carrying no pane at all has nothing honest to show: stay muet
  // rather than render an empty shell that looks like "all clear".
  if (comptes === null && affiliation === null && depot === null) {
    return { kind: "muet", raison: RAISON_ILLISIBLE };
  }
  return {
    kind: "present",
    vue: {
      comptes,
      affiliation,
      depot,
      instant: tableau === null ? null : readString(tableau.instant),
    },
  };
};
