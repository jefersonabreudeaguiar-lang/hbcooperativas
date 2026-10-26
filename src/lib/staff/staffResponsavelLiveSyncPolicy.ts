/**
 * Atualização contínua e discreta da gestão (responsável / tesoureiro / admin).
 * Tier leve (notas_delta) — sem pull operacional automático (evita retrocesso na Ficha/Pagar).
 */
import type { AppData } from "@/types";
import type { SyncRunOptions } from "@/services/syncRequest";
import { staffGestaoEmViewportDesktop } from "@/lib/staff/staffGestaoModoDesktop";
import { staffResponsavelLifecycleSyncRequest } from "@/lib/staff/staffResponsavelSyncPolicy";

function readEnvMs(name: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 15_000 ? Math.round(n) : fallback;
}

export function isStaffGestaoLiveSyncEnabled(): boolean {
  if (staffGestaoEmViewportDesktop()) return false;
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-staff-gestao-live-sync-off") === "1") {
      return false;
    }
  }
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_STAFF_GESTAO_LIVE_SYNC ?? "true")
      : "true";
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

/** Notas/Conferir já tem poll dedicado — evita sync duplicado. */
export function staffGestaoLiveSyncSkippedOnPath(pathname: string): boolean {
  const p = pathname || "";
  return p === "/notas-pedido" || p.startsWith("/notas-pedido/");
}

/** Intervalo do tick em background (aba visível). */
export function resolveStaffGestaoLiveSyncIntervalMs(pathname: string): number {
  if (!isStaffGestaoLiveSyncEnabled()) return 0;
  if (staffGestaoLiveSyncSkippedOnPath(pathname)) return 0;
  const mobile =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(max-width: 1023px)")?.matches ?? false);
  if (mobile) {
    return readEnvMs("NEXT_PUBLIC_STAFF_GESTAO_LIVE_SYNC_INTERVAL_MOBILE_MS", 75_000);
  }
  return readEnvMs("NEXT_PUBLIC_STAFF_GESTAO_LIVE_SYNC_INTERVAL_MS", 55_000);
}

/** Um tick do loop — sempre silencioso, sem expandir operacional. */
export function staffResponsavelLiveSyncTickRequest(
  _pathname?: string,
  _data?: AppData | null
): SyncRunOptions {
  return {
    silent: true,
    tier: "notas_delta",
    staffLiveBackground: true,
  };
}

/** Voltar à aba / online — mesmo tier leve que o loop (substitui pulse). */
export function staffResponsavelLifecycleSyncRequestLive(
  data?: AppData | null
): SyncRunOptions | undefined {
  if (staffGestaoEmViewportDesktop()) return undefined;
  const base = staffResponsavelLifecycleSyncRequest(data);
  if (!base) return base;
  if (base.tier === "pulse") {
    return { ...base, tier: "notas_delta", staffLiveBackground: true };
  }
  if (base.tier === "notas_delta") {
    return { ...base, staffLiveBackground: true };
  }
  return base;
}
