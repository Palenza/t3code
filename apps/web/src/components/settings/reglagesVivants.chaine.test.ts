// @effect-diagnostics nodeBuiltinImport:off - Ce garde LIT les sources des panneaux de réglages : il lui faut le disque brut, pas une couche Effect.
/**
 * UN RÉGLAGE QUI S'AFFICHE EST UN RÉGLAGE QUI AGIT.
 *
 * Demande fondateur du 02/08 : « chaque toggle, chaque option cliquée doit
 * être effectivement activée ou désactivée ou implémentée — pas du
 * cosmétique ».
 *
 * Le cas qui a motivé ce garde vivait dans `SourceControlSettings.tsx` :
 *
 *     <Switch checked={enabled} disabled aria-label={`${item.label} availability`} />
 *
 * Il ne réglait rien. Il RAPPORTAIT une disponibilité, en empruntant la forme
 * d'un contrôle. C'est la pire sorte de mensonge d'interface, parce qu'il est
 * silencieux : rien ne casse, aucun test ne rougit, et l'utilisateur clique
 * sur un objet qui a promis un geste inexistant. Sur un écran de RÉGLAGES, la
 * promesse est d'autant plus crédible que tout autour est vrai.
 *
 * Ce test refuse donc tout interrupteur sans gestionnaire. Un état qui doit
 * seulement se LIRE se dessine autrement — une pastille, un badge, une phrase.
 *
 * ── Ce que ce garde ne prétend pas ───────────────────────────────────────
 *
 * Il vérifie qu'un gestionnaire EXISTE, pas qu'il écrit quelque chose d'utile.
 * Un `onCheckedChange={() => {}}` passerait. C'est un fil-piège contre
 * l'oubli, pas une preuve de câblage — celle-là se fait par les tests de
 * chaque panneau.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { racineDuDepot } from "../../racineDuDepot.ts";

const DOSSIER_REGLAGES = "apps/web/src/components/settings";

/**
 * L'échappatoire, et elle doit rester CHÈRE à écrire.
 *
 * Un interrupteur volontairement inerte — s'il en existe un jour un bon
 * exemple — porte ce marqueur sur la même ligne ou juste au-dessus, avec sa
 * raison. Le mot est long exprès : on ne le tape pas par réflexe.
 */
const MARQUEUR_ASSUME = "reglage-inerte-assume:";

function fichiersDeReglages(racine: string): string[] {
  const dossier = NodePath.join(racine, DOSSIER_REGLAGES);
  return NodeFS.readdirSync(dossier)
    .filter((nom) => nom.endsWith(".tsx") && !nom.includes(".test."))
    .map((nom) => NodePath.join(dossier, nom));
}

/**
 * Les balises ouvrantes d'un composant, avec leur ligne et leur texte ENTIER.
 *
 * ⚠️ Le piège qui rendait la première version fausse : `=>` contient un `>`.
 * Chercher naïvement le premier `>` tronque la balise au milieu du premier
 * gestionnaire — donc un `onValueChange={(v) => …}` disparaît de la fenêtre
 * examinée, et le contrôle est déclaré inerte alors qu'il est câblé. Ça
 * passait par chance sur les interrupteurs, dont le nom d'attribut précède la
 * flèche.
 *
 * On suit donc la PROFONDEUR d'accolades : la balise se ferme au premier `>`
 * rencontré à la profondeur zéro, hors chaîne de caractères.
 */
