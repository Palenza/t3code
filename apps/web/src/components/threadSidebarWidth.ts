export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
export const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
export const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
/**
 * Au-delà, la sidebar cesse d'être une sidebar : les titres de fils restent
 * courts pendant que la date part à l'autre bout de la ligne, et l'œil doit
 * traverser le vide pour les relier (reproche fondateur 29/07 : « ça
 * s'éloigne énormément du texte des threads, c'est horrible »). 26rem est
 * large pour un titre long, et encore lisible d'un seul regard.
 */
export const THREAD_SIDEBAR_MAX_WIDTH = 26 * 16;

export function resolveThreadSidebarMaximumWidth(viewportWidth: number): number {
  return Math.max(
    THREAD_SIDEBAR_MIN_WIDTH,
    Math.min(
      THREAD_SIDEBAR_MAX_WIDTH,
      Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH,
    ),
  );
}

export function resolveInitialThreadSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
): number {
  const preferredWidth =
    storedWidth === null
      ? THREAD_SIDEBAR_DEFAULT_WIDTH
      : Math.max(THREAD_SIDEBAR_MIN_WIDTH, storedWidth);
  return Math.min(preferredWidth, resolveThreadSidebarMaximumWidth(viewportWidth));
}
