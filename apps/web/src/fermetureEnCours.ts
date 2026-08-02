import { useSyncExternalStore } from "react";

/**
 * « ON S'EN VA » — et on cesse alors de crier à la panne.
 *
 * Au moment de quitter, l'application fait `event.preventDefault()`, éteint
 * le serveur local et ATTEND la fin, fenêtre toujours à l'écran. Pendant
 * cette attente, le rendu continuait de sonder `/.well-known/t3/environment`
 * sur un serveur qu'on est justement en train de couler, et affichait
 * « Failed to connect. Reconnecting… ». Une extinction VOULUE rapportée
 * comme un échec, au pire moment — reproche fondateur du 31/07 : « c'est
 * horrible ».
 *
 * On ne DEVINE pas la fermeture : un `beforeunload` arriverait trop tard,
 * puisque la fenêtre ne se ferme qu'à la toute fin, après l'attente. Le
 * processus principal le DIT, avant même de commencer à éteindre.
 *
 * VERROU À SENS UNIQUE : une fermeture ne s'annule pas. Une fois levé, le
 * drapeau ne redescend jamais, et il n'y a rien à défaire au démontage —
 * la page entière s'en va.
 */
let ferme = false;
const abonnes = new Set<() => void>();

/** Lever le drapeau. Idempotent : les abonnés ne sont prévenus qu'une fois. */
export function leverLaFermeture(): void {
  if (ferme) return;
  ferme = true;
  for (const prevenir of abonnes) prevenir();
}

export function fermetureLevee(): boolean {
  return ferme;
}

let brancheAuPont = false;

/**
 * S'abonner au drapeau. Le premier abonné branche le pont de bureau ; hors
 * application de bureau il n'y a pas de pont — et pas de fermeture à
 * annoncer non plus, un onglet qui se ferme emporte tout d'un coup.
 */
export function abonnerALaFermeture(prevenir: () => void): () => void {
  abonnes.add(prevenir);
  if (!brancheAuPont) {
    brancheAuPont = true;
    // `typeof window` et pas seulement l'optionnel : hors navigateur, la
    // variable n'EXISTE pas et la simple lecture jette. Attrapé par le test,
    // qui tourne en Node — c'était le même défaut au rendu côté serveur.
    if (typeof window !== "undefined") {
      window.desktopBridge?.onAppQuitting?.(leverLaFermeture);
    }
  }
  return () => {
    abonnes.delete(prevenir);
  };
}

/** `true` dès que l'application a annoncé son départ. */
export function useFermetureEnCours(): boolean {
  return useSyncExternalStore(abonnerALaFermeture, fermetureLevee, fermetureLevee);
}

/** Pour les tests : remettre le drapeau, les abonnés et le pont à zéro. */
export function reinitialiserFermetureEnCours(): void {
  ferme = false;
  brancheAuPont = false;
  abonnes.clear();
}
