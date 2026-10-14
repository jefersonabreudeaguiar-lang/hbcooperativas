/**
 * Cooperado mobile — UI leve + modo mensageiro (mesmo pacote do piloto Jeferson no PWA).
 * GA no celular: leve mesmo abrindo pelo navegador; PWA instalado continua igual.
 * Não afeta responsável/desktop.
 */
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { getSession } from "@/services/dataStore";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

export function isCooperadoPwaMobileEntregasLeve(): boolean {
  if (typeof window === "undefined") return false;
  let mobile = false;
  try {
    mobile = window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
  if (!mobile) return false;
  const session = getSession();
  if (session?.role === "cooperado" && isCooperadoMobileGaPromoted(session)) {
    return true;
  }
  return isAppStandalone();
}

/** PWA mobile cooperado: pull de notas só no fluxo de envio (menos jank na navegação). */
export function isCooperadoPwaMobileEntregasSyncDeferUntilEnvio(): boolean {
  return isCooperadoPwaMobileEntregasLeve();
}
