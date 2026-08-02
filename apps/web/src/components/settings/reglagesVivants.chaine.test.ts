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

/** Les interrupteurs d'un fichier, avec leur ligne et leur texte complet. */
function interrupteurs(contenu: string): ReadonlyArray<{ ligne: number; texte: string }> {
  const trouves: Array<{ ligne: number; texte: string }> = [];
  let depuis = 0;
  for (;;) {
    const debut = contenu.indexOf("<Switch", depuis);
    if (debut === -1) break;
    // La balise court jusqu'à sa fermeture. `<Switch` est auto-fermant dans ce
    // dépôt, mais on accepte les deux formes plutôt que de le supposer.
    const finAuto = contenu.indexOf("/>", debut);
    const finSimple = contenu.indexOf(">", debut);
    const fin = finAuto !== -1 && finAuto <= finSimple ? finAuto + 2 : finSimple + 1;
    trouves.push({
      ligne: contenu.slice(0, debut).split("\n").length,
      texte: contenu.slice(debut, fin),
    });
    depuis = fin;
  }
  return trouves;
}

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
    // Sans ce garde, le test suivant passerait sur une liste vide — un vert
    // qui ne prouve rien, et qui se cite quand même.
    expect(
      fichiers.length,
      `Aucun panneau trouvé dans ${DOSSIER_REGLAGES} — ce test regarde-t-il au bon endroit ?`,
    ).toBeGreaterThan(5);
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
