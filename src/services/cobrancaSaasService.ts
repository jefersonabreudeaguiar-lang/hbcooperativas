import type { AppData, Cooperativa, CobrancaSaasCooperativa, CobrancaSaasLancamento, CobrancaSaasStatusMes } from "@/types";
import {
  CONTRATO_SERVICO_VERSAO,
  gerarReferenciaBoletoSaas,
  PROPRIETARIO_APP,
} from "@/config/contratoServicoApp";
import { normalizeCnpj } from "@/utils/cooperativa";
import { PLATFORM_NAME } from "@/utils/constants";
import { formatCurrency } from "@/utils/format";

/** Preço por cooperado cadastrado / mês (ciclo). */
export const COBRANCA_SAAS_PRECO_COOPERADO = 9.9;
/** Piso mensal por cooperativa. */
export const COBRANCA_SAAS_MINIMO_MES = 149;
export const COBRANCA_SAAS_PRECO_LABEL = "R$ 9,90";
export const COBRANCA_SAAS_MINIMO_LABEL = "R$ 149,00";

export function calcularValorCobrancaSaas(qtdCooperados: number): {
  qtd: number;
  valorUnitario: number;
  valorMinimo: number;
  valorBruto: number;
  valorTotal: number;
} {
  const qtd = Math.max(0, Math.floor(qtdCooperados));
  const valorBruto = Math.round(qtd * COBRANCA_SAAS_PRECO_COOPERADO * 100) / 100;
  const valorTotal = qtd === 0 ? 0 : Math.max(COBRANCA_SAAS_MINIMO_MES, valorBruto);
  return {
    qtd,
    valorUnitario: COBRANCA_SAAS_PRECO_COOPERADO,
    valorMinimo: COBRANCA_SAAS_MINIMO_MES,
    valorBruto,
    valorTotal,
  };
}

export function textoTermosCobrancaSaas(): string[] {
  return [
    `A mensalidade do ${PLATFORM_NAME} é cobrada por cooperativa, conforme a quantidade de cooperados cadastrados.`,
    `Valor: ${COBRANCA_SAAS_PRECO_LABEL} por cooperado cadastrado no mês, com mínimo de ${COBRANCA_SAAS_MINIMO_LABEL} por cooperativa.`,
    "Não importa o dia em que o cooperado foi incluído: conta quem estiver cadastrado no ciclo.",
    "O mês de uso começa a contar a partir do dia do cadastro do primeiro cooperado no CNPJ desta cooperativa.",
    "Exemplo: se o 1º cooperado entrar no dia 15, o ciclo vai do dia 15 ao dia 14 do mês seguinte.",
    "O pagamento é combinado com a plataforma HB (PIX ou forma indicada na cobrança). Após a confirmação, o mês fica em dia.",
    "Em atraso, a HB pode enviar aviso de bloqueio e, se necessário, aplicar bloqueio temporário com aviso na área do responsável.",
  ];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Aniversário mensal a partir do 1º cooperado. */
export function getPeriodoCobrancaSaas(
  cicloInicioEm: string,
  ref: Date = new Date()
): {
  periodoId: string;
  mesReferencia: string;
  inicio: string;
  fim: string;
  vencimento: string;
  label: string;
} {
  const start = new Date(cicloInicioEm);
  const dia = Math.min(start.getDate(), 28);
  let inicio = new Date(ref.getFullYear(), ref.getMonth(), dia);
  if (ref < inicio) {
    inicio = new Date(ref.getFullYear(), ref.getMonth() - 1, dia);
  }
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, dia);
  fim.setDate(fim.getDate() - 1);
  const vencimento = new Date(inicio.getFullYear(), inicio.getMonth() + 1, dia);
  const periodoId = toIsoDay(inicio);
  const mesReferencia = `${inicio.getFullYear()}-${pad2(inicio.getMonth() + 1)}`;
  const label = `${pad2(inicio.getDate())}/${pad2(inicio.getMonth() + 1)}/${inicio.getFullYear()} → ${pad2(fim.getDate())}/${pad2(fim.getMonth() + 1)}/${fim.getFullYear()}`;
  return {
    periodoId,
    mesReferencia,
    inicio: toIsoDay(inicio),
    fim: toIsoDay(fim),
    vencimento: toIsoDay(vencimento),
    label,
  };
}

