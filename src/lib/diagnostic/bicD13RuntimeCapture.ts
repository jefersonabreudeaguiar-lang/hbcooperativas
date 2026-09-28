/**
 * BIC-D1.3 — captura read-only do estado financeiro via getData() (mesma base da UI).
 * Não persiste, não sincroniza, não muta AppData.
 */
import { getData } from "@/services/dataStore";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  pagamentoCooperadoPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import {
  getMesesReferenciaPagamento,
  getPagamentoAguardandoCooperado,
} from "@/services/notaPedidoService";
import { getValorQuantoVouReceber } from "@/services/cooperadoEntregasService";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "@/types";

export const BIC_D13_ORLANDO_COOPERADO_ID = "c_1782263929381_ncp55";

export const BIC_D13_REF_PG_ANTIGO = "pg_1790308339483";
export const BIC_D13_REF_NOTA_ANTIGA = "np_1788303617362_vyhfo";
export const BIC_D13_REF_FICHA_ANTIGA = "fc_1790155711622_jr6lg";
export const BIC_D13_REF_NOTA_NOVA = "np_1790468465026_odrs8";
export const BIC_D13_REF_FICHA_NOVA = "fc_1790517048539_mibxc";

const SENSITIVE_PAGAMENTO_KEYS = new Set([
  "reciboHtml",
  "assinaturaCooperado",
  "pagoPor",
  "reciboConferidoPorId",
  "reciboConferidoPorNome",
]);

export type BicD13PagamentoDiagnostico = {
  pagamentoId: string;
  cooperadoId: string;
  status: PagamentoCooperadoRegistro["status"];
  fichaIds: string[];
  notaPedidoIds: string[];
  valorBruto: number;
  valorLiquido: number;
  descontoCooperativa: number;
  referenciaMes: string;
  mesesReferencia?: string[];
  createdAt?: string;
  updatedAt?: string;
  pagoEm?: string;
  assinadoEm?: string;
};

export type BicD13FichaDiagnostico = {
  fichaId: string;
  cooperadoId: string;
  status: FichaCorrida["status"];
  notaPedidoId: string;
  mes: string;
  valorBruto: number;
  valorLiquido: number;
  createdAt: string;
  updatedAt?: string;
};

export type BicD13NotaDiagnostico = {
  notaId: string;
  cooperadoId: string;
  status: NotaPedido["status"];
  valorTotal: number;
  valorLiquido: number;
  createdAt: string;
  updatedAt?: string;
  serverUpdatedAt?: string;
};

export type BicD13ComparacaoPgAntigo = {
  referenciaId: typeof BIC_D13_REF_PG_ANTIGO;
  presenteNoAppData: boolean;
  statusSePresente: PagamentoCooperadoRegistro["status"] | null;
  outrosAguardandoConfirmacao: BicD13PagamentoDiagnostico[];
  outrosConfirmados: BicD13PagamentoDiagnostico[];
  observacao: string;
};