function balises(contenu: string, nom: string): ReadonlyArray<{ ligne: number; texte: string }> {
  const trouves: Array<{ ligne: number; texte: string }> = [];
  let depuis = 0;

  for (;;) {
    const debut = contenu.indexOf(`<${nom}`, depuis);
    if (debut === -1) break;

    // `<Select` ne doit pas attraper `<SelectTrigger` : le caractère qui suit
    // le nom doit être un blanc, un `>` ou un `/`.
    const suivant = contenu[debut + nom.length + 1] ?? "";
    if (/[A-Za-z0-9]/.test(suivant)) {
      depuis = debut + nom.length + 1;
      continue;
    }

    let profondeur = 0;
    let guillemet: string | null = null;
    let fin = -1;

    for (let i = debut + 1; i < contenu.length; i += 1) {
      const c = contenu[i];
      if (guillemet) {
        if (c === guillemet && contenu[i - 1] !== "\\") guillemet = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        guillemet = c;
        continue;
      }
      if (c === "{") profondeur += 1;
      else if (c === "}") profondeur -= 1;
      else if (c === ">" && profondeur === 0) {
        fin = i + 1;
        break;
      }
    }
    if (fin === -1) break;

    trouves.push({
      ligne: contenu.slice(0, debut).split("\n").length,
      texte: contenu.slice(debut, fin),
    });
    depuis = fin;
  }

  return trouves;
}

const interrupteurs = (contenu: string) => balises(contenu, "Switch");

/**
 * Le marqueur doit vivre DANS LE COMMENTAIRE ATTACHÉ au contrôle.
 *
 * Première version : « sur la ligne ou celle d'avant ». Trop étroit — une
 * exception qui mérite d'être écrite mérite d'être EXPLIQUÉE, donc elle tient
 * rarement en une ligne. Et trop large serait pire : un marqueur perdu
 * quarante lignes plus haut couvrirait un contrôle sans rapport.
 *
 * On remonte donc tant qu'on est dans le bloc de commentaire qui précède
 * immédiatement — lignes de commentaire ou lignes vides — et on s'arrête à la
 * première ligne de code. L'exception reste collée à ce qu'elle excuse.
 */
function estAssume(lignes: ReadonlyArray<string>, ligne: number): boolean {
  // Piège trouvé en écrivant ce garde : dans un commentaire JSX
  // `{/* … */}`, les lignes INTÉRIEURES sont du texte nu — ni `//`, ni `*`.
  // Un détecteur qui reconnaît les commentaires ligne par ligne s'arrête donc
  // à la première, et une exception parfaitement documentée passe pour un
  // oubli. On suit le BLOC, pas la ligne.
  let dansBloc = false;

  for (let index = ligne - 2; index >= 0; index -= 1) {
    const texte = (lignes[index] ?? "").trim();

    if (texte.includes(MARQUEUR_ASSUME)) return true;

    // On remonte : on rencontre donc la FIN du bloc avant son début.
    if (texte.endsWith("*/}") || texte.endsWith("*/")) {
      dansBloc = true;
      continue;
    }
    if (dansBloc) {
      // Le début du bloc ferme la fenêtre : au-delà, le commentaire ne parle
      // plus de ce contrôle-ci.
      if (texte.startsWith("{/*") || texte.startsWith("/*")) return false;
      continue;
    }

    if (texte.length === 0) continue;
    if (texte.startsWith("//")) continue;
    // Une ligne de code au-dessus : il n'y a pas de commentaire attaché.
    return false;
  }

  return false;
}

