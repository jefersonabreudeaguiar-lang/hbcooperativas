import type { PagamentoCooperadoRegistro } from "@/types";

export type OperacionalPagamentosSlice = {
  pagamentosCooperado: PagamentoCooperadoRegistro[];
};

const PAGAMENTO_STATUS_RANK: Record<PagamentoCooperadoRegistro["status"], number> = {
  aguardando_confirmacao: 0,
  confirmado: 1,
};

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