export type BicD13RuntimeCaptureResult = {
  meta: {
    ticket: "BIC-D1.3";
    capturedAt: string;
    dataSource: "getData()";
    cooperadoAlvo: string;
    cooperadoCanonico: string;
    cooperativaId: string | null;
    aviso: string;
  };
  pagamentos: BicD13PagamentoDiagnostico[];
  fichas: BicD13FichaDiagnostico[];
  notas: BicD13NotaDiagnostico[];
  pagamentosAguardando: BicD13PagamentoDiagnostico[];
  pagamentosConfirmados: BicD13PagamentoDiagnostico[];
  pagamentosRelacionadosAoCicloAntigo: BicD13PagamentoDiagnostico[];
  pagamentosRelacionadosAoCicloNovo: BicD13PagamentoDiagnostico[];
  comparacaoPg1790308339483: BicD13ComparacaoPgAntigo;
  projecaoUiSomenteLeitura: {
    aguardandoAssinatura: boolean;
    valorRecibo: number;
    valorAberto: number;
    mesLabel: string;
    pagamentoAguardandoCooperadoId: string | null;
    disclaimer: string;
  };
  registroPotencialmenteResponsavelPeloRecibo: {
    pagamentoId: string | null;
    status: PagamentoCooperadoRegistro["status"] | null;
    valorLiquido: number | null;
    fichaIds: string[];
    notaPedidoIds: string[];
    disclaimer: string;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function pagamentoToDiagnostico(p: PagamentoCooperadoRegistro): BicD13PagamentoDiagnostico {
  const meses = getMesesReferenciaPagamento(p);
  return {
    pagamentoId: p.id,
    cooperadoId: p.cooperadoId,
    status: p.status,
    fichaIds: [...(p.fichaIds ?? [])],
    notaPedidoIds: [...(p.notaPedidoIds ?? [])],
    valorBruto: p.valorBruto,
    valorLiquido: p.valorLiquido,
    descontoCooperativa: p.descontoCooperativa,
    referenciaMes: p.mesReferencia,
    mesesReferencia: p.mesesReferencia?.length ? [...p.mesesReferencia] : undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    pagoEm: p.pagoEm,
    assinadoEm: p.assinadoEm,
  };
}

function pagamentoRelacionadoCicloAntigo(p: PagamentoCooperadoRegistro): boolean {
  if (p.id === BIC_D13_REF_PG_ANTIGO) return true;
  if (p.fichaIds?.includes(BIC_D13_REF_FICHA_ANTIGA)) return true;
  if (p.notaPedidoIds?.includes(BIC_D13_REF_NOTA_ANTIGA)) return true;
  return false;
}

function pagamentoRelacionadoCicloNovo(p: PagamentoCooperadoRegistro): boolean {
  if (p.fichaIds?.includes(BIC_D13_REF_FICHA_NOVA)) return true;
  if (p.notaPedidoIds?.includes(BIC_D13_REF_NOTA_NOVA)) return true;
  return false;
}

function assertNoSensitivePagamentoFields(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) assertNoSensitivePagamentoFields(item);
    return;
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (SENSITIVE_PAGAMENTO_KEYS.has(key)) {
      throw new Error(`BIC-D1.3: campo sensível vazado na captura: ${key}`);
    }
    assertNoSensitivePagamentoFields((obj as Record<string, unknown>)[key]);
  }
}

