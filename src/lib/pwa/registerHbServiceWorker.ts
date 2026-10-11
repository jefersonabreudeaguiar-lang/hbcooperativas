/** URL estável — não usar ?build= (criava vários SW e mantinha versões antigas ativas). */
export const HB_SERVICE_WORKER_URL = "/sw.js";

/** Cooperado: não registrar SW no cliente — só remover legado do aparelho. */
export const PWA_SERVICE_WORKER_REGISTRATION_ENABLED = false;

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

/** Remove todos os service workers do origin (única forma segura de matar SW ≤307 no aparelho). */
export async function purgeAllHbServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((reg) => reg.unregister()));
}

/** Apenas purga — nunca registra SW de novo. */
export function registerHbServiceWorker(): Promise<null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  return purgeAllHbServiceWorkers().then(() => null);
}
