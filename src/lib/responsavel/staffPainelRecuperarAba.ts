/**
 * Responsável — se a aba cair com JS velho, recarrega o documento uma vez.
 * Evita “página sem resposta” / “não terminou de carregar” preso no build antigo.
 */
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { isStaffSessionActiveInStorage } from "@/lib/staff/staffSessionRoleHint";

export const STAFF_PAINEL_RECARREGAR_ABA_SESSION_KEY = "hb-staff-aba-reload-stale";

export function staffDocumentoBuildAtrasado(pageBuild: number, appBuild: number): boolean {
  return Number.isFinite(pageBuild) && pageBuild > 0 && pageBuild < appBuild;
}

export function staffPodeRecarregarDocumentoUmaVez(opts: {
  pageBuild: number;
  appBuild: number;
  jaTentouNesteBuild: boolean;
}): boolean {
  if (opts.jaTentouNesteBuild) return false;
  return staffDocumentoBuildAtrasado(opts.pageBuild, opts.appBuild);
}

export function lerStaffDocumentoPageBuild(): number {
  if (typeof document === "undefined") return 0;
  return parseInt(document.documentElement.getAttribute("data-app-build") || "0", 10) || 0;
}

export function staffAbaDeveRecarregarDocumento(): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaffSessionActiveInStorage()) return false;
  try {
    if (window.location.search.includes("_hbStaffAba=")) return false;
  } catch {
    /* ignore */
  }
  let jaTentou = false;
  try {
    jaTentou = sessionStorage.getItem(STAFF_PAINEL_RECARREGAR_ABA_SESSION_KEY) === String(APP_BUILD_VERSION);
  } catch {
    jaTentou = false;
  }
  const deve = staffPodeRecarregarDocumentoUmaVez({
    pageBuild: lerStaffDocumentoPageBuild(),
    appBuild: APP_BUILD_VERSION,
    jaTentouNesteBuild: jaTentou,
  });
  if (!deve) return false;
  try {
    sessionStorage.setItem(STAFF_PAINEL_RECARREGAR_ABA_SESSION_KEY, String(APP_BUILD_VERSION));
  } catch {
    /* quota */
  }
  return true;
}

/** Troca o HTML — remount do React no JS velho não recupera a aba. */
export function recarregarAbaStaffDocumento(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("_hbStaffAba", String(APP_BUILD_VERSION));
    window.location.replace(u.pathname + u.search + u.hash);
  } catch {
    window.location.reload();
  }
}
