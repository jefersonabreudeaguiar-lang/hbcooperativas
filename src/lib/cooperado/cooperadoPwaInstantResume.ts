/**
 * Abertura estilo mensageiro — última tela do cache local antes do AppData terminar de aquecer.
 */
import type { User } from "@/types";
import { getSession } from "@/services/dataStore";
import {
  INICIO_CARD_STORAGE_VERSION,
  lerInicioCardPersistidoFlex,
  type InicioCardPersistido,
} from "@/lib/cooperadoInicioCardPersistencia";
import { filtrarInicioCardPersistidoLeituraBic } from "@/lib/cooperadoInicioCardPolicy";
import {
  COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION,
  lerCooperadoPwaInicioDashboardSnapshot,
  type CooperadoPwaInicioDashboardView,
} from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import {
  COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION,
  lerCooperadoPwaEntregasResumosSnapshot,
  type CooperadoPwaEntregasResumosSnapshot,
} from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { isCooperadoInstantResumeEnabled, cooperadoInstantShellReady } from "@/lib/performance/cooperadoColdStart";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const RESUME_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

function snapshotFreshEnough(savedAt: string | undefined): boolean {
  if (!savedAt) return false;
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= RESUME_MAX_AGE_MS;
}

export function lerInicioCardPersistidoResume(
  cooperadoId: string,
  cooperativaId: string | undefined
): InicioCardPersistido | null {
  const direct = filtrarInicioCardPersistidoLeituraBic(
    lerInicioCardPersistidoFlex(cooperadoId, cooperativaId)
  );
  if (direct) return direct;

  if (typeof localStorage === "undefined") return null;
  const prefix = `hb.coop.inicioCard.v${INICIO_CARD_STORAGE_VERSION}:`;
  const suffix = `:${cooperadoId}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix) || !key.endsWith(suffix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as InicioCardPersistido;
      if (parsed.v !== INICIO_CARD_STORAGE_VERSION || !parsed.display) continue;
      if (!snapshotFreshEnough(parsed.savedAt)) continue;
      return filtrarInicioCardPersistidoLeituraBic(parsed);
    }
  } catch {
    return null;
  }
  return null;
}

function lerPwaInicioDashRaw(
  cooperadoId: string,
  cooperativaId: string
): { view: CooperadoPwaInicioDashboardView; savedAt: string } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const key = `hb.coop.pwaInicioDash.v${COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION}:${cooperativaId}:${cooperadoId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v: number;
      appBuild?: number;
      view?: CooperadoPwaInicioDashboardView;
      savedAt?: string;
    };
    if (parsed.v !== COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION || !parsed.view) return null;
    if (parsed.appBuild != null && parsed.appBuild !== APP_BUILD_VERSION) return null;
    if (!snapshotFreshEnough(parsed.savedAt)) return null;
    return { view: parsed.view, savedAt: parsed.savedAt ?? "" };
  } catch {
    return null;
  }
}

export function lerCooperadoPwaInicioDashboardViewForResume(
  cooperadoId: string,
  cooperativaId: string | undefined
): CooperadoPwaInicioDashboardView | null {
  if (!cooperativaId) return null;
  const fresh = lerCooperadoPwaInicioDashboardSnapshot(cooperadoId, cooperativaId);
  if (fresh?.view) return fresh.view;
  return lerPwaInicioDashRaw(cooperadoId, cooperativaId)?.view ?? null;
}

function lerEntregasResumosRaw(
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaEntregasResumosSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const key = `hb.coop.pwaEntregasResumos.v${COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION}:${cooperativaId}:${cooperadoId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPwaEntregasResumosSnapshot;
    if (parsed.v !== COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION || !Array.isArray(parsed.entregasBase)) {
      return null;
    }
    if (!snapshotFreshEnough(parsed.savedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function lerCooperadoPwaEntregasResumosForResume(
  cooperadoId: string,
  cooperativaId: string | undefined
): CooperadoPwaEntregasResumosSnapshot | null {
  if (!cooperativaId) return null;
  const fresh = lerCooperadoPwaEntregasResumosSnapshot(cooperadoId, cooperativaId);
  if (fresh) return fresh;
  return lerEntregasResumosRaw(cooperadoId, cooperativaId);
}

/** Libera pintura do app cooperado PWA sem esperar parse completo do AppData. */
export function cooperadoPwaInstantPaintReady(user: Omit<User, "password"> | null): boolean {
  if (!isCooperadoInstantResumeEnabled() || !user || user.role !== "cooperado") return false;
  if (!isCooperadoPwaMobileLeveUi() || !getSession()) return false;
  if (!user.cooperadoId) return cooperadoInstantShellReady(user);

  const coopId = user.cooperativaId;
  if (lerInicioCardPersistidoResume(user.cooperadoId, coopId)) return true;
  if (coopId && lerCooperadoPwaInicioDashboardViewForResume(user.cooperadoId, coopId)) return true;
  if (coopId && lerCooperadoPwaEntregasResumosForResume(user.cooperadoId, coopId)) return true;

  return cooperadoInstantShellReady(user);
}
