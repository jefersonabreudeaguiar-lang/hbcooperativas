/**
 * Cooperado instalado (PWA) em viewport mobile.
 * Snapshot/lista leve desligado — AppData ao vivo nas abas (keep-alive + tabActive).
 * Sync operacional pesado de notas pode adiar até anexar/enviar fotos.
 */
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

function isCooperadoPwaMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (!isAppStandalone()) return false;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

/** @deprecated Snapshot Entregas/Início — desligado; use AppData com aba ativa. */
export function isCooperadoPwaMobileEntregasLeve(): boolean {
  return false;
}

/** PWA mobile cooperado: pull de notas só no fluxo de envio (menos jank na navegação). */
export function isCooperadoPwaMobileEntregasSyncDeferUntilEnvio(): boolean {
  return isCooperadoPwaMobileViewport();
}
