import type { PagamentoCooperadoRegistro } from "@/types";
import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";

export type OperacionalPagamentosSlice = {
  pagamentosCooperado: PagamentoCooperadoRegistro[];
};

const PAGAMENTO_STATUS_RANK: Record<PagamentoCooperadoRegistro["status"], number> = {
  aguardando_confirmacao: 0,
  confirmado: 1,
};

const PAGAMENTO_STATUS_FINANCEIRO_FULLRESET: ReadonlySet<PagamentoCooperadoRegistro["status"]> =
  new Set(["confirmado", "aguardando_confirmacao"]);

export function isPagamentoStatusFinanceiroFullReset(
  status: PagamentoCooperadoRegistro["status"]
): boolean {
  return PAGAMENTO_STATUS_FINANCEIRO_FULLRESET.has(status);
}

/** Mesmo critério de `operacionalPayloadVazioLegitimo` (PATCH A H8.9.197) para ramo financeiro. */
export function operacionalFullResetFinanceiroVazio(payload: {
  fichaCorrida?: { valorLiquido?: number }[];
  pagamentosCooperado?: PagamentoCooperadoRegistro[];
}): boolean {
  const fichas = payload.fichaCorrida ?? [];
  const pags = payload.pagamentosCooperado ?? [];
  const sumFichas = fichas.reduce((s, f) => s + (f.valorLiquido ?? 0), 0);
  return fichas.length === 0 && pags.length === 0 && sumFichas < 0.01;
}

/**
 * H8.9.201 / H8.9.203 — fullReset: reinjeta da cloud pagamentos financeiros ausentes no incoming, por ID.
 */
export function preservarPagamentosFinanceirosFullReset(
  cloudPagamentos: PagamentoCooperadoRegistro[],
  incomingPagamentos: PagamentoCooperadoRegistro[]
): PagamentoCooperadoRegistro[] {
  const incomingMap = new Map(incomingPagamentos.map((p) => [p.id, p]));
  const outMap = new Map(incomingMap);

  for (const cloudPay of cloudPagamentos) {
    if (!isPagamentoStatusFinanceiroFullReset(cloudPay.status)) continue;
    if (incomingMap.has(cloudPay.id)) continue;
    outMap.set(cloudPay.id, cloudPay);
  }

  return [...outMap.values()];
}

/** @deprecated alias — mesma semântica que `preservarPagamentosFinanceirosFullReset` */
export function preservarPagamentosFinanceirosFullResetVazio(
  cloudPagamentos: PagamentoCooperadoRegistro[],
  incomingPagamentos: PagamentoCooperadoRegistro[]
): PagamentoCooperadoRegistro[] {
  return preservarPagamentosFinanceirosFullReset(cloudPagamentos, incomingPagamentos);
}

export function aplicarPreservacaoFinanceiraFullResetNoOperacional<
  T extends OperacionalPagamentosSlice & { fichaCorrida?: { valorLiquido?: number }[] },
>(cloudOperacional: T | null | undefined, incomingOperacional: T): T {
  const pagamentos = preservarPagamentosFinanceirosFullReset(
    cloudOperacional?.pagamentosCooperado ?? [],
    incomingOperacional.pagamentosCooperado ?? []
  );
  return { ...incomingOperacional, pagamentosCooperado: pagamentos };
}

/** @deprecated alias — use `aplicarPreservacaoFinanceiraFullResetNoOperacional` */
export function aplicarPreservacaoFinanceiraFullResetVazioNoOperacional<
  T extends OperacionalPagamentosSlice & { fichaCorrida?: { valorLiquido?: number }[] },
>(cloudOperacional: T | null | undefined, incomingOperacional: T): T {
  return aplicarPreservacaoFinanceiraFullResetNoOperacional(cloudOperacional, incomingOperacional);
}

export function mergePagamentoRegistro(
  prev: PagamentoCooperadoRegistro | undefined,
  incoming: PagamentoCooperadoRegistro
): PagamentoCooperadoRegistro {
  if (!prev) return incoming;
  if (prev.status === "confirmado" && incoming.status !== "confirmado") return prev;
  if (incoming.status === "confirmado" && prev.status !== "confirmado") return incoming;
  const prevRank = PAGAMENTO_STATUS_RANK[prev.status] ?? 0;
  const incRank = PAGAMENTO_STATUS_RANK[incoming.status] ?? 0;
  if (incRank > prevRank) return incoming;
  if (prevRank > incRank) return prev;
  const prevT = new Date(prev.updatedAt ?? prev.createdAt ?? 0).getTime();
  const incT = new Date(incoming.updatedAt ?? incoming.createdAt ?? 0).getTime();
  return incT >= prevT ? incoming : prev;
}

