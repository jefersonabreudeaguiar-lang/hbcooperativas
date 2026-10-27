/** Navegação full-page após o documento commitar — evita “This page couldn’t load” (WebAPK / login). */
export function scheduleSafeAppNavigation(dest: string, minDelayMs = 0): void {
  if (typeof window === "undefined") return;
  const pathOnly = dest.split("?")[0];
  if (window.location.pathname === pathOnly) return;

  const go = () => {
    window.setTimeout(() => {
      try {
        window.location.assign(dest);
      } catch {
        window.location.href = dest;
      }
    }, minDelayMs);
  };

  if (document.readyState === "complete") {
    go();
    return;
  }
  window.addEventListener("load", go, { once: true });
}
