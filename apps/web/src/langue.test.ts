// @effect-diagnostics nodeBuiltinImport:off - Le garde de câblage LIT les sources : disque brut, pas de couche Effect.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  DICTIONNAIRE,
  ETIQUETTE_DE_LANGUE,
  LANGUES_CHOISISSABLES,
  langueEffective,
  t,
  useLangueStore,
} from "./langue";
import { racineDuDepot } from "./racineDuDepot";

const LANGUES_RENDUES = ["en", "fr"] as const;

describe("aucune langue à trous", () => {
  // La demande d'Enzo, mot pour mot : « check que les mots ne sont pas du
  // non-sens dans une autre langue ». On ne peut pas juger le SENS par
  // programme — mais on peut interdire la forme la plus courante du non-sens :
  // une clé traduite d'un côté et pas de l'autre, qui laisse l'interface
  // mi-anglaise mi-française. Une UI à moitié traduite est pire que pas
  // traduite : elle a l'air cassée plutôt qu'assumée.
  const cles = Object.keys(DICTIONNAIRE) as ReadonlyArray<keyof typeof DICTIONNAIRE>;

  it("il y a bien un dictionnaire à inspecter", () => {
    // Sans ce plancher, tous les tests suivants passeraient sur zéro clé — un
    // vert qui ne prouve rien, et qui se cite quand même.
    expect(cles.length).toBeGreaterThanOrEqual(10);
  });

  it("chaque clé porte TOUTES les langues, et aucune n'est vide", () => {
    const manquantes: string[] = [];
    for (const cle of cles) {
      for (const langue of LANGUES_RENDUES) {
        const texte = DICTIONNAIRE[cle][langue];
        if (typeof texte !== "string" || texte.trim().length === 0) {
          manquantes.push(`${cle} → ${langue}`);
        }
      }
    }
    expect(
      manquantes,
      manquantes.length === 0
        ? ""
        : `Ces textes manquent ou sont vides :\n${manquantes.join("\n")}\n\n` +
            `Une clé traduite d'un côté seulement laisse l'écran à moitié dans ` +
            `l'autre langue — le lecteur croit à un bug, pas à un choix.`,
    ).toEqual([]);
  });

  it("aucune traduction n'est la simple recopie de l'autre", () => {
    // Une entrée identique dans les deux langues est presque toujours un
    // oubli : on a dupliqué la ligne et on n'est jamais revenu traduire. Les
    // vrais mots identiques entre FR et EN existent, mais ils sont rares —
    // l'échappatoire est de les nommer ici, pas de laisser passer la classe.
    const IDENTIQUES_ASSUMEES = new Set<string>();
    // ⚠️ Les deux textes sont comparés en `string`, pas dans leurs types
    // littéraux. Écrit naïvement, `DICTIONNAIRE[cle].en === DICTIONNAIRE[cle].fr`
    // ne compile même pas : TypeScript sait que les littéraux actuels diffèrent
    // et déclare la comparaison sans objet. Il avait raison — le test n'aurait
    // rien pu attraper AUJOURD'HUI, et c'est demain qu'il sert, quand quelqu'un
    // dupliquera une ligne sans traduire.
    const suspectes = cles.filter((cle) => {
      const en: string = DICTIONNAIRE[cle].en;
      const fr: string = DICTIONNAIRE[cle].fr;
      return en === fr && !IDENTIQUES_ASSUMEES.has(cle);
    });
    expect(
      suspectes,
      suspectes.length === 0
        ? ""
        : `Ces clés ont le MÊME texte dans les deux langues :\n${suspectes.join("\n")}`,
    ).toEqual([]);
  });

  it("le menu nomme chaque langue DANS sa langue", () => {
    // Écrire « French » à un francophone lui demande de traduire pour se
    // retrouver. Convention de tous les systèmes.
    expect(ETIQUETTE_DE_LANGUE.fr).toBe("Français");
    expect(ETIQUETTE_DE_LANGUE.en).toBe("English");
    for (const langue of LANGUES_CHOISISSABLES) {
      expect(ETIQUETTE_DE_LANGUE[langue]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("le choix de la langue", () => {
  it("« système » suit l'OS, et tout ce qui n'est pas français rend l'anglais", () => {
    expect(langueEffective("systeme", "fr-FR")).toBe("fr");
    expect(langueEffective("systeme", "FR")).toBe("fr");
    expect(langueEffective("systeme", "en-US")).toBe("en");
    expect(langueEffective("systeme", "de-DE")).toBe("en");
    // Pas de langue système lisible : on ne devine pas, on prend l'anglais —
    // la langue de l'amont, donc celle du reste de l'écran.
    expect(langueEffective("systeme", undefined)).toBe("en");
  });

  it("un choix explicite l'emporte sur l'OS", () => {
    expect(langueEffective("fr", "en-US")).toBe("fr");
    expect(langueEffective("en", "fr-FR")).toBe("en");
  });

  it("`t` rend bien la langue courante du magasin", () => {
    const avant = useLangueStore.getState().langue;
    try {
      useLangueStore.getState().setLangue("fr");
      expect(t("langue.titre")).toBe("Langue");
      useLangueStore.getState().setLangue("en");
      expect(t("langue.titre")).toBe("Language");
    } finally {
      useLangueStore.getState().setLangue(avant);
    }
  });
});

describe("le câblage, qui doit survivre aux fusions de l'amont", () => {
  const lire = (chemin: string) =>
    NodeFS.readFileSync(NodePath.join(racineDuDepot(), chemin), "utf8");

  it("l'écran General porte encore le sélecteur de langue", () => {
    const source = lire("apps/web/src/components/settings/SettingsPanels.tsx");
    expect(/\bsearchableSetting\("raptor-language"\)/u.test(source)).toBe(true);
    expect(/\buseLangueStore\(/u.test(source)).toBe(true);
  });

  it("la recherche des réglages connaît la langue", () => {
    // Un réglage introuvable par la recherche est un réglage qui n'existe pas
    // pour qui ne sait pas déjà où il est (leçon du 02/08 : 4 sections sur 12
    // manquaient à l'index).
    const source = lire("apps/web/src/components/settings/settingsSearch.ts");
    expect(/id: "raptor-language"/u.test(source)).toBe(true);
  });

  it("les textes migrés passent bien par le dictionnaire", () => {
    // Frontière de jeton, pas sous-chaîne : un renommage doit tomber.
    for (const [chemin, cle] of [
      ["apps/web/src/components/settings/ThemeSettings.tsx", "theme.sidebar.titre"],
      ["apps/web/src/components/settings/VoiceSettingsPanel.tsx", "dictee.titre"],
      ["apps/web/src/components/settings/TableauLocalSettings.tsx", "tableau.acceptes"],
    ] as const) {
      expect(new RegExp(`t\\("${cle}"\\)`, "u").test(lire(chemin)), chemin).toBe(true);
    }
  });
});
