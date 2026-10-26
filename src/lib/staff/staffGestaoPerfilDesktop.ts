/**
 * Contrato único — gestão no PC (viewport ≥1024px).
 * Toda decisão “desktop vs mobile” da staff passa aqui ou em staffGestaoModoDesktop (reexport).
 */
import type { SyncRunOptions } from "@/services/syncRequest";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";

/** Bump + teste `test-staff-gestao-perfil-desktop.ts` a cada mudança de comportamento PC. */
export const STAFF_GESTAO_DESKTOP_PERFIL_VERSION = 7;

export function staffGestaoPerfilEhDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return !isStaffMobileViewportActive();
}

export function staffGestaoPerfilSyncBackgroundPermitido(): boolean {
  return isStaffMobileViewportActive();
}

/** PC: sem sync automático na abertura — só «Atualizar». */
export function staffGestaoPerfilAberturaSyncPermitido(): boolean {
  return !staffGestaoPerfilEhDesktop();
}

export function staffGestaoPerfilAberturaDelayMs(): number {
  return staffGestaoPerfilEhDesktop() ? 0 : 400;
}

export function staffGestaoPerfilPersistReloadIdleTimeoutMs(): number {
  return staffGestaoPerfilEhDesktop() ? 5_000 : 180;
}

/** Poll da fila Conferir — só mobile; PC usa Atualizar na tela. */
export function staffGestaoPerfilNotasLivePollPermitido(): boolean {
  return isStaffMobileViewportActive();
}

/** PC: Pagar/Em aberto usam a mesma leitura — sem reinjetar aba last-good após F5. */
export function staffGestaoPerfilReaplicarAbaLastGoodPermitido(): boolean {
  return isStaffMobileViewportActive();
}

/** Reconciliar livro no Início/Notas disparava subscribe → loop no PC. */
export function staffGestaoPerfilReconciliarLivroForaDoLivroCaixa(): boolean {
  return !staffGestaoPerfilEhDesktop();
}

/** Desktop: hook de reconciliar livro só roda em `/livro-caixa` (sem subscribe AppData). */
export function staffGestaoPerfilReconciliarLivroCaixaAtivoForViewport(
  desktop: boolean,
  pathname: string
): boolean {
  if (!desktop) return true;
  const p = pathname || "";
  return p === "/livro-caixa" || p.startsWith("/livro-caixa/");
}

export function staffGestaoPerfilReconciliarLivroCaixaAtivo(pathname: string): boolean {
  return staffGestaoPerfilReconciliarLivroCaixaAtivoForViewport(staffGestaoPerfilEhDesktop(), pathname);
}

/** Monta `useReconciliarLivroCaixaGestao` só onde a política permite (PC = só livro-caixa). */
export function staffGestaoPerfilReconciliarLivroHookHabilitado(
  pathname: string,
  baseEnabled: boolean
): boolean {
  if (!baseEnabled) return false;
  if (!staffGestaoPerfilEhDesktop()) return true;
  return staffGestaoPerfilReconciliarLivroCaixaAtivo(pathname);
}

export function staffGestaoPerfilAtributosDom(): Record<string, string> {
  const desktop = staffGestaoPerfilEhDesktop();
  return {
    "data-staff-gestao-perfil": desktop ? "desktop" : "mobile",
    "data-staff-gestao-perfil-version": String(STAFF_GESTAO_DESKTOP_PERFIL_VERSION),
  };
}

export function staffGestaoPerfilPrefetchNavDelayMs(): number {
  return staffGestaoPerfilEhDesktop() ? 12_000 : 0;
}

export function staffGestaoPerfilTabHopQuietMs(): number {
  return staffGestaoPerfilEhDesktop() ? 2_400 : 1_200;
}

/**
 * Sync automático no PC: só tiers leves. Pesado = botão Atualizar / ação explícita.
 * Retorna `null` para cancelar o run.
 */
export function staffGestaoPerfilCapSyncAutomaticoForViewport(
  desktop: boolean,
  opts?: SyncRunOptions
): SyncRunOptions | null | undefined {
  if (!desktop) return opts;
  if (opts?.userInitiated === true || opts?.eventDriven === true) return opts;
  return null;
}

export function staffGestaoPerfilCapSyncAutomatico(
  opts?: SyncRunOptions
): SyncRunOptions | null | undefined {
  return staffGestaoPerfilCapSyncAutomaticoForViewport(staffGestaoPerfilEhDesktop(), opts);
}
