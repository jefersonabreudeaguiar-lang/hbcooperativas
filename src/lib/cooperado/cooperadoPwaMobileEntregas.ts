/**
 * Cooperado instalado (PWA) em viewport mobile — UI leve + sync de notas no envio.
 * Não afeta responsável/desktop.
 */
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

export function isCooperadoPwaMobileEntregasLeve(): boolean {
  if (typeof window === "undefined") return false;
  if (!isAppStandalone()) return false;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

/** PWA mobile cooperado: pull de notas só no fluxo de envio (menos jank na navegação). */
export function isCooperadoPwaMobileEntregasSyncDeferUntilEnvio(): boolean {
  return isCooperadoPwaMobileEntregasLeve();
}
