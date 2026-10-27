"use client";

import { useEffect } from "react";

/**
 * PWA instalado: registro de SW ficou só no script inline do layout (browser).
 * No WebAPK, registrar aqui competia com o head e causava "couldn't load" (cac23f4d).
 */
export function PwaSilentServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
  }, []);

  return null;
}
