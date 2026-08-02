import {
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  AuthReviewWriteScope,
  AuthTerminalOperateScope,
  type AuthEnvironmentScope,
  type DesktopBridge,
  type DesktopWslState,
} from "@t3tools/contracts";

/**
 * CE QU'UNE PERMISSION AUTORISE, EN CLAIR.
 *
 * Ces libellés existaient déjà — ils servaient à COCHER les permissions quand
 * on fabrique un lien d'appairage. Mais l'écran qui les RELIT affichait le nom
 * machine (`orchestration:read`, `terminal:operate`), à trois lignes de là.
 * Résultat : « 8 scopes » au survol, et une liste que personne ne peut juger.
 *
 * Le catalogue vit ici plutôt que dans le composant pour que les deux surfaces
 * — celle qui accorde et celle qui relit — lisent la MÊME source. Deux listes
 * de permissions qui divergent, c'est un écran qui ment sur ce qu'on a donné.
 */
export const PORTEES_CONNUES: ReadonlyArray<{
  readonly scope: AuthEnvironmentScope;
  readonly title: string;
  readonly description: string;
}> = [
  {
    scope: AuthOrchestrationReadScope,
    title: "View environment",
    description: "Read threads, status, diffs, and configuration.",
  },
  {
    scope: AuthOrchestrationOperateScope,
    title: "Operate tasks",
    description: "Start tasks and perform changes in the environment.",
  },
  {
    scope: AuthTerminalOperateScope,
    title: "Use terminals",
    description: "Create terminals and send input to running shells.",
  },
  {
    scope: AuthReviewWriteScope,
    title: "Write reviews",
    description: "Create comments while reviewing changes.",
  },
  {
    scope: AuthAccessReadScope,
    title: "View access",
    description: "Inspect pairing links and authorized clients.",
  },
  {
    scope: AuthAccessWriteScope,
    title: "Manage access",
    description: "Issue and revoke credentials for other clients.",
  },
  {
    scope: AuthRelayReadScope,
    title: "View relay",
    description: "Inspect managed relay connectivity.",
  },
  {
    scope: AuthRelayWriteScope,
    title: "Manage relay",
    description: "Change managed tunnel connectivity.",
  },
];

export interface PorteeLisible {
  readonly scope: string;
  readonly titre: string;
  readonly description: string | null;
  /** Vrai quand on ne connaît pas cette permission — on montre alors son nom brut. */
  readonly inconnue: boolean;
}

/**
 * Traduit une permission, et n'en INVENTE jamais une.
 *
 * Un serveur plus récent peut accorder une permission que ce client ne connaît
 * pas. On affiche alors son nom machine tel quel, marqué comme inconnue —
 * jamais une jolie phrase devinée. Une permission qu'on décrit de travers est
 * pire qu'une permission qu'on ne sait pas décrire : la première rassure à tort.
 */
export function decrirePortee(scope: string): PorteeLisible {
  const connue = PORTEES_CONNUES.find((entree) => entree.scope === scope);
  return connue
    ? { scope, titre: connue.title, description: connue.description, inconnue: false }
    : { scope, titre: scope, description: null, inconnue: true };
}

export function decrirePortees(scopes: ReadonlyArray<string>): ReadonlyArray<PorteeLisible> {
  return scopes.map(decrirePortee);
}

type WslEnableBridge = Pick<DesktopBridge, "setWslBackendEnabled" | "setWslDistro" | "setWslOnly">;

export async function applyWslEnableSelection(input: {
  readonly bridge: WslEnableBridge;
  readonly mode: "both" | "wsl-only";
  readonly nextDistro: string | null;
  readonly persistedDistro: string | null;
}): Promise<DesktopWslState> {
  const { bridge, mode, nextDistro, persistedDistro } = input;

  // Stage every preference before enabling. The desktop only relaunches for
  // mode/distro changes while WSL is active, so the final enable observes the
  // complete selection and is the only call that may relaunch.
  await bridge.setWslOnly(mode === "wsl-only");
  if (persistedDistro !== nextDistro) {
    await bridge.setWslDistro(nextDistro);
  }
  return await bridge.setWslBackendEnabled(true);
}
