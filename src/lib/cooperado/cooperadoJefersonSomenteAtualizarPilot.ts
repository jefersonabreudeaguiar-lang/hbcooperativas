import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoGaMobileViewportAtivoLite,
  readCooperadoSessionLite,
} from "@/lib/cooperado/cooperadoSessionLite";

/**
 * Cooperado mobile GA — app leve na 1ª entrada; sync automático na 2ª entrada (≥30s).
 * BIC + snapshots lazy por aba. Homologado no piloto Jeferson → GA todos (build ≥715).
 */
export const COOPERADO_MOBILE_SYNC_LEVE_GA_PROMOTED = true;

/** @deprecated alias — usar `COOPERADO_MOBILE_SYNC_LEVE_GA_PROMOTED` */
export const COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON = COOPERADO_MOBILE_SYNC_LEVE_GA_PROMOTED;

function cooperadoMobileSyncLeveViewportAtivo(): boolean {
  if (typeof window === "undefined") return true;
  return cooperadoGaMobileViewportAtivoLite();
}

export function isCooperadoJefersonSomenteAtualizarPilot(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!COOPERADO_MOBILE_SYNC_LEVE_GA_PROMOTED) return false;
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  return cooperadoMobileSyncLeveViewportAtivo();
}

export function isCooperadoJefersonSomenteAtualizarSessionLite(): boolean {
  if (!COOPERADO_MOBILE_SYNC_LEVE_GA_PROMOTED) return false;
  const session = readCooperadoSessionLite();
  if (session?.role !== "cooperado") return false;
  return cooperadoMobileSyncLeveViewportAtivo();
}

let entregaSyncPermitDepth = 0;
let autoAtualizarPermitDepth = 0;

export function cooperadoJefersonAutoAtualizarEmCurso(): boolean {
  return autoAtualizarPermitDepth > 0;
}

export function withCooperadoJefersonAutoAtualizarPermitido<T>(fn: () => T): T {
  autoAtualizarPermitDepth += 1;
  try {
    return fn();
  } finally {
    autoAtualizarPermitDepth = Math.max(0, autoAtualizarPermitDepth - 1);
  }
}

export async function withCooperadoJefersonAutoAtualizarPermitidoAsync<T>(
  fn: () => Promise<T>
): Promise<T> {
  autoAtualizarPermitDepth += 1;
  try {
    return await fn();
  } finally {
    autoAtualizarPermitDepth = Math.max(0, autoAtualizarPermitDepth - 1);
  }
}

/** Libera sync operacional pontual (fotos / pós-envio) sem furar «só Atualizar» no resto do app. */
export function withCooperadoJefersonEntregaSyncPermitido<T>(fn: () => T): T {
  entregaSyncPermitDepth += 1;
  try {
    return fn();
  } finally {
    entregaSyncPermitDepth = Math.max(0, entregaSyncPermitDepth - 1);
  }
}

export async function withCooperadoJefersonEntregaSyncPermitidoAsync<T>(
  fn: () => Promise<T>
): Promise<T> {
  entregaSyncPermitDepth += 1;
  try {
    return await fn();
  } finally {
    entregaSyncPermitDepth = Math.max(0, entregaSyncPermitDepth - 1);
  }
}

export function cooperadoJefersonEntregaSyncPermitido(): boolean {
  return entregaSyncPermitDepth > 0;
}

export type CooperadoJefersonSyncGateOpts = {
  userInitiated?: boolean;
  eventDriven?: boolean;
};

/**
 * Verdadeiro = bloquear sync/pull pesado automático.
 * Permite: auto-atualizar (2ª entrada) e janela `withCooperadoJefersonEntregaSyncPermitido`.
 */
export function cooperadoJefersonBloqueiaSyncAutomatico(
  user: Omit<User, "password"> | null | undefined,
  opts?: CooperadoJefersonSyncGateOpts
): boolean {
  if (!isCooperadoJefersonSomenteAtualizarPilot(user)) return false;
  if (opts?.userInitiated) return false;
  if (cooperadoJefersonEntregaSyncPermitido()) return false;
  if (cooperadoJefersonAutoAtualizarEmCurso()) return false;
  return true;
}

/** Fragmento `<head>` — nenhuma sessão cooperado parseia o AppData antes da interface montar. */
export function cooperadoJefersonSomenteAtualizarInlineHeadSkipAppDataWarmJs(): string {
  if (!COOPERADO_MOBILE_SYNC_LEVE_GA_PROMOTED) return "";
  return (
    `try{var raw=localStorage.getItem("coopeagriplla_session");if(raw){var s=JSON.parse(raw);` +
    `if(s.role==="cooperado")return;}}catch(e){}`
  );
}