export function contarCooperadosCobranca(data: AppData, cooperativaId: string): number {
  return data.cooperados.filter(
    (c) => c.cooperativaId === cooperativaId && c.status !== "desligado"
  ).length;
}

export function dataPrimeiroCooperado(data: AppData, cooperativaId: string): string | undefined {
  const lista = data.cooperados
    .filter((c) => c.cooperativaId === cooperativaId)
    .map((c) => c.createdAt)
    .filter(Boolean)
    .sort();
  return lista[0];
}

export function defaultCobrancaSaas(partial?: Partial<CobrancaSaasCooperativa>): CobrancaSaasCooperativa {
  return {
    statusMes: "aguardando_primeiro_cooperado",
    historico: [],
    ...partial,
  };
}

/** Garante cicloInicioEm quando existir o 1º cooperado. */
export function sincronizarCicloCobrancaSaas(data: AppData, cooperativaId: string): AppData {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return data;
  const primeiro = dataPrimeiroCooperado(data, cooperativaId);
  const atual = coop.cobrancaSaas ?? defaultCobrancaSaas();

  if (!primeiro) {
    if (atual.statusMes === "aguardando_primeiro_cooperado" && !atual.cicloInicioEm) {
      return data;
    }
    const next: CobrancaSaasCooperativa = {
      ...atual,
      cicloInicioEm: undefined,
      statusMes:
        atual.statusMes === "bloqueado" || atual.statusMes === "aviso_bloqueio"
          ? atual.statusMes
          : "aguardando_primeiro_cooperado",
    };
    return patchCobrancaSaas(data, cooperativaId, next);
  }

  if (atual.cicloInicioEm) return data;

  const next: CobrancaSaasCooperativa = {
    ...atual,
    cicloInicioEm: primeiro,
    statusMes:
      atual.statusMes === "bloqueado" ||
      atual.statusMes === "aviso_bloqueio" ||
      atual.statusMes === "cobranca_enviada" ||
      atual.statusMes === "em_dia"
        ? atual.statusMes
        : "em_dia",
  };
  return patchCobrancaSaas(data, cooperativaId, next);
}

export function patchCobrancaSaas(
  data: AppData,
  cooperativaId: string,
  cobranca: CobrancaSaasCooperativa
): AppData {
  const now = new Date().toISOString();
  return {
    ...data,
    cooperativas: data.cooperativas.map((c) =>
      c.id === cooperativaId
        ? { ...c, cobrancaSaas: cobranca, updatedAt: now }
        : c
    ),
  };
}

export function aceitarTermosCobrancaSaas(data: AppData, cooperativaId: string): AppData {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const base = coop?.cobrancaSaas ?? defaultCobrancaSaas();
  return patchCobrancaSaas(data, cooperativaId, {
    ...base,
    termosAceitosEm: new Date().toISOString(),
  });
}

export interface CobrancaSaasAdminRow {
  cooperativaId: string;
  nome: string;
  cnpj: string;
  cnpjFormatado: string;
  qtdCooperados: number;
  valorTotal: number;
  cicloInicioEm?: string;
  periodoId?: string;
  mesVencimentoLabel: string;
  vencimento?: string;
  statusMes: CobrancaSaasStatusMes;
  statusLabel: string;
  lancamentoStatus?: CobrancaSaasLancamento["status"];
  aguardandoConfirmacao: boolean;
  contratoAssinado: boolean;
  avisoMensagem?: string;
  ultimoPeriodoPago?: string;
  valorFormatado: string;
  informadoPagamentoEm?: string;
  informadoPagamentoPor?: string;
}

