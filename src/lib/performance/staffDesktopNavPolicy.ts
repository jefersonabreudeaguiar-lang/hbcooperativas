/**
 * Desktop gestão: navegação 100% pelo Next (URL = tela).
 * Otimista / history.replace só no mobile — evita menu “travado” no PC.
 */
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";

export function staffGestaoUsaNavegacaoOtimista(): boolean {
  return isStaffMobileViewportActive();
}
