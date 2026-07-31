import { describe, expect, it } from "vite-plus/test";

import { cibleDeReprise } from "./repriseDeSession";

const fil = (environmentId: string, id: string) => ({ environmentId, id });

describe("cibleDeReprise", () => {
  it("rouvre le dernier fil ouvert", () => {
    expect(cibleDeReprise("local:abc", [fil("local", "abc"), fil("local", "def")])).toEqual({
      environmentId: "local",
      threadId: "abc",
    });
  });

  it("refuse un fil qui n'existe plus", () => {
    // Le cas qui compte : supprimer un fil ne nettoie pas la clé. Sans ce
    // garde-fou, le lancement ouvrirait une page morte — pire que le fil
    // neuf qu'on remplace.
    expect(cibleDeReprise("local:supprime", [fil("local", "abc")])).toBeNull();
  });

  it("rend null quand rien n'a jamais été ouvert", () => {
    expect(cibleDeReprise(null, [fil("local", "abc")])).toBeNull();
    expect(cibleDeReprise(undefined, [fil("local", "abc")])).toBeNull();
    expect(cibleDeReprise("", [fil("local", "abc")])).toBeNull();
  });

  it("garde un identifiant de fil qui contient lui-même un deux-points", () => {
    // `split(":")` aurait rendu ["local", "a", "b"] et perdu la fin.
    expect(cibleDeReprise("local:a:b", [fil("local", "a:b")])).toEqual({
      environmentId: "local",
      threadId: "a:b",
    });
  });

  it("refuse une clé malformée plutôt que de deviner", () => {
    expect(cibleDeReprise("sansdeuxpoints", [fil("local", "abc")])).toBeNull();
    expect(cibleDeReprise(":abc", [fil("", "abc")])).toBeNull();
    expect(cibleDeReprise("local:", [fil("local", "")])).toBeNull();
  });

  it("distingue deux fils de même identifiant dans deux environnements", () => {
    expect(cibleDeReprise("vps:x", [fil("mac", "x"), fil("vps", "x")])).toEqual({
      environmentId: "vps",
      threadId: "x",
    });
    expect(cibleDeReprise("vps:x", [fil("mac", "x")])).toBeNull();
  });
});
