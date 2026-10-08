/**
 * Fase 2 — read models cooperado-scoped (localStorage + revision), sem migration de banco.
 * Materialização única no fim do sync mensageiro; telas leem snapshots versionados.
 */
import type { User } from "@/types";
import { getData, getDataRevision, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { recordCooperadoOperacionalMaterializedRevision } from "@/lib/performance/cooperadoOperacionalSyncDeltaRevision";

export const COOPERADO_SCOPED_READ_MODEL_STORE_VERSION = 1;

export type CooperadoReadModelKey =
  | "inicio"
  | "entregas-resumo"
  | "ficha-resumo"
  | "a-receber-card";

export type CooperadoScopedReadModelMeta = {
  v: number;
  cooperadoId: string;
  cooperativaId: string;
  appDataRevision: number;
  materializedAt: string;
  keys: CooperadoReadModelKey[];
};

function metaStorageKey(cooperadoId: string, cooperativaId: string): string {
  return `hb.coop.readModels.v${COOPERADO_SCOPED_READ_MODEL_STORE_VERSION}:${cooperativaId}:${cooperadoId}`;
}

export function lerCooperadoScopedReadModelMeta(
  cooperadoId: string,
  cooperativaId: string
): CooperadoScopedReadModelMeta | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(metaStorageKey(cooperadoId, cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoScopedReadModelMeta;
    if (parsed.v !== COOPERADO_SCOPED_READ_MODEL_STORE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getCooperadoScopedReadModelRevision(
  cooperadoId: string,
  cooperativaId: string
): number {
  return lerCooperadoScopedReadModelMeta(cooperadoId, cooperativaId)?.appDataRevision ?? -1;
}

/**
 * Chamado após inicio/entregas/a-receber já persistidos em persistirCooperadoPwaMessengerCaches.
 */
export function materializeCooperadoScopedReadModels(
  user: Omit<User, "password"> | null | undefined
): CooperadoScopedReadModelMeta | null {
  if (!user || user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return null;

  const data = getData();
  const dataRevision = getDataRevision();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return null;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);

  persistirCooperadoPwaFichaResumoSnapshotFromUser(user, true);

  const meta: CooperadoScopedReadModelMeta = {
    v: COOPERADO_SCOPED_READ_MODEL_STORE_VERSION,
    cooperadoId,
    cooperativaId: coopId,
    appDataRevision: dataRevision,
    materializedAt: new Date().toISOString(),
    keys: ["inicio", "entregas-resumo", "ficha-resumo", "a-receber-card"],
  };

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(metaStorageKey(cooperadoId, coopId), JSON.stringify(meta));
    } catch {
      /* quota */
    }
  }

  recordCooperadoOperacionalMaterializedRevision(coopId, dataRevision);
  return meta;
}
