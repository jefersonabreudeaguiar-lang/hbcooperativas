/**
 * Cooperado assinou recibo neste dispositivo — evita UI de “assinar de novo”
 * enquanto sync/nuvem ainda traz pagamento sem assinatura.
 */
import type { AppData, PagamentoCooperadoRegistro } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";

const KEY_PREFIX = "hb.coop.reciboAssinadoLocal.v1:";
const LATCH_MAX_MS = 30 * 24 * 60 * 60 * 1000;

type LatchPayload = { pagamentoId: string; at: number };

function storageKey(cooperadoId: string, cooperativaId: string): string {
  return `${KEY_PREFIX}${cooperativaId}:${cooperadoId}`;
}

/** Cooperativa para latch/supressão — evita `coopId` vazio quando `cooperadoId` ≠ id na lista local. */
export function resolverCooperativaIdReciboLatch(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string | undefined {
  const hint = cooperativaId?.trim();
  if (hint) return hint;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, undefined);
  const fromCadastro =
    data.cooperados.find((c) => c.id === canon)?.cooperativaId ??
    data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (fromCadastro) return fromCadastro;
  const pg = data.pagamentosCooperado.find(
    (p) =>
      p.cooperadoId === cooperadoId ||
      p.cooperadoId === canon ||
      resolverCooperadoIdCanonico(data, p.cooperadoId, p.cooperativaId) === canon
  );
  return pg?.cooperativaId;
}

function readLatchRaw(cooperadoId: string, cooperativaId: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const key = storageKey(cooperadoId, cooperativaId);
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) return fromLocal;
    if (typeof sessionStorage !== "undefined") {
      const legacy = sessionStorage.getItem(key);
      if (legacy) {
        localStorage.setItem(key, legacy);
        sessionStorage.removeItem(key);
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function gravarReciboAssinadoLocalLatch(
  cooperadoId: string,
  cooperativaId: string,
  pagamentoId: string
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(cooperadoId, cooperativaId),
      JSON.stringify({ pagamentoId, at: Date.now() })
    );
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(storageKey(cooperadoId, cooperativaId));
    }
  } catch {
    /* private mode */
  }
}

export function lerReciboAssinadoLocalLatch(
  cooperadoId: string,
  cooperativaId: string
): LatchPayload | null {
  try {
    const raw = readLatchRaw(cooperadoId, cooperativaId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatchPayload;
    if (!parsed?.pagamentoId || !Number.isFinite(parsed.at)) return null;
    if (Date.now() - parsed.at > LATCH_MAX_MS) {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(storageKey(cooperadoId, cooperativaId));
      }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function pagamentoSuprimidoPorReciboAssinadoLocal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  pagamento: PagamentoCooperadoRegistro
): boolean {
  const coopId = resolverCooperativaIdReciboLatch(data, cooperadoId, cooperativaId);
  if (!coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const latch = lerReciboAssinadoLocalLatch(canon, coopId);
  if (!latch || latch.pagamentoId !== pagamento.id) return false;
  const local = data.pagamentosCooperado.find((p) => p.id === pagamento.id);
  if (local?.assinaturaCooperado?.trim()) return true;
  return Date.now() - latch.at < LATCH_MAX_MS;
}

/** Card Início PWA: motor zerado com prova local (assinatura ou latch recente). */
export function cooperadoTemReciboAssinadoLocalSemPendenciaUi(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  const coopId = resolverCooperativaIdReciboLatch(data, cooperadoId, cooperativaId);
  if (!coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const latch = lerReciboAssinadoLocalLatch(canon, coopId);
  if (!latch) return false;
  const pg = data.pagamentosCooperado.find((p) => p.id === latch.pagamentoId);
  if (pg?.assinaturaCooperado?.trim()) return true;
  return pg?.status === "confirmado" && Date.now() - latch.at < LATCH_MAX_MS;
}