function statusLabel(s: CobrancaSaasStatusMes): string {
  switch (s) {
    case "aguardando_primeiro_cooperado":
      return "Aguardando 1º cooperado";
    case "em_dia":
      return "Em dia";
    case "cobranca_enviada":
      return "Cobrança pendente";
    case "aguardando_confirmacao":
      return "Aguardando confirmação";
    case "aviso_bloqueio":
      return "Aviso de suspensão";
    case "bloqueado":
      return "Suspenso";
    default:
      return s;
  }
}

export function contratoServicoAssinado(coop: Cooperativa | undefined): boolean {
  const cob = coop?.cobrancaSaas;
  return Boolean(
    cob?.contratoServicoAssinadoEm && cob.contratoServicoVersao === CONTRATO_SERVICO_VERSAO
  );
}

export function precisaAssinarContratoServico(coop: Cooperativa | undefined): boolean {
  return !contratoServicoAssinado(coop);
}

export function assinarContratoServicoSaas(
  data: AppData,
  cooperativaId: string,
  signatarioNome: string
): AppData {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const base = coop?.cobrancaSaas ?? defaultCobrancaSaas();
  const now = new Date().toISOString();
  let next = patchCobrancaSaas(data, cooperativaId, {
    ...base,
    termosAceitosEm: base.termosAceitosEm ?? now,
    contratoServicoAssinadoEm: now,
    contratoServicoAssinadoPor: signatarioNome,
    contratoServicoVersao: CONTRATO_SERVICO_VERSAO,
  });
  next = sincronizarCicloCobrancaSaas(next, cooperativaId);
  return ensureCobrancaPeriodoAtualSaas(next, cooperativaId).data;
}

function lancamentoPeriodoAtual(cob: CobrancaSaasCooperativa, periodoId: string): CobrancaSaasLancamento | undefined {
  return (cob.historico ?? []).find((h) => h.periodoId === periodoId);
}

function diasAtraso(vencimento: string, ref = new Date()): number {
  const v = new Date(`${vencimento}T23:59:59`);
  const diff = ref.getTime() - v.getTime();
  return diff > 0 ? Math.floor(diff / 86400000) : 0;
}

