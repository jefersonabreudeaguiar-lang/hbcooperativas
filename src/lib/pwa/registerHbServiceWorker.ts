/** URL estável — não usar ?build= (criava vários SW e mantinha versões antigas ativas). */
export const HB_SERVICE_WORKER_URL = "/sw.js";

/** Registra SW de passthrough (substitui legado) em PWA/standalone. */
export const PWA_SERVICE_WORKER_REGISTRATION_ENABLED = true;

function registrationScriptUrl(reg: ServiceWorkerRegistration): string {
  return (
    reg.active?.scriptURL ??
    reg.waiting?.scriptURL ??
    reg.installing?.scriptURL ??
    ""
  );
}

export async function purgeLegacyHbServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  const legacy = regs.filter((reg) => {
    const url = registrationScriptUrl(reg);
    return url.includes("sw.js?") || url.includes("sw.js%3F");
  });
  await Promise.all(legacy.map((reg) => reg.unregister()));
}

/** Remove todos os service workers do origin (rescue / align hard). */
export async function purgeAllHbServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((reg) => reg.unregister()));
}

/** Substitui SW legado por /sw.js de passthrough; não apaga o registro estável. */
export function registerHbServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!PWA_SERVICE_WORKER_REGISTRATION_ENABLED) {
    return purgeAllHbServiceWorkers().then(() => null);
  }
  return purgeLegacyHbServiceWorkers()
    .then(() =>
      navigator.serviceWorker.register(HB_SERVICE_WORKER_URL, {
        scope: "/",
        updateViaCache: "none",
      })
    )
    .catch(() => null);
}