describe("les réglages agissent, ils ne décorent pas", () => {
  const racine = racineDuDepot();
  const fichiers = fichiersDeReglages(racine);

  it("il y a bien des panneaux à inspecter", () => {
    // Sans ce garde, les tests suivants passeraient sur une liste vide — un
    // vert qui ne prouve rien, et qui se cite quand même.
    expect(
      fichiers.length,
      `Aucun panneau trouvé dans ${DOSSIER_REGLAGES} — ce test regarde-t-il au bon endroit ?`,
    ).toBeGreaterThan(5);
  });

  it("le lecteur de balises TROUVE vraiment les contrôles", () => {
    // Le mode de panne le plus vicieux d'un fil-piège : un analyseur qui ne
    // reconnaît plus rien. Tout devient vert, et le vert se cite. On exige
    // donc un plancher — mesuré le 02/08 : 27 interrupteurs, 18 listes.
    let vusInterrupteurs = 0;
    let vusListes = 0;
    for (const chemin of fichiers) {
      const contenu = NodeFS.readFileSync(chemin, "utf8");
      vusInterrupteurs += interrupteurs(contenu).length;
      vusListes += balises(contenu, "Select").length;
    }

    expect(
      vusInterrupteurs,
      `Le lecteur ne voit plus que ${vusInterrupteurs} interrupteur(s) — il en existait 27. ` +
        `S'il en reste si peu, c'est l'ANALYSEUR qui est cassé, pas le code.`,
    ).toBeGreaterThanOrEqual(20);
    expect(
      vusListes,
      `Le lecteur ne voit plus que ${vusListes} liste(s) — il en existait 18.`,
    ).toBeGreaterThanOrEqual(12);

    // Et il ne doit pas confondre `<Select` avec `<SelectTrigger` : sinon le
    // compte gonfle et la vérification porte sur des balises sans état.
    const unExemple = NodeFS.readFileSync(
      NodePath.join(racine, DOSSIER_REGLAGES, "SettingsPanels.tsx"),
      "utf8",
    );
    for (const { texte } of balises(unExemple, "Select")) {
      // Le caractère qui suit le nom ne doit pas être alphanumérique — sinon
      // c'est `<SelectTrigger` ou `<SelectItem`, pas la racine.
      const apresLeNom = texte.charAt("<Select".length);
      expect(/[A-Za-z0-9]/.test(apresLeNom), `balise mal reconnue : ${texte.slice(0, 40)}`).toBe(
        false,
      );
    }
  });

  it("aucun interrupteur n'est purement décoratif", () => {
    const morts: string[] = [];

    for (const chemin of fichiers) {
      const contenu = NodeFS.readFileSync(chemin, "utf8");
      const lignes = contenu.split("\n");
      for (const { ligne, texte } of interrupteurs(contenu)) {
        if (texte.includes("onCheckedChange")) continue;
        if (estAssume(lignes, ligne)) continue;
        morts.push(
          `${chemin.slice(racine.length + 1)}:${ligne} → ${texte.replace(/\s+/g, " ").slice(0, 90)}`,
        );
      }
    }

    expect(
      morts,
      morts.length === 0
        ? ""
        : `Ces interrupteurs n'ont AUCUN gestionnaire — ils promettent un geste qui ` +
            `n'existe pas :\n${morts.join("\n")}\n\n` +
            `Un état qui se lit seulement se dessine autrement : une pastille avec son ` +
            `libellé, un badge, une phrase. Voir SourceControlSettings.logic.ts, où un ` +
            `interrupteur mort a été remplacé par un état NOMMÉ.\n` +
            `Si l'inertie est vraiment voulue, écris « ${MARQUEUR_ASSUME} <raison> » sur ` +
            `la ligne ou juste au-dessus.`,
    ).toEqual([]);
  });

  it("aucune liste déroulante n'est purement décorative", () => {
    // Même règle, surface plus large : 18 listes contre 27 interrupteurs, et
    // ce sont elles qui portent les choix de modèle, de canal, de thème.
    // Une liste qui s'ouvre, propose, et ne retient rien est le mensonge le
    // plus coûteux de l'écran — l'utilisateur croit avoir choisi.
    const mortes: string[] = [];

    for (const chemin of fichiers) {
      const contenu = NodeFS.readFileSync(chemin, "utf8");
      const lignes = contenu.split("\n");
      for (const { ligne, texte } of balises(contenu, "Select")) {
        if (texte.includes("onValueChange")) continue;
        if (estAssume(lignes, ligne)) continue;
        mortes.push(
          `${chemin.slice(racine.length + 1)}:${ligne} → ${texte.replace(/\s+/g, " ").slice(0, 90)}`,
        );
      }
    }

    expect(
      mortes,
      mortes.length === 0
        ? ""
        : `Ces listes déroulantes ne retiennent RIEN de ce qu'on y choisit :\n` +
            `${mortes.join("\n")}\n\n` +
            `Si la liste ne sert qu'à montrer une valeur, ce n'est pas une liste : ` +
            `c'est du texte. Sinon, câble « onValueChange ».`,
    ).toEqual([]);
  });

  it("aucun bouton d'info n'ignore le clic", () => {
    // Un `<button>` rendu par un `TooltipTrigger` s'ouvre au SURVOL et reste
    // muet au clic. Au doigt — et pour quiconque clique avant de survoler —
    // l'affordance est morte : l'objet a la forme d'un bouton et n'en fait
    // pas le travail.
    //
    // Quatre de ces boutons vivaient dans les réglages le 02/08. Le remède
    // existait déjà dans le même dossier : `Popover` + `openOnHover`, qui
    // répond aux DEUX gestes.
    const muets: string[] = [];

    for (const chemin of fichiers) {
      const contenu = NodeFS.readFileSync(chemin, "utf8");
      const lignes = contenu.split("\n");
      for (const { ligne, texte } of balises(contenu, "TooltipTrigger")) {
        const rendUnBouton = texte.includes("<button") || texte.includes("<Button");
        if (!rendUnBouton) continue;
        if (texte.includes("onClick")) continue;

        // DEUX EXCEPTIONS QUI NE SONT PAS DES ÉCHAPPATOIRES, mais des cas où
        // la règle avait tort. Trouvées en l'écrivant, sur des cas réels.
        //
        // 1. Un bouton `disabled` ne PEUT pas être cliqué : lui reprocher de
        //    n'avoir pas de gestionnaire n'a pas de sens. C'est même le bon
        //    patron — le verrou plus l'infobulle qui dit pourquoi.
        if (/\sdisabled(\s|\/>|>|=)/.test(texte)) continue;
        //
        // 2. Un autre déclencheur peut FOURNIR le clic. `DialogTrigger`,
        //    `PopoverTrigger`, `MenuTrigger`… enveloppent le bouton et
        //    ouvrent au clic. Le geste marche ; c'est le détecteur qui ne le
        //    voyait pas.
        if (/<(Dialog|AlertDialog|Popover|Menu|Sheet|Drawer)Trigger\b/.test(texte)) continue;

        if (estAssume(lignes, ligne)) continue;
        muets.push(`${chemin.slice(racine.length + 1)}:${ligne}`);
      }
    }

    expect(
      muets,
      muets.length === 0
        ? ""
        : `Ces boutons s'ouvrent au survol et ignorent le clic :\n${muets.join("\n")}\n\n` +
            `Remplace le Tooltip par un Popover avec « openOnHover » — le patron est déjà ` +
            `utilisé dans ce dossier (ConnectionsSettings, ProviderInstanceCard). Un bouton ` +
            `qui ne répond pas au clic n'est pas un bouton.`,
    ).toEqual([]);
  });

  it("aucun interrupteur n'est désactivé en dur", () => {
    // `disabled` sans condition, c'est un contrôle qui ne s'allumera JAMAIS.
    // `disabled={x}` est légitime — c'est un état, pas une condamnation.
    const condamnes: string[] = [];

    for (const chemin of fichiers) {
      const contenu = NodeFS.readFileSync(chemin, "utf8");
      const lignes = contenu.split("\n");
      for (const { ligne, texte } of interrupteurs(contenu)) {
        const enDur = /\sdisabled(\s|\/>|>)/.test(texte);
        if (!enDur) continue;
        if (estAssume(lignes, ligne)) continue;
        condamnes.push(`${chemin.slice(racine.length + 1)}:${ligne}`);
      }
    }

    expect(
      condamnes,
      condamnes.length === 0
        ? ""
        : `Ces interrupteurs sont désactivés en DUR — ils ne s'allumeront jamais :\n` +
            `${condamnes.join("\n")}\n\n` +
            `Un « disabled » conditionnel (disabled={x}) est légitime : c'est un état. ` +
            `Un « disabled » nu est une décoration.`,
    ).toEqual([]);
  });
});
