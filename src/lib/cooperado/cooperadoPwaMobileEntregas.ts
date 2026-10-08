/**
 * Cooperado instalado (PWA) em viewport mobile — lista Entregas leve (snapshot),
 * sync operacional de notas só no fluxo de envio de fotos. Não afeta responsável/desktop.
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
