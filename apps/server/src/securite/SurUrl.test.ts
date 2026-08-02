import { assert, describe, it } from "@effect/vitest";

import { ADRESSES_INTERDITES, estLienLocal, normaliserHote, verdictDUrl } from "./SurUrl.ts";

describe("verdictDUrl · ce qui est TOUJOURS refusé", () => {
  it("les points de métadonnées de cloud, la cible SSRF n°1", () => {
    for (const adresse of ADRESSES_INTERDITES) {
      const cible = adresse.includes(":") ? `http://[${adresse}]/` : `http://${adresse}/`;
      const v = verdictDUrl(`${cible}latest/meta-data/`);
      assert.isFalse(v.sur, adresse);
    }
  });

  it("le lien-local EN ENTIER, pas seulement les adresses connues", () => {
    // Hermès bloque `169.254.0.0/16` complet : « aucune cible légitime pour un
    // agent ». Une liste d'adresses exactes se contourne par un alias.
    assert.isFalse(verdictDUrl("http://169.254.1.1/").sur);
    assert.isFalse(verdictDUrl("http://169.254.255.254/x").sur);
  });

  it("les variantes IPv4-mappées — le contournement en une ligne", () => {
    // Un résolveur peut rendre `::ffff:x.x.x.x`, qui n'est PAS égal à l'IPv4
    // pour un comparateur naïf. C'est le piège qu'ils ont payé.
    assert.isFalse(verdictDUrl("http://[::ffff:169.254.169.254]/").sur);
    assert.isFalse(verdictDUrl("http://[::ffff:169.254.42.7]/").sur);
  });

  it("les schémas qui ne sont pas du web", () => {
    for (const url of ["file:///etc/passwd", "data:text/html,<script>x</script>"]) {
      const v = verdictDUrl(url);
      assert.isFalse(v.sur, url);
      assert.include(v.pourquoi, "Schéma");
    }
  });

  it("une URL inanalysable, avec un message qui dit quoi faire (A7)", () => {
    const v = verdictDUrl("pas une url");
    assert.isFalse(v.sur);
    assert.include(v.pourquoi, "https://exemple.fr");
  });

  it("le refus NOMME l'hôte et la raison", () => {
    const v = verdictDUrl("http://169.254.169.254/latest/meta-data/iam/");
    assert.include(v.pourquoi, "169.254.169.254");
    assert.include(v.pourquoi, "169.254.0.0/16");
  });
});

describe("verdictDUrl · ce qui reste PERMIS", () => {
  it("localhost et le réseau privé — voir son serveur de dev est le produit", () => {
    // Bloquer le privé casserait `preview`, dont c'est la raison d'être.
    for (const url of [
      "http://localhost:5173/",
      "http://127.0.0.1:3000/app",
      "http://192.168.1.20:8080/",
      "http://10.0.0.5/",
    ]) {
      assert.isTrue(verdictDUrl(url).sur, url);
    }
  });

  it("le CGNAT 100.64.0.0/10 — chez NOUS la règle s'inverse", () => {
    // Hermès le bloque. T3 embarque Tailscale, qui vit précisément dans cette
    // plage : c'est du trafic légitime, et le bloquer casserait le relais.
    assert.isTrue(verdictDUrl("http://100.64.1.2:8080/").sur);
    assert.isTrue(verdictDUrl("http://100.127.255.1/").sur);
  });

  it("mais PAS l'adresse Alibaba, qui est dans une plage voisine", () => {
    // 100.100.100.200 n'est pas dans 100.64.0.0/10 — la nuance compte.
    assert.isFalse(verdictDUrl("http://100.100.100.200/").sur);
  });

  it("le web ordinaire", () => {
    assert.isTrue(verdictDUrl("https://palenza.co/produit/x").sur);
    assert.isTrue(verdictDUrl("https://t3.chat").sur);
  });
});

describe("verdictDUrl · ce qui passe mais ne se tait pas", () => {
  it("un secret dans les paramètres est SIGNALÉ, pas bloqué", () => {
    // Bloquer casserait des liens signés légitimes (S3, CDN). Se taire
    // laisserait un secret entrer dans l'historique et les journaux.
    const v = verdictDUrl("https://api.exemple.fr/x?api_key=abc123&page=2");
    assert.isTrue(v.sur);
    assert.equal(v.alertes.length, 1);
    assert.include(v.alertes[0] ?? "", "api_key");
    assert.include(v.alertes[0] ?? "", "historique");
  });

  it("reconnaît les noms quelle que soit la casse", () => {
    assert.isNotEmpty(verdictDUrl("https://x.fr/?ACCESS_TOKEN=z").alertes);
    assert.isNotEmpty(verdictDUrl("https://x.fr/?X-Amz-Signature=z").alertes);
  });

  it("ne crie pas sur des paramètres ordinaires", () => {
    assert.isEmpty(verdictDUrl("https://x.fr/?page=2&tri=prix&q=casque").alertes);
  });
});

describe("normaliserHote — le piège que la plateforme fabrique toute seule", () => {
  it("ramène la forme HEXADÉCIMALE au pointillé", () => {
    // `new URL("http://[::ffff:169.254.169.254]/")` rend `[::ffff:a9fe:a9fe]`.
    // Une liste noire en pointillé ne matcherait jamais.
    assert.equal(normaliserHote("[::ffff:a9fe:a9fe]"), "169.254.169.254");
    assert.equal(normaliserHote("::ffff:6464:64c8"), "100.100.100.200");
  });

  it("laisse le reste intact", () => {
    assert.equal(normaliserHote("Palenza.CO"), "palenza.co");
    assert.equal(normaliserHote("[fd00:ec2::254]"), "fd00:ec2::254");
    assert.equal(normaliserHote("127.0.0.1"), "127.0.0.1");
  });
});

describe("estLienLocal", () => {
  it("reconnaît la plage, en IPv4 comme en IPv4-mappé", () => {
    assert.isTrue(estLienLocal("169.254.0.1"));
    assert.isTrue(estLienLocal("::ffff:169.254.169.254"));
    assert.isTrue(estLienLocal("169.254.255.255"));
  });

  it("ne déborde pas sur les voisins", () => {
    assert.isFalse(estLienLocal("169.253.0.1"));
    assert.isFalse(estLienLocal("169.255.0.1"));
    assert.isFalse(estLienLocal("16.9.254.1"));
    assert.isFalse(estLienLocal("localhost"));
  });
});