function pagamentoRecordTime(p: PagamentoCooperadoRegistro): number {
  const t = new Date(p.updatedAt ?? p.createdAt ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Par local × cloud — monotonicidade confirmado (PAY-TMP-001 / SYNC-001/S3). */
export function mergePagamentoCooperadoRecord(
  local: PagamentoCooperadoRegistro,
  cloud: PagamentoCooperadoRegistro
): PagamentoCooperadoRegistro {
  if (local.status === "confirmado" && cloud.status !== "confirmado") return local;
  if (cloud.status === "confirmado" && local.status !== "confirmado") return cloud;
  const localRank = PAGAMENTO_STATUS_RANK[local.status] ?? 0;
  const cloudRank = PAGAMENTO_STATUS_RANK[cloud.status] ?? 0;
  if (localRank > cloudRank) return local;
  if (cloudRank > localRank) return cloud;
  if (local.status === "confirmado" && cloud.status === "confirmado") {
    const localAssinado = Boolean(local.assinaturaCooperado?.trim());
    const cloudAssinado = Boolean(cloud.assinaturaCooperado?.trim());
    if (localAssinado && !cloudAssinado) return local;
    if (cloudAssinado && !localAssinado) return cloud;
    if (local.reciboHtml && !cloud.reciboHtml) return local;
    if (cloud.reciboHtml && !local.reciboHtml) return cloud;
    const localPago = new Date(local.pagoEm).getTime();
    const cloudPago = new Date(cloud.pagoEm).getTime();
    if (Number.isFinite(localPago) && Number.isFinite(cloudPago) && localPago !== cloudPago) {
      return localPago <= cloudPago ? local : cloud;
    }
    if (
      local.valorLiquido !== cloud.valorLiquido ||
      local.valorBruto !== cloud.valorBruto ||
      local.descontoCooperativa !== cloud.descontoCooperativa
    ) {
      return local;
    }
  }
  return pagamentoRecordTime(local) >= pagamentoRecordTime(cloud) ? local : cloud;
}

/**
 * Autoridade única GET/pull × POST/merge — pagamentos cooperativa no sync operacional.
 */
export function mergePagamentosCooperadoFromCloud(
  localCoop: PagamentoCooperadoRegistro[],
  cloudItems: PagamentoCooperadoRegistro[]
): PagamentoCooperadoRegistro[] {
  const map = new Map<string, PagamentoCooperadoRegistro>();
  for (const item of cloudItems) map.set(item.id, item);
  for (const local of localCoop) {
    const cloud = map.get(local.id);
    if (!cloud) {
      map.set(local.id, local);
      continue;
    }
    map.set(local.id, mergePagamentoCooperadoRecord(local, cloud));
  }
  const pairwise = [...map.values()];
  let pagamentos = preservarPagamentosConfirmados(cloudItems, pairwise).pagamentos;
  const localConfirmados = localCoop.filter((p) => p.status === "confirmado");
  if (localConfirmados.length) {
    pagamentos = preservarPagamentosConfirmados(localConfirmados, pagamentos).pagamentos;
  }
  return pagamentos;
}

/** Sanitiza slice cloud do GET/pull antes do merge — não propaga aguardando stale sobre confirmado local. */
export function prepararOperacionalSyncPayloadPagamentosPull(
  localPagamentosCoop: PagamentoCooperadoRegistro[],
  operacional: OperacionalSyncPayload,
  coopId: string
): OperacionalSyncPayload {
  const cloudPag = (operacional.pagamentosCooperado ?? []).map((p) => ({
    ...p,
    cooperativaId: p.cooperativaId ?? coopId,
  }));
  if (!cloudPag.length) return operacional;
  const sanitizedCloud = cloudPag.map((cloud) => {
    const local = localPagamentosCoop.find((l) => l.id === cloud.id);
    return local ? mergePagamentoCooperadoRecord(local, cloud) : cloud;
  });
  return { ...operacional, pagamentosCooperado: sanitizedCloud };
}

export type PagamentoDowngradeBloqueado = {
  pagamentoId: string;
  cloudStatus: PagamentoCooperadoRegistro["status"];
  incomingStatus: PagamentoCooperadoRegistro["status"] | "ausente";
  motivo: "downgrade protegido";
  occurredAt: string;
};

export type PagamentoConfirmacaoAuditEvidence = {
  pagamentoId: string;
  confirmedAt: string;
};

export type PreservarPagamentosConfirmadosOptions = {
  /** Confirmação válida registrada em cooperative_audit_log (blob já regredido). */
  auditConfirmacao?: Map<string, PagamentoConfirmacaoAuditEvidence>;
};

/**
 * Pagamentos cujo incoming pode regredir confirmação e a nuvem atual não está confirmada
 * (H8.9.21 já cobre cloud confirmado — evita consulta de audit desnecessária).
 */
export function pagamentoIdsPotencialmenteRegressivos(
  cloudPagamentos: PagamentoCooperadoRegistro[],
  incomingPagamentos: PagamentoCooperadoRegistro[]
): string[] {
  const cloudMap = new Map(cloudPagamentos.map((p) => [p.id, p]));
  const ids: string[] = [];
  for (const incoming of incomingPagamentos) {
    if (incoming.status === "confirmado") continue;
    const cloud = cloudMap.get(incoming.id);
    if (cloud?.status === "confirmado") continue;
    if (incoming.status === "aguardando_confirmacao") {
      ids.push(incoming.id);
    }
  }
  return ids;
}

function anchorConfirmadoFromAuditEvidence(
  cloudPay: PagamentoCooperadoRegistro | undefined,
  incomingPay: PagamentoCooperadoRegistro,
  evidence: PagamentoConfirmacaoAuditEvidence
): PagamentoCooperadoRegistro {
  const merged = cloudPay ? mergePagamentoRegistro(cloudPay, incomingPay) : incomingPay;
  return {
    ...merged,
    status: "confirmado",
    assinaturaCooperado: merged.assinaturaCooperado ?? cloudPay?.assinaturaCooperado,
    reciboHtml: merged.reciboHtml ?? cloudPay?.reciboHtml,
    assinadoEm: merged.assinadoEm ?? cloudPay?.assinadoEm ?? evidence.confirmedAt,
  };
}

/** Mescla lista de pagamentos impedindo regressão de status confirmado na nuvem. */
export function preservarPagamentosConfirmados(
  cloudPagamentos: PagamentoCooperadoRegistro[],
  incomingPagamentos: PagamentoCooperadoRegistro[],
  options?: PreservarPagamentosConfirmadosOptions
): { pagamentos: PagamentoCooperadoRegistro[]; blockedDowngrades: PagamentoDowngradeBloqueado[] } {
  const cloudMap = new Map(cloudPagamentos.map((p) => [p.id, p]));
  const incomingMap = new Map(incomingPagamentos.map((p) => [p.id, p]));
  const auditMap = options?.auditConfirmacao ?? new Map<string, PagamentoConfirmacaoAuditEvidence>();
  const blockedDowngrades: PagamentoDowngradeBloqueado[] = [];
  const outMap = new Map(incomingMap);

  for (const [id, cloudPay] of cloudMap) {
    if (cloudPay.status !== "confirmado") continue;
    const incomingPay = incomingMap.get(id);
    if (!incomingPay || incomingPay.status !== "confirmado") {
      blockedDowngrades.push({
        pagamentoId: id,
        cloudStatus: cloudPay.status,
        incomingStatus: incomingPay?.status ?? "ausente",
        motivo: "downgrade protegido",
        occurredAt: new Date().toISOString(),
      });
      outMap.set(id, cloudPay);
      continue;
    }
    outMap.set(id, mergePagamentoRegistro(cloudPay, incomingPay));
  }

  for (const [id, evidence] of auditMap) {
    const incomingPay = outMap.get(id) ?? incomingMap.get(id);
    if (!incomingPay || incomingPay.status === "confirmado") continue;
    const cloudPay = cloudMap.get(id);
    const anchor = anchorConfirmadoFromAuditEvidence(cloudPay, incomingPay, evidence);
    const merged = mergePagamentoRegistro(anchor, incomingPay);
    if (merged.status !== "confirmado") continue;
    blockedDowngrades.push({
      pagamentoId: id,
      cloudStatus: "confirmado",
      incomingStatus: incomingPay.status,
      motivo: "downgrade protegido",
      occurredAt: new Date().toISOString(),
    });
    outMap.set(id, merged);
  }

  return { pagamentos: [...outMap.values()], blockedDowngrades };
}

/** Aplica proteção de pagamentos confirmados no payload operacional antes do upload. */
export function aplicarPreservacaoPagamentosConfirmadosNoOperacional<
  T extends OperacionalPagamentosSlice,
>(
  cloudOperacional: T | null | undefined,
  incomingOperacional: T,
  options?: PreservarPagamentosConfirmadosOptions
): { payload: T; blockedDowngrades: PagamentoDowngradeBloqueado[] } {
  const { pagamentos, blockedDowngrades } = preservarPagamentosConfirmados(
    cloudOperacional?.pagamentosCooperado ?? [],
    incomingOperacional.pagamentosCooperado ?? [],
    options
  );
  return {
    payload: { ...incomingOperacional, pagamentosCooperado: pagamentos },
    blockedDowngrades,
  };
}