/** Gera cobrança do ciclo atual, aplica avisos de atraso e sincroniza statusMes. */
export function ensureCobrancaPeriodoAtualSaas(
  data: AppData,
  cooperativaId: string
): { data: AppData; ok: boolean } {
  let next = sincronizarCicloCobrancaSaas(data, cooperativaId);
  const coop = next.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return { data: next, ok: false };

  const cob = coop.cobrancaSaas ?? defaultCobrancaSaas();
  if (!contratoServicoAssinado(coop) || !cob.cicloInicioEm) {
    return { data: next, ok: true };
  }

  const periodo = getPeriodoCobrancaSaas(cob.cicloInicioEm);
  const qtd = contarCooperadosCobranca(next, cooperativaId);
  if (qtd <= 0) return { data: next, ok: true };

  if (cob.ultimoPeriodoPago === periodo.periodoId) {
    if (cob.statusMes !== "em_dia" && cob.statusMes !== "aguardando_primeiro_cooperado") {
      next = patchCobrancaSaas(next, cooperativaId, {
        ...cob,
        statusMes: "em_dia",
        avisoMensagem: undefined,
        avisoEm: undefined,
        bloqueadoEm: undefined,
        bloqueadoPor: undefined,
      });
    }
    return { data: next, ok: true };
  }

  let historico = [...(cob.historico ?? [])];
  let lanc = lancamentoPeriodoAtual(cob, periodo.periodoId);
  const calc = calcularValorCobrancaSaas(qtd);
  const now = new Date().toISOString();

  if (!lanc) {
    lanc = {
      id: gerarId(),
      periodoId: periodo.periodoId,
      mesReferencia: periodo.mesReferencia,
      qtdCooperados: calc.qtd,
      valorUnitario: calc.valorUnitario,
      valorMinimo: calc.valorMinimo,
      valorTotal: calc.valorTotal,
      status: "enviada",
      criadaEm: now,
      enviadaEm: now,
      observacao: "Cobrança mensal gerada automaticamente",
    };
    historico = [...historico.filter((h) => h.periodoId !== periodo.periodoId), lanc];
  }

  let statusMes: CobrancaSaasStatusMes = cob.statusMes;
  let avisoMensagem = cob.avisoMensagem;
  const atraso = diasAtraso(periodo.vencimento);

  if (lanc.status === "paga") {
    statusMes = "em_dia";
    avisoMensagem = undefined;
  } else if (lanc.status === "aguardando_confirmacao") {
    statusMes = "aguardando_confirmacao";
    avisoMensagem =
      "Pagamento informado — aguardando confirmação do proprietário do aplicativo. O app permanece sujeito a aviso de suspensão até a validação.";
  } else if (atraso >= 14 && cob.statusMes !== "bloqueado") {
    statusMes = "bloqueado";
    avisoMensagem =
      "Suspensão por inadimplência: mensalidade do aplicativo em atraso. Regularize o pagamento e aguarde confirmação do proprietário.";
  } else if (atraso >= 7) {
    statusMes = "aviso_bloqueio";
    avisoMensagem =
      "Aviso de suspensão: mensalidade do aplicativo vencida. Pague via PIX ou boleto e informe o pagamento para evitar limitação do serviço.";
  } else if (lanc.status === "enviada" || lanc.status === "rejeitada") {
    statusMes = "cobranca_enviada";
    if (lanc.status === "rejeitada") {
      avisoMensagem =
        lanc.motivoRejeicao ||
        "Pagamento não confirmado pelo proprietário. Verifique o comprovante e informe novamente.";
    } else {
      avisoMensagem = undefined;
    }
  }

  next = patchCobrancaSaas(next, cooperativaId, {
    ...cob,
    historico,
    statusMes,
    avisoMensagem,
    avisoEm: avisoMensagem ? cob.avisoEm ?? now : undefined,
    bloqueadoEm: statusMes === "bloqueado" ? cob.bloqueadoEm ?? now : undefined,
    bloqueadoPor: statusMes === "bloqueado" ? cob.bloqueadoPor ?? "Sistema (inadimplência)" : undefined,
  });

  return { data: next, ok: true };
}

export interface PainelCobrancaSaasResponsavel {
  precisaContrato: boolean;
  contratoVersao: string;
  periodoLabel: string;
  vencimento: string;
  vencimentoLabel: string;
  qtdCooperados: number;
  valorTotal: number;
  valorFormatado: string;
  statusMes: CobrancaSaasStatusMes;
  statusLabel: string;
  lancamentoStatus?: CobrancaSaasLancamento["status"];
  pixChave: string;
  pixNome: string;
  cpfProprietario: string;
  boletoReferencia?: string;
  podeInformarPagamento: boolean;
  aguardandoConfirmacao: boolean;
  avisoMensagem?: string;
  emAtraso: boolean;
  diasAtraso: number;
}

