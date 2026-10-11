/** URL estável — não usar ?build= (criava vários SW e mantinha versões antigas ativas). */
export const HB_SERVICE_WORKER_URL = "/sw.js";

/** SW mínimo só com navigate seguro (substitui SW legado que gerava Response.error). */
export const PWA_SERVICE_WORKER_REGISTRATION_ENABLED = true;

export async function purgeLegacyHbServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  const legacy = regs.filter((reg) => {
    const url =
      reg.active?.scriptURL ?? reg.waiting?.scriptURL ?? reg.installing?.scriptURL ?? "";
    return url.includes("sw.js?") || url.includes("sw.js%3F");
  });
  await Promise.all(legacy.map((reg) => reg.unregister()));
}

export function registerHbServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  return purgeLegacyHbServiceWorkers().then(() => {
    if (!PWA_SERVICE_WORKER_REGISTRATION_ENABLED) {
      return null;
    }
    return navigator.serviceWorker.register(HB_SERVICE_WORKER_URL, {
      scope: "/",
      updateViaCache: "none",
    });
  });
}
