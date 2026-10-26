/**
 * PC gestão — delega ao perfil único (`staffGestaoPerfilDesktop`).
 */
import {
  staffGestaoPerfilAberturaDelayMs,
  staffGestaoPerfilAberturaSyncPermitido,
  staffGestaoPerfilCapSyncAutomatico,
  staffGestaoPerfilEhDesktop,
  staffGestaoPerfilNotasLivePollPermitido,
  staffGestaoPerfilPersistReloadIdleTimeoutMs,
  staffGestaoPerfilSyncBackgroundPermitido,
} from "@/lib/staff/staffGestaoPerfilDesktop";

export { staffGestaoPerfilEhDesktop } from "@/lib/staff/staffGestaoPerfilDesktop";

export {
  staffGestaoPerfilAberturaSyncPermitido,
  staffGestaoPerfilNotasLivePollPermitido,
} from "@/lib/staff/staffGestaoPerfilDesktop";

export { staffGestaoPerfilCapSyncAutomatico } from "@/lib/staff/staffGestaoPerfilDesktop";

export function staffGestaoEmViewportDesktop(): boolean {
  return staffGestaoPerfilEhDesktop();
}

export function staffGestaoSyncBackgroundPermitido(): boolean {
  return staffGestaoPerfilSyncBackgroundPermitido();
}

export function staffGestaoAberturaSyncDelayMs(): number {
  return staffGestaoPerfilAberturaDelayMs();
}

export function staffGestaoPersistReloadIdleTimeoutMs(): number {
  return staffGestaoPerfilPersistReloadIdleTimeoutMs();
}
