/**
 * PC gestão: UI responsiva > sync em background.
 * Celular mantém live sync / fila catch-up; desktop só abertura + «Atualizar».
 */
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";

export function staffGestaoEmViewportDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return !isStaffMobileViewportActive();
}

/** Sync periódico, idle, visibility e fila catch-up fora da Conferir. */
export function staffGestaoSyncBackgroundPermitido(): boolean {
  return isStaffMobileViewportActive();
}
