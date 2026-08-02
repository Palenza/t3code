import type {
  DesktopAppBranding,
  DesktopAppStageLabel,
  DesktopRuntimeArch,
  DesktopRuntimeInfo,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopConfig from "./DesktopConfig.ts";
import { isNightlyDesktopVersion } from "../updates/updateChannels.ts";

export interface MakeDesktopEnvironmentInput {
  readonly dirname: string;
  readonly homeDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly processArch: string;
  readonly appVersion: string;
  readonly appPath: string;
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly runningUnderArm64Translation: boolean;
}

export class DesktopEnvironment extends Context.Service<
  DesktopEnvironment,
  {
    readonly path: Path.Path;
    readonly dirname: string;
    readonly platform: NodeJS.Platform;
    readonly processArch: string;
    readonly isPackaged: boolean;
    readonly isDevelopment: boolean;
    readonly appVersion: string;
    readonly appPath: string;
    readonly resourcesPath: string;
    readonly homeDirectory: string;
    readonly appDataDirectory: string;
    readonly baseDir: string;
    readonly stateDir: string;
    readonly desktopSettingsPath: string;
    readonly clientSettingsPath: string;
    readonly savedEnvironmentRegistryPath: string;
    readonly serverSettingsPath: string;
    readonly logDir: string;
    readonly browserArtifactsDir: string;
    readonly rootDir: string;
    readonly appRoot: string;
    readonly backendEntryPath: string;
    readonly backendCwd: string;
    readonly preloadPath: string;
    readonly appUpdateYmlPath: string;
    readonly devServerUrl: Option.Option<URL>;
    readonly devRemoteT3ServerEntryPath: Option.Option<string>;
    readonly configuredBackendPort: Option.Option<number>;
    readonly commitHashOverride: Option.Option<string>;
    readonly otlpTracesUrl: Option.Option<string>;
    readonly otlpExportIntervalMs: number;
    readonly branding: DesktopAppBranding;
    readonly displayName: string;
    readonly appUserModelId: string;
    readonly linuxDesktopEntryName: string;
    readonly linuxWmClass: string;
    readonly userDataDirName: string;
    readonly legacyUserDataDirName: string;
    readonly defaultDesktopSettings: DesktopAppSettings.DesktopSettings;
    readonly runtimeInfo: DesktopRuntimeInfo;
    readonly resolvePickFolderDefaultPath: (rawOptions: unknown) => Option.Option<string>;
    readonly resolveResourcePathCandidates: (fileName: string) => readonly string[];
    readonly developmentDockIconPath: string;
  }
>()("@t3tools/desktop/app/DesktopEnvironment") {}

/** EXPORTÉ, et c'est le point : la marque doit avoir UNE source par processus.
 * Elle était recopiée en dur dans `DesktopLocalEnvironmentAuth`, qui annonçait
 * un nom pendant que l'app en affichait un autre —
 * Enzo y a lu, à raison, que le fork se présentait sous le nom de l'amont. Une
 * marque recopiée diverge le jour où on la change ; celle-ci se lit. */
export const APP_BASE_NAME = "Raptor";

function resolveDesktopAppStageLabel(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppStageLabel {
  if (input.isDevelopment) {
    return "Dev";
  }

  // Décision fondateur 02/08 (remplace celle du 29/07) : l'app s'appelle
  // Raptor, et une version publiée porte son nom NU. Le stade ne sert plus
  // qu'à distinguer les builds — « Dev » ci-dessus, « Nightly » ici, et rien
  // du tout pour une release.
  return isNightlyDesktopVersion(input.appVersion) ? "Nightly" : "Release";
}

function resolveDesktopAppBranding(input: {
  readonly isDevelopment: boolean;
  readonly appVersion: string;
}): DesktopAppBranding {
  const stageLabel = resolveDesktopAppStageLabel(input);
  return {
    baseName: APP_BASE_NAME,
    stageLabel,
    // Même règle que le web (`formatAppDisplayName`) : le stade n'apparaît que
    // s'il distingue quelque chose. Dupliquée ici plutôt qu'importée — le
    // paquet bureau ne dépend pas du paquet web — et tenue par un test.
    // Même règle que le web : le stade n'apparaît que s'il distingue
    // quelque chose. Dupliquée ici — le paquet bureau ne dépend pas du
    // paquet web — et tenue par un test.
    displayName:
      stageLabel === "Release" || stageLabel === "Raptor"
        ? APP_BASE_NAME
        : `${APP_BASE_NAME} (${stageLabel})`,
  };
}

function normalizeDesktopArch(arch: string): DesktopRuntimeArch {
  if (arch === "arm64") return "arm64";
  if (arch === "x64") return "x64";
  return "other";
}

function resolveDesktopRuntimeInfo(input: {
  readonly platform: NodeJS.Platform;
  readonly processArch: string;
  readonly runningUnderArm64Translation: boolean;
}): DesktopRuntimeInfo {
  const appArch = normalizeDesktopArch(input.processArch);

  if (input.platform !== "darwin") {
    return {
      hostArch: appArch,
      appArch,
      runningUnderArm64Translation: false,
    };
  }

  const hostArch = appArch === "arm64" || input.runningUnderArm64Translation ? "arm64" : appArch;

  return {
    hostArch,
    appArch,
    runningUnderArm64Translation: input.runningUnderArm64Translation,
  };
}

const make = Effect.fn("desktop.environment.make")(function* (
  input: MakeDesktopEnvironmentInput,
): Effect.fn.Return<DesktopEnvironment["Service"], Config.ConfigError, Path.Path> {
  const path = yield* Path.Path;
  const config = yield* DesktopConfig.DesktopConfig;
  const homeDirectory = input.homeDirectory;
  const devServerUrl = config.devServerUrl;
  const isDevelopment = Option.isSome(devServerUrl);
  const appDataDirectory =
    input.platform === "win32"
      ? Option.getOrElse(config.appDataDirectory, () =>
          path.join(homeDirectory, "AppData", "Roaming"),
        )
      : input.platform === "darwin"
        ? path.join(homeDirectory, "Library", "Application Support")
        : Option.getOrElse(config.xdgConfigHome, () => path.join(homeDirectory, ".config"));
  const configuredBaseDir = config.t3Home;
  const baseDir = Option.getOrElse(configuredBaseDir, () => path.join(homeDirectory, ".t3"));
  const rootDir = path.resolve(input.dirname, "../../..");
  const appRoot = input.isPackaged ? input.appPath : rootDir;
  const branding = resolveDesktopAppBranding({
    isDevelopment,
    appVersion: input.appVersion,
  });
  const displayName = branding.displayName;

  /**
   * NIGHTLY A SON PROPRE DOSSIER — sinon les deux applications se marchent
   * dessus, en silence.
   *
   * Constaté le 31/07 sur la machine du fondateur : Raptor et Nightly
   * portent le MÊME identifiant de bundle (`com.t3tools.t3code`) et, jusqu'à
   * cette ligne, le même dossier de données. Il n'existe pas non plus de
   * verrou d'instance unique. Les deux tournaient en même temps (ports 3773
   * et 3774) et écrivaient dans le même `localStorage` : la dernière qui
   * écrit gagne. Symptôme vécu — « j'étais dans Tous, je quitte, je relance,
   * je suis dans Design ». Ce n'était pas la reprise qui échouait, c'était
   * l'autre application qui avait réécrit l'espace actif par-dessus.
   *
   * C'est exactement le rôle d'une nightly : s'essayer sans rien risquer des
   * vraies données. Stable garde `t3code` — donc TOUT l'existant reste en
   * place, rien à migrer, rien à perdre.
   */
  const estNightly = !isDevelopment && isNightlyDesktopVersion(input.appVersion);
  const stateDir = path.join(
    baseDir,
    Option.isSome(configuredBaseDir)
      ? "userdata"
      : isDevelopment
        ? "dev"
        : estNightly
          ? "nightly"
          : "userdata",
  );
  const userDataDirName = isDevelopment ? "t3code-dev" : estNightly ? "t3code-nightly" : "t3code";
  // Le dossier hérité GAGNE sur le nouveau quand il existe (cf.
  // `resolveUserDataPath`). Donner à nightly l'héritage de stable la ferait
  // donc retomber dans les données qu'on vient de séparer — elle a le sien.
  // CES TROIS NOMS NE SONT PAS LA MARQUE, CE SONT DES CHEMINS SUR LE DISQUE.
  //
  // `resolveUserDataPath` préfère le dossier hérité QUAND IL EXISTE. Les
  // renommer au moment du changement de marque (02/08) aurait donc orphelin
  // les données de toute installation antérieure : l'app se serait ouverte
  // vierge, sans erreur, et « on a perdu mes fils » aurait été la seule trace.
  // Ils décrivent l'histoire, pas l'identité — ils ne bougent pas.
  const legacyUserDataDirName = isDevelopment
    ? "T3 Code (Dev)"
    : estNightly
      ? "T3 Code (Nightly)"
      : "T3 Code (Alpha)";
  const resourcesPath = input.resourcesPath;

  return DesktopEnvironment.of({
    path,
    dirname: input.dirname,
    platform: input.platform,
    processArch: input.processArch,
    isPackaged: input.isPackaged,
    isDevelopment,
    appVersion: input.appVersion,
    appPath: input.appPath,
    resourcesPath,
    homeDirectory,
    appDataDirectory,
    baseDir,
    stateDir,
    desktopSettingsPath: path.join(stateDir, "desktop-settings.json"),
    clientSettingsPath: path.join(stateDir, "client-settings.json"),
    savedEnvironmentRegistryPath: path.join(stateDir, "saved-environments.json"),
    serverSettingsPath: path.join(stateDir, "settings.json"),
    logDir: path.join(stateDir, "logs"),
    browserArtifactsDir: path.join(stateDir, "browser-artifacts"),
    rootDir,
    appRoot,
    backendEntryPath: path.join(appRoot, "apps/server/dist/bin.mjs"),
    backendCwd: input.isPackaged ? homeDirectory : appRoot,
    preloadPath: path.join(input.dirname, "preload.cjs"),
    appUpdateYmlPath: input.isPackaged
      ? path.join(resourcesPath, "app-update.yml")
      : path.join(input.appPath, "dev-app-update.yml"),
    devServerUrl,
    devRemoteT3ServerEntryPath: config.devRemoteT3ServerEntryPath,
    configuredBackendPort: config.configuredBackendPort,
    commitHashOverride: config.commitHashOverride,
    otlpTracesUrl: config.otlpTracesUrl,
    otlpExportIntervalMs: config.otlpExportIntervalMs,
    branding,
    displayName,
    appUserModelId: Option.getOrElse(config.appUserModelIdOverride, () =>
      isDevelopment ? "com.t3tools.t3code.dev" : "com.t3tools.t3code",
    ),
    linuxDesktopEntryName: isDevelopment ? "t3code-dev.desktop" : "t3code.desktop",
    linuxWmClass: isDevelopment ? "t3code-dev" : "t3code",
    userDataDirName,
    legacyUserDataDirName,
    defaultDesktopSettings: DesktopAppSettings.resolveDefaultDesktopSettings(input.appVersion),
    runtimeInfo: resolveDesktopRuntimeInfo({
      platform: input.platform,
      processArch: input.processArch,
      runningUnderArm64Translation: input.runningUnderArm64Translation,
    }),
    resolvePickFolderDefaultPath: (rawOptions) => {
      if (typeof rawOptions !== "object" || rawOptions === null) {
        return Option.none();
      }

      const { initialPath } = rawOptions as { initialPath?: unknown };
      if (typeof initialPath !== "string") {
        return Option.none();
      }

      const trimmedPath = initialPath.trim();
      if (trimmedPath.length === 0) {
        return Option.none();
      }

      if (trimmedPath === "~") {
        return Option.some(homeDirectory);
      }

      if (trimmedPath.startsWith("~/") || trimmedPath.startsWith("~\\")) {
        return Option.some(path.join(homeDirectory, trimmedPath.slice(2)));
      }

      return Option.some(path.resolve(trimmedPath));
    },
    resolveResourcePathCandidates: (fileName) => [
      path.join(input.dirname, "../resources", fileName),
      path.join(input.dirname, "../prod-resources", fileName),
      path.join(resourcesPath, "resources", fileName),
      path.join(resourcesPath, fileName),
    ],
    developmentDockIconPath: path.join(rootDir, "assets", "dev", "blueprint-macos-1024.png"),
  });
});

export const layer = (input: MakeDesktopEnvironmentInput) =>
  Layer.effect(DesktopEnvironment, make(input));
