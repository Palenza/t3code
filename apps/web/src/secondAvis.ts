import type { ServerProvider } from "@t3tools/contracts";

/**
 * LE SECOND AVIS AVEUGLE — la seule capacité de tout le ratissage que seul
 * Raptor peut offrir : trois abonnements payés, donc un relecteur à coût
 * marginal nul.
 *
 * La règle qui fait toute la valeur : le relecteur ne voit JAMAIS la première
 * réponse ni son raisonnement. Un relecteur qui a lu le brouillon se laisse
 * convaincre (l'équivalence tautologique de la mémoire projet) ; un relecteur
 * aveugle ne peut pas. On rejoue donc la QUESTION D'ORIGINE, verbatim, dans
 * un fil neuf, sur un AUTRE compte — et le désaccord, s'il apparaît, est le
 * signal : deux moteurs indépendants qui divergent pointent presque toujours
 * une vraie ambiguïté.
 *
 * Module PUR : le choix du compte et la préparation du texte. Le transport
 * (créer le fil, lancer le tour) reste dans ChatView, qui possède déjà ce
 * chemin pour les plans.
 */

export interface CandidatSecondAvis {
  readonly instanceId: string;
  readonly enabled: boolean;
  readonly rotation?: ServerProvider["rotation"];
}

/**
 * Le compte qui rendra le second avis, ou `null` s'il n'y en a pas.
 *
 * Jamais le compte d'origine (le même moteur relirait son propre biais),
 * jamais un compte mort, et un compte sain passe avant un compte en
 * refroidissement — on veut un avis, pas une file d'attente. À égalité,
 * l'ordre de la liste décide : il est stable et l'utilisateur le connaît.
 */
export function choisirCompteDeSecondAvis(input: {
  readonly instanceActuelle: string;
  readonly candidats: ReadonlyArray<CandidatSecondAvis>;
}): string | null {
  const autres = input.candidats.filter(
    (candidat) =>
      candidat.enabled &&
      candidat.instanceId !== input.instanceActuelle &&
      candidat.rotation?.state !== "dead",
  );
  const sain = autres.find((candidat) => candidat.rotation?.state !== "cooling");
  return (sain ?? autres[0])?.instanceId ?? null;
}

/**
 * La question rejouée, débarrassée du SEUL artefact de transport qu'on y a
 * ajouté nous-mêmes (le préfixe « Ultrathink: » du boost d'effort). Tout le
 * reste part verbatim : chaque mot ajouté ou retiré biaiserait le relecteur.
 */
export function questionPourSecondAvis(texteOriginal: string): string {
  return texteOriginal.replace(/^Ultrathink:\s*/iu, "").trim();
}

/** Le titre du fil de second avis — reconnaissable dans la barre latérale. */
export function titreDeSecondAvis(question: string): string {
  const net = question.replaceAll(/\s+/gu, " ").trim();
  const extrait = net.length > 60 ? `${net.slice(0, 57)}…` : net;
  return `Second avis — ${extrait}`;
}
