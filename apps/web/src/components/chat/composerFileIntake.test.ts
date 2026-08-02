import { describe, expect, it } from "vite-plus/test";

import { messageHorsPortee, messageSansChemin, trierFichiers } from "./composerFileIntake";

const fichier = (name: string, type: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

/** Le pont desktop d'un utilisateur normal : chaque fichier a son chemin. */
const surLeDisque = (dossier: string) => (file: File) => `${dossier}/${file.name}`;

describe("le tri des fichiers déposés au composeur", () => {
  it("envoie les images par la voie inline", () => {
    const tri = trierFichiers(
      [fichier("capture.png", "image/png"), fichier("photo.jpeg", "image/jpeg")],
      surLeDisque("/Users/enzo/Desktop"),
    );
    expect(tri.images.map((file) => file.name)).toEqual(["capture.png", "photo.jpeg"]);
    expect(tri.mentions).toEqual([]);
    expect(tri.sansChemin).toEqual([]);
  });

  it("envoie TOUT LE RESTE par mention — c'est ce que Claude Code sait lire", () => {
    // Le cas fondateur : un .mov de 454 Mo qu'aucune charge utile ne portera
    // jamais, mais qu'un agent ouvre sans peine s'il sait OÙ il est.
    const tri = trierFichiers(
      [
        fichier("Enregistrement.mov", "video/quicktime"),
        fichier("facture.pdf", "application/pdf"),
        fichier("ventes.csv", "text/csv"),
        fichier("notes.txt", "text/plain"),
      ],
      surLeDisque("/Users/enzo/Desktop"),
    );
    expect(tri.images).toEqual([]);
    expect(tri.mentions).toEqual([
      "[Enregistrement.mov](/Users/enzo/Desktop/Enregistrement.mov)",
      "[facture.pdf](/Users/enzo/Desktop/facture.pdf)",
      "[ventes.csv](/Users/enzo/Desktop/ventes.csv)",
      "[notes.txt](/Users/enzo/Desktop/notes.txt)",
    ]);
    expect(tri.sansChemin).toEqual([]);
  });

  it("accepte un dossier — il n'a pas de type MIME, il part en mention comme le reste", () => {
    const tri = trierFichiers([fichier("mon-projet", "")], surLeDisque("/Users/enzo"));
    expect(tri.mentions).toEqual(["[mon-projet](/Users/enzo/mon-projet)"]);
  });

  it("mélange les deux voies dans un même dépôt", () => {
    const tri = trierFichiers(
      [fichier("capture.png", "image/png"), fichier("ventes.csv", "text/csv")],
      surLeDisque("/tmp"),
    );
    expect(tri.images.map((file) => file.name)).toEqual(["capture.png"]);
    expect(tri.mentions).toEqual(["[ventes.csv](/tmp/ventes.csv)"]);
  });

  it("DIT les fichiers qu'il ne sait pas situer, au lieu de les jeter en silence", () => {
    // Hors app desktop, ou fichier fabriqué en mémoire : pas de chemin.
    const tri = trierFichiers([fichier("ventes.csv", "text/csv")], () => "");
    expect(tri.mentions).toEqual([]);
    expect(tri.sansChemin).toEqual(["ventes.csv"]);
    expect(messageSansChemin(tri.sansChemin)).toContain("ventes.csv");
  });

  it("survit à un pont qui jette — le reste du dépôt passe quand même", () => {
    const tri = trierFichiers(
      [
        fichier("capture.png", "image/png"),
        fichier("casse.bin", "application/octet-stream"),
        fichier("ok.csv", "text/csv"),
      ],
      (file) => {
        if (file.name === "casse.bin") throw new Error("pont mort");
        return `/tmp/${file.name}`;
      },
    );
    expect(tri.images.map((file) => file.name)).toEqual(["capture.png"]);
    expect(tri.mentions).toEqual(["[ok.csv](/tmp/ok.csv)"]);
    expect(tri.sansChemin).toEqual(["casse.bin"]);
  });

  it("échappe les chemins et les noms — un fichier ne doit pas casser le markdown", () => {
    const tri = trierFichiers(
      [fichier("rapport (final) [v2].pdf", "application/pdf")],
      surLeDisque("/Users/enzo/Mes Docs"),
    );
    const mention = tri.mentions[0]!;
    // Le libellé garde ses crochets ÉCHAPPÉS, la destination est encodée :
    // sinon le lien se referme au premier `)` du nom de fichier.
    expect(mention.startsWith("[")).toBe(true);
    expect(mention).toContain("%20");
    expect(mention.endsWith(")")).toBe(true);
  });

  it("ne rend rien pour un dépôt vide", () => {
    const tri = trierFichiers([], surLeDisque("/tmp"));
    expect(tri).toEqual({ images: [], mentions: [], sansChemin: [], horsPortee: [] });
  });
});

describe("quand l'agent ne tourne PAS sur cette machine", () => {
  // La mine que la première version posait : sur un fil visant WSL, SSH ou une
  // machine de relais, `/Users/enzo/Desktop/x.mov` ne désigne rien. Une
  // mention serait partie quand même, et n'aurait échoué qu'À LA LECTURE,
  // côté agent, loin du geste qui l'a causée.
  it("REFUSE de poser une mention morte, et le dit", () => {
    const tri = trierFichiers(
      [fichier("Enregistrement.mov", "video/quicktime"), fichier("ventes.csv", "text/csv")],
      surLeDisque("/Users/enzo/Desktop"),
      false,
    );
    expect(tri.mentions).toEqual([]);
    expect(tri.horsPortee).toEqual(["Enregistrement.mov", "ventes.csv"]);
    expect(messageHorsPortee(tri.horsPortee)).toContain("distant");
  });

  it("laisse passer les images — elles voyagent en OCTETS, pas en chemin", () => {
    const tri = trierFichiers([fichier("capture.png", "image/png")], surLeDisque("/tmp"), false);
    expect(tri.images.map((file) => file.name)).toEqual(["capture.png"]);
    expect(tri.horsPortee).toEqual([]);
  });

  it("par défaut, on suppose la machine locale — le cas de tous les jours", () => {
    const tri = trierFichiers([fichier("notes.txt", "text/plain")], surLeDisque("/tmp"));
    expect(tri.mentions).toEqual(["[notes.txt](/tmp/notes.txt)"]);
    expect(tri.horsPortee).toEqual([]);
  });
});
