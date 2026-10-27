import type { User } from "@/types";
import {
  COOPERADO_MOBILE_PILOT_COOPERADO_ID,
  COOPERADO_MOBILE_PILOT_EMAIL,
  isCooperadoMobilePilot,
} from "@/lib/cooperado/cooperadoMobilePilot";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { readCooperadoSessionLite } from "@/lib/cooperado/cooperadoSessionLite";

/**
 * Piloto Jeferson — app leve na 1ª entrada; sync financeiro automático após 2ª entrada (≥30s).
 * Exceção: fotos de entrega (envio imediato). Produção (Orlando+): inalterado.
 */
export const COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON = true;

export function isCooperadoJefersonSomenteAtualizarPilot(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON) return false;
  return isCooperadoMobilePilot(user);
}

export function isCooperadoJefersonSomenteAtualizarSessionLite(): boolean {
  if (!COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON) return false;
  const session = readCooperadoSessionLite();
  return session?.role === "cooperado" && isCooperadoMobilePilot(session);
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

/** Fragmento `<head>` — Jeferson piloto não faz parse do operacional no cold start. */
export function cooperadoJefersonSomenteAtualizarInlineHeadSkipAppDataWarmJs(): string {
  if (!COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON) return "";
  const id = COOPERADO_MOBILE_PILOT_COOPERADO_ID;
  const email = normalizeAuthEmail(COOPERADO_MOBILE_PILOT_EMAIL);
  return (
    `try{var raw=localStorage.getItem("coopeagriplla_session");if(raw){var s=JSON.parse(raw);` +
    `var cid=(s.cooperadoId||s.mobileCooperadoId||"").trim();` +
    `var em=(s.email||"").toLowerCase().trim();` +
    `if(s.role==="cooperado"&&(cid==="` +
    id +
    `"||em==="` +
    email +
    `"))return;}}catch(e){}`
  );
}
