/**
 * DIRE À VOIX HAUTE — le moteur, séparé du découpage.
 *
 * Chantier n°66, seconde moitié. `DecouperPourLaVoix.ts` décide QUOI dire ;
 * celui-ci le dit. La séparation permet de tester le découpage sans carte son
 * et cette file sans moteur réel.
 *
 * ── Pourquoi une file à nous, alors que le navigateur en a une ────────────
 *
 * `speechSynthesis` a bien une file interne, mais elle est GLOBALE à l'onglet
 * et on ne peut ni l'inspecter ni la vider partiellement. Deux conséquences
 * qu'on ne peut pas accepter :
 *   · quand un nouveau tour commence, il faut taire ce qui restait du
 *     précédent — sinon l'agent répond par-dessus sa réponse d'avant ;
 *   · `cancel()` vide TOUT, y compris ce qu'un autre bout de l'interface
 *     aurait mis en file.
 * On garde donc notre propre suite, et on n'envoie au navigateur qu'une
 * énonciation à la fois.
 *
 * ── La voix ───────────────────────────────────────────────────────────────
 *
 * Français d'abord, comme le produit. Une voix anglaise lisant du français
 * est pire que pas de voix : « les tests passent » devient inaudible. À
 * défaut de voix française, on ne parle PAS — un silence se comprend, un
 * charabia non.
 */

/** Le strict nécessaire de l'API du navigateur. Rend le module testable. */
export interface MoteurDeVoix {
  readonly parler: (texte: string, voix: string | null) => Promise<void>;
  readonly taire: () => void;
  readonly voixDisponibles: () => ReadonlyArray<{ readonly nom: string; readonly langue: string }>;
}

/**
 * Choisit une voix française, ou rien.
 *
 * `fr-CA` et `fr-BE` conviennent : c'est la même langue, et une voix
 * québécoise lisant du français est infiniment plus claire qu'une voix
 * anglaise. On ne descend jamais à l'anglais par défaut.
 */
export function choisirLaVoix(
  disponibles: ReadonlyArray<{ readonly nom: string; readonly langue: string }>,
): string | null {
  const francaises = disponibles.filter((voix) => voix.langue.toLowerCase().startsWith("fr"));
  if (francaises.length === 0) return null;
  // `fr-FR` d'abord quand elle existe, sinon la première française trouvée.
  return (
    francaises.find((voix) => voix.langue.toLowerCase() === "fr-fr")?.nom ??
    francaises[0]?.nom ??
    null
  );
}

export interface Voix {
  /** Ajoute des unités à dire. Elles partent dans l'ordre, une à la fois. */
  readonly dire: (unites: ReadonlyArray<string>) => void;
  /** Coupe tout, immédiatement, et vide la suite. */
  readonly taire: () => void;
  /** Ce qui reste à dire — pour l'interface, et pour les tests. */
  readonly enAttente: () => number;
}

/**
 * Monte une voix au-dessus d'un moteur.
 *
 * Une seule énonciation part à la fois : c'est ce qui permet de couper net.
 * Si on remplissait la file du navigateur, `taire()` devrait annuler ce qu'on
 * ne contrôle plus.
 */
export function monterLaVoix(moteur: MoteurDeVoix): Voix {
  const suite: string[] = [];
  let enCours = false;
  let generation = 0;

  const avancer = (marque: number): void => {
    // Une génération périmée : `taire()` est passé pendant qu'on parlait. On
    // s'arrête sans toucher à la suite, que l'appelant a peut-être déjà
    // remplie pour le tour suivant.
    if (marque !== generation) return;
    const prochaine = suite.shift();
    if (prochaine === undefined) {
      enCours = false;
      return;
    }
    enCours = true;
    void moteur
      .parler(prochaine, choisirLaVoix(moteur.voixDisponibles()))
      // Un échec de synthèse ne doit pas bloquer la suite : la voix suivante
      // part quand même. Perdre une phrase est ennuyeux ; rester muet pour de
      // bon ne se répare qu'en rechargeant.
      .catch(() => undefined)
      .then(() => {
        avancer(marque);
      });
  };

  return {
    dire: (unites) => {
      if (unites.length === 0) return;
      suite.push(...unites);
      if (!enCours) avancer(generation);
    },
    taire: () => {
      generation += 1;
      suite.length = 0;
      enCours = false;
      moteur.taire();
    },
    enAttente: () => suite.length,
  };
}