export function getPainelCobrancaSaasResponsavel(
  data: AppData,
  cooperativaId: string | undefined
): PainelCobrancaSaasResponsavel | null {
  if (!cooperativaId) return null;
  const synced = ensureCobrancaPeriodoAtualSaas(data, cooperativaId).data;
  const coop = synced.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return null;

  const cob = coop.cobrancaSaas ?? defaultCobrancaSaas();
  const precisaContrato = precisaAssinarContratoServico(coop);
  const qtd = contarCooperadosCobranca(synced, cooperativaId);
  const calc = calcularValorCobrancaSaas(qtd);
  const periodo = cob.cicloInicioEm ? getPeriodoCobrancaSaas(cob.cicloInicioEm) : undefined;
  const lanc = periodo ? lancamentoPeriodoAtual(cob, periodo.periodoId) : undefined;
  const atraso = periodo ? diasAtraso(periodo.vencimento) : 0;

  return {
    precisaContrato,
    contratoVersao: CONTRATO_SERVICO_VERSAO,
    periodoLabel: periodo?.label ?? "Ciclo inicia no 1º cooperado",
    vencimento: periodo?.vencimento ?? "",
    vencimentoLabel: periodo
      ? periodo.vencimento.split("-").reverse().join("/")
      : "—",
    qtdCooperados: qtd,
    valorTotal: calc.valorTotal,
    valorFormatado: formatCurrency(calc.valorTotal),
    statusMes: cob.statusMes,
    statusLabel: statusLabel(cob.statusMes),
    lancamentoStatus: lanc?.status,
    pixChave: PROPRIETARIO_APP.pixChave,
    pixNome: PROPRIETARIO_APP.pixNome,
    cpfProprietario: PROPRIETARIO_APP.cpfFormatado,
    boletoReferencia:
      periodo && calc.valorTotal > 0
        ? gerarReferenciaBoletoSaas(normalizeCnpj(coop.cnpj), periodo.periodoId, calc.valorTotal)
        : undefined,
    podeInformarPagamento: Boolean(
      !precisaContrato &&
        lanc &&
        (lanc.status === "enviada" || lanc.status === "rejeitada") &&
        calc.valorTotal > 0
    ),
    aguardandoConfirmacao: lanc?.status === "aguardando_confirmacao",
    avisoMensagem: cob.avisoMensagem,
    emAtraso: atraso > 0 && cob.ultimoPeriodoPago !== periodo?.periodoId,
    diasAtraso: atraso,
  };
}

export function responsavelInformouPagamentoSaas(
  data: AppData,
  cooperativaId: string,
  responsavelNome: string,
  comprovanteDataUrl?: string
): { data: AppData; ok: boolean; error?: string } {
  let next = ensureCobrancaPeriodoAtualSaas(data, cooperativaId).data;
  const coop = next.cooperativas.find((c) => c.id === cooperativaId);
  const cob = coop?.cobrancaSaas;
  if (!coop || !cob?.cicloInicioEm) {
    return { data: next, ok: false, error: "Ciclo de cobrança ainda não iniciado." };
  }
  if (precisaAssinarContratoServico(coop)) {
    return { data: next, ok: false, error: "Assine o contrato de serviço antes de informar pagamento." };
  }

  const periodo = getPeriodoCobrancaSaas(cob.cicloInicioEm);
  const lanc = lancamentoPeriodoAtual(cob, periodo.periodoId);
  if (!lanc || (lanc.status !== "enviada" && lanc.status !== "rejeitada")) {
    return { data: next, ok: false, error: "Não há cobrança em aberto para informar pagamento." };
  }

  const now = new Date().toISOString();
  const historico = (cob.historico ?? []).map((h) =>
    h.periodoId === periodo.periodoId
      ? {
          ...h,
          status: "aguardando_confirmacao" as const,
          informadoPagamentoEm: now,
          informadoPagamentoPor: responsavelNome,
          comprovanteDataUrl: comprovanteDataUrl ?? h.comprovanteDataUrl,
          rejeitadoEm: undefined,
          motivoRejeicao: undefined,
        }
      : h
  );

  next = patchCobrancaSaas(next, cooperativaId, {
    ...cob,
    historico,
    statusMes: "aguardando_confirmacao",
    avisoMensagem:
      "Pagamento informado — aguardando confirmação do proprietário do aplicativo. O acesso permanece sujeito a aviso de suspensão até a validação.",
    avisoEm: now,
  });

  return { data: next, ok: true };
}

