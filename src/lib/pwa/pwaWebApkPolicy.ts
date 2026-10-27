/**
 * WebAPK (ícone Android): purge de SW + location.replace no cold start
 * causa "This page couldn't load". Reparo destrutivo só em pwa-rescue.html (?purge=1).
 */

/** Inline helper — incluir antes de guards que faziam purge automático. */
export function buildInlinePwaStandaloneHelper(): string {
  return `function hbCoopStandalonePwa(){try{return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;}catch(e){return false;}}`;
}

export const PWA_CHUNK_MISMATCH_SESSION_KEY = "hb-coop-pwa-chunk-mismatch";