/** Núcleo puro — testável sem browser. */
export function buildBicD13RuntimeCaptureFromAppData(
  data: AppData,
  cooperadoId: string = BIC_D13_ORLANDO_COOPERADO_ID,
  capturedAt: string = nowIso()
): BicD13RuntimeCaptureResult {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coopId = cooperado?.cooperativaId ?? null;
  const canonico = coopId ? resolverCooperadoIdCanonico(data, cooperadoId, coopId) : cooperadoId;

  const pagamentosRaw = (data.pagamentosCooperado ?? []).filter((p) =>
    pagamentoCooperadoPertenceCooperado(data, p, cooperadoId, coopId ?? undefined)
  );

  const pagamentos = pagamentosRaw.map(pagamentoToDiagnostico);
  const pagamentosAguardando = pagamentos.filter((p) => p.status === "aguardando_confirmacao");
  const pagamentosConfirmados = pagamentos.filter((p) => p.status === "confirmado");

  const fichas = (data.fichaCorrida ?? [])
    .filter((f) => fichaPertenceCooperado(data, f, canonico, coopId ?? undefined))
    .map((f) => ({
      fichaId: f.id,
      cooperadoId: f.cooperadoId,
      status: f.status,
      notaPedidoId: f.notaPedidoId,
      mes: f.mesReferencia,
      valorBruto: f.valorBruto,
      valorLiquido: f.valorLiquido,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));

  const notas = (data.notasPedido ?? [])
    .filter((n) => notaPertenceCooperado(data, n, canonico, coopId ?? undefined))
    .map((n) => ({
      notaId: n.id,
      cooperadoId: n.cooperadoId,
      status: n.status,
      valorTotal: n.valorBruto,
      valorLiquido: n.valorLiquido,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      serverUpdatedAt: (n as NotaPedido & { serverUpdatedAt?: string }).serverUpdatedAt,
    }));

  const pgAntigo = pagamentosRaw.find((p) => p.id === BIC_D13_REF_PG_ANTIGO);
  const comparacaoPg1790308339483: BicD13ComparacaoPgAntigo = {
    referenciaId: BIC_D13_REF_PG_ANTIGO,
    presenteNoAppData: Boolean(pgAntigo),
    statusSePresente: pgAntigo?.status ?? null,
    outrosAguardandoConfirmacao: pagamentos.filter(
      (p) => p.status === "aguardando_confirmacao" && p.pagamentoId !== BIC_D13_REF_PG_ANTIGO
    ),
    outrosConfirmados: pagamentos.filter(
      (p) => p.status === "confirmado" && p.pagamentoId !== BIC_D13_REF_PG_ANTIGO
    ),
    observacao:
      "pg_1790308339483 é referência histórica para comparação; o recibo na UI pode corresponder a outro pagamentoId aguardando.",
  };

  const aguardandoUi = getPagamentoAguardandoCooperado(data, cooperadoId);
  const quantoVouReceber = getValorQuantoVouReceber(data, cooperadoId, coopId ?? undefined);

  const registroPotencial = aguardandoUi
    ? {
        pagamentoId: aguardandoUi.id,
        status: aguardandoUi.status,
        valorLiquido: aguardandoUi.valorLiquido,
        fichaIds: [...(aguardandoUi.fichaIds ?? [])],
        notaPedidoIds: [...(aguardandoUi.notaPedidoIds ?? [])],
        disclaimer:
          "REGISTRO POTENCIALMENTE RESPONSÁVEL PELO RECIBO — mesmo critério de getPagamentoAguardandoCooperado usado pela UI; não prova qual componente renderizou sem inspeção visual.",
      }
    : {
        pagamentoId: null,
        status: null,
        valorLiquido: null,
        fichaIds: [] as string[],
        notaPedidoIds: [] as string[],
        disclaimer:
          "Nenhum pagamento aguardando elegível no instante da captura (getPagamentoAguardandoCooperado retornou vazio).",
      };

  const result: BicD13RuntimeCaptureResult = {
    meta: {
      ticket: "BIC-D1.3",
      capturedAt,
      dataSource: "getData()",
      cooperadoAlvo: cooperadoId,
      cooperadoCanonico: canonico,
      cooperativaId: coopId,
      aviso: "Inspeção somente leitura; estado em memória/AppData efetivo da aplicação.",
    },
    pagamentos,
    fichas,
    notas,
    pagamentosAguardando,
    pagamentosConfirmados,
    pagamentosRelacionadosAoCicloAntigo: pagamentosRaw
      .filter(pagamentoRelacionadoCicloAntigo)
      .map(pagamentoToDiagnostico),
    pagamentosRelacionadosAoCicloNovo: pagamentosRaw
      .filter(pagamentoRelacionadoCicloNovo)
      .map(pagamentoToDiagnostico),
    comparacaoPg1790308339483,
    projecaoUiSomenteLeitura: {
      aguardandoAssinatura: quantoVouReceber.aguardandoAssinatura,
      valorRecibo: quantoVouReceber.valorRecibo,
      valorAberto: quantoVouReceber.valor,
      mesLabel: quantoVouReceber.mesLabel,
      pagamentoAguardandoCooperadoId: aguardandoUi?.id ?? null,
      disclaimer:
        "Projeção via getValorQuantoVouReceber / getPagamentoAguardandoCooperado — leitura; não altera dados.",
    },
    registroPotencialmenteResponsavelPeloRecibo: registroPotencial,
  };

  assertNoSensitivePagamentoFields(result);
  return result;
}

/** Executar no browser após interação do usuário (página BIC-D1). */
export function captureBicD13RuntimeFinanceiro(
  cooperadoId: string = BIC_D13_ORLANDO_COOPERADO_ID
): BicD13RuntimeCaptureResult {
  if (typeof window === "undefined") {
    throw new Error("captureBicD13RuntimeFinanceiro só pode executar no browser.");
  }
  const data = getData();
  return buildBicD13RuntimeCaptureFromAppData(data, cooperadoId);
}