export function rejeitarPagamentoCobrancaSaas(
  data: AppData,
  cooperativaId: string,
  adminNome: string,
  motivo?: string
): { data: AppData; ok: boolean; error?: string } {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cob = coop?.cobrancaSaas;
  if (!coop || !cob?.cicloInicioEm) {
    return { data, ok: false, error: "Ciclo não iniciado." };
  }
  const periodo = getPeriodoCobrancaSaas(cob.cicloInicioEm);
  const lanc = lancamentoPeriodoAtual(cob, periodo.periodoId);
  if (!lanc || lanc.status !== "aguardando_confirmacao") {
    return { data, ok: false, error: "Não há pagamento aguardando confirmação." };
  }

  const now = new Date().toISOString();
  const msg =
    motivo?.trim() ||
    "Pagamento não confirmado. Verifique se o valor e o favorecido (CPF do proprietário) estão corretos.";

  const historico = (cob.historico ?? []).map((h) =>
    h.periodoId === periodo.periodoId
      ? {
          ...h,
          status: "rejeitada" as const,
          rejeitadoEm: now,
          motivoRejeicao: msg,
          observacao: `Rejeitado por ${adminNome}`,
        }
      : h
  );

  let next = patchCobrancaSaas(data, cooperativaId, {
    ...cob,
    historico,
    statusMes: "cobranca_enviada",
    avisoMensagem: msg,
    avisoEm: now,
  });
  next = ensureCobrancaPeriodoAtualSaas(next, cooperativaId).data;
  return { data: next, ok: true };
}

export function listarCobrancasSaasAdmin(data: AppData): CobrancaSaasAdminRow[] {
  return [...data.cooperativas]
    .map((coop) => {
      const synced = ensureCobrancaPeriodoAtualSaas(data, coop.id).data;
      const c = synced.cooperativas.find((x) => x.id === coop.id) ?? coop;
      const cob = c.cobrancaSaas ?? defaultCobrancaSaas();
      const qtd = contarCooperadosCobranca(data, c.id);
      const calc = calcularValorCobrancaSaas(qtd);
      const periodo = cob.cicloInicioEm ? getPeriodoCobrancaSaas(cob.cicloInicioEm) : undefined;
      const lanc = periodo ? lancamentoPeriodoAtual(cob, periodo.periodoId) : undefined;
      return {
        cooperativaId: c.id,
        nome: c.nome,
        cnpj: normalizeCnpj(c.cnpj),
        cnpjFormatado: c.cnpj,
        qtdCooperados: qtd,
        valorTotal: calc.valorTotal,
        valorFormatado: formatCurrency(calc.valorTotal),
        cicloInicioEm: cob.cicloInicioEm,
        periodoId: periodo?.periodoId,
        mesVencimentoLabel: periodo
          ? `Vence ${periodo.vencimento.split("-").reverse().join("/")} · ciclo ${periodo.label}`
          : "Ciclo inicia no 1º cooperado",
        vencimento: periodo?.vencimento,
        statusMes: cob.statusMes,
        statusLabel: statusLabel(cob.statusMes),
        lancamentoStatus: lanc?.status,
        aguardandoConfirmacao: lanc?.status === "aguardando_confirmacao",
        contratoAssinado: contratoServicoAssinado(c),
        avisoMensagem: cob.avisoMensagem,
        ultimoPeriodoPago: cob.ultimoPeriodoPago,
        informadoPagamentoEm: lanc?.informadoPagamentoEm,
        informadoPagamentoPor: lanc?.informadoPagamentoPor,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function gerarId(): string {
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function registrarCobrancaSaas(
  data: AppData,
  cooperativaId: string,
  adminNome: string
): { data: AppData; ok: boolean; error?: string; valorTotal?: number } {
  let next = sincronizarCicloCobrancaSaas(data, cooperativaId);
  const coop = next.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return { data, ok: false, error: "Cooperativa não encontrada." };
  const cob = coop.cobrancaSaas ?? defaultCobrancaSaas();
  if (!cob.cicloInicioEm) {
    return { data: next, ok: false, error: "Ainda não há cooperado cadastrado — o ciclo não começou." };
  }
  const qtd = contarCooperadosCobranca(next, cooperativaId);
  if (qtd <= 0) {
    return { data: next, ok: false, error: "Sem cooperados para cobrar neste ciclo." };
  }
  const calc = calcularValorCobrancaSaas(qtd);
  const periodo = getPeriodoCobrancaSaas(cob.cicloInicioEm);
  const now = new Date().toISOString();
  const lancamento: CobrancaSaasLancamento = {
    id: gerarId(),
    periodoId: periodo.periodoId,
    mesReferencia: periodo.mesReferencia,
    qtdCooperados: calc.qtd,
    valorUnitario: calc.valorUnitario,
    valorMinimo: calc.valorMinimo,
    valorTotal: calc.valorTotal,
    status: "enviada",
    criadaEm: now,
    enviadaEm: now,
    observacao: `Cobrança registrada por ${adminNome}`,
  };
  const historico = [...(cob.historico ?? []).filter((h) => h.periodoId !== periodo.periodoId), lancamento];
  next = patchCobrancaSaas(next, cooperativaId, {
    ...cob,
    statusMes: "cobranca_enviada",
    avisoMensagem: undefined,
    historico,
  });
  return { data: next, ok: true, valorTotal: calc.valorTotal };
}

export function confirmarPagamentoCobrancaSaas(
  data: AppData,
  cooperativaId: string,
  adminNome?: string
): { data: AppData; ok: boolean; error?: string } {
  let next = sincronizarCicloCobrancaSaas(data, cooperativaId);
  const coop = next.cooperativas.find((c) => c.id === cooperativaId);
  const cicloInicioEm = coop?.cobrancaSaas?.cicloInicioEm;
  if (!coop?.cobrancaSaas || !cicloInicioEm) {
    return { data: next, ok: false, error: "Ciclo de cobrança ainda não iniciado." };
  }
  const cob = coop.cobrancaSaas;
  const periodo = getPeriodoCobrancaSaas(cicloInicioEm);
  const now = new Date().toISOString();
  const lancAtual = lancamentoPeriodoAtual(cob, periodo.periodoId);

  if (
    lancAtual &&
    lancAtual.status !== "aguardando_confirmacao" &&
    lancAtual.status !== "enviada" &&
    lancAtual.status !== "rejeitada"
  ) {
    if (lancAtual.status === "paga") return { data: next, ok: true };
  }

  const historico = (cob.historico ?? []).map((h) =>
    h.periodoId === periodo.periodoId
      ? {
          ...h,
          status: "paga" as const,
          pagaEm: now,
          confirmadoPor: adminNome ?? "Proprietário HB",
        }
      : h
  );
  if (!historico.some((h) => h.periodoId === periodo.periodoId)) {
    const qtd = contarCooperadosCobranca(next, cooperativaId);
    const calc = calcularValorCobrancaSaas(qtd);
    historico.push({
      id: gerarId(),
      periodoId: periodo.periodoId,
      mesReferencia: periodo.mesReferencia,
      qtdCooperados: calc.qtd,
      valorUnitario: calc.valorUnitario,
      valorMinimo: calc.valorMinimo,
      valorTotal: calc.valorTotal,
      status: "paga",
      criadaEm: now,
      pagaEm: now,
      confirmadoPor: adminNome ?? "Proprietário HB",
      observacao: "Pagamento confirmado",
    });
  }
  next = patchCobrancaSaas(next, cooperativaId, {
    ...cob,
    statusMes: "em_dia",
    ultimoPeriodoPago: periodo.periodoId,
    avisoMensagem: undefined,
    avisoEm: undefined,
    bloqueadoEm: undefined,
    bloqueadoPor: undefined,
    historico,
  });
  return { data: next, ok: true };
}

export function enviarAvisoBloqueioCobrancaSaas(
  data: AppData,
  cooperativaId: string,
  mensagem?: string
): AppData {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cob = coop?.cobrancaSaas ?? defaultCobrancaSaas();
  return patchCobrancaSaas(data, cooperativaId, {
    ...cob,
    statusMes: "aviso_bloqueio",
    avisoMensagem:
      mensagem?.trim() ||
      "Sua mensalidade HB Cooperativas está pendente. Regularize o pagamento para evitar o bloqueio temporário da área do responsável.",
    avisoEm: new Date().toISOString(),
  });
}

export function bloquearTemporarioCobrancaSaas(
  data: AppData,
  cooperativaId: string,
  adminNome: string,
  mensagem?: string
): AppData {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cob = coop?.cobrancaSaas ?? defaultCobrancaSaas();
  return patchCobrancaSaas(data, cooperativaId, {
    ...cob,
    statusMes: "bloqueado",
    bloqueadoEm: new Date().toISOString(),
    bloqueadoPor: adminNome,
    avisoMensagem:
      mensagem?.trim() ||
      "Acesso temporariamente limitado: mensalidade HB Cooperativas em atraso. Fale com a plataforma para regularizar.",
    avisoEm: new Date().toISOString(),
  });
}

export function desbloquearCobrancaSaas(data: AppData, cooperativaId: string): AppData {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cob = coop?.cobrancaSaas ?? defaultCobrancaSaas();
  const temCiclo = Boolean(cob.cicloInicioEm);
  return patchCobrancaSaas(data, cooperativaId, {
    ...cob,
    statusMes: temCiclo ? "em_dia" : "aguardando_primeiro_cooperado",
    bloqueadoEm: undefined,
    bloqueadoPor: undefined,
    avisoMensagem: undefined,
    avisoEm: undefined,
  });
}

export function getCobrancaSaasAvisosResponsavel(
  data: AppData,
  cooperativaId: string | undefined
): { tom: "warning" | "error" | "info"; titulo: string; mensagem: string } | null {
  const painel = getPainelCobrancaSaasResponsavel(data, cooperativaId);
  if (!painel || painel.precisaContrato) return null;

  if (painel.statusMes === "bloqueado") {
    return {
      tom: "error",
      titulo: "Suspensão — mensalidade do aplicativo",
      mensagem:
        painel.avisoMensagem ||
        "O acesso está sujeito a suspensão por inadimplência da mensalidade HB Cooperativas.",
    };
  }
  if (painel.statusMes === "aviso_bloqueio") {
    return {
      tom: "warning",
      titulo: "Aviso de suspensão — mensalidade HB",
      mensagem: painel.avisoMensagem || "Regularize o pagamento para evitar limitação do serviço.",
    };
  }
  if (painel.aguardandoConfirmacao) {
    return {
      tom: "info",
      titulo: "Pagamento aguardando confirmação",
      mensagem:
        painel.avisoMensagem ||
        "O proprietário do app ainda não confirmou seu pagamento. O serviço permanece sujeito a aviso de suspensão.",
    };
  }
  if (painel.statusMes === "cobranca_enviada" && painel.valorTotal > 0) {
    return {
      tom: "info",
      titulo: "Mensalidade do aplicativo em aberto",
      mensagem: `Ciclo ${painel.periodoLabel}: ${painel.valorFormatado} (${painel.qtdCooperados} cooperado${painel.qtdCooperados === 1 ? "" : "s"}). Vencimento ${painel.vencimentoLabel}.`,
    };
  }
  return null;
}

export function cooperativaEstaBloqueadaSaas(coop: Cooperativa | undefined): boolean {
  return coop?.cobrancaSaas?.statusMes === "bloqueado";
}
