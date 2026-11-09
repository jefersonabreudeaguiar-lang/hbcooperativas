import type { AppData, Cooperativa, CobrancaSaasCooperativa, CobrancaSaasLancamento, CobrancaSaasStatusMes } from "@/types";
import {
  CONTRATO_SERVICO_VERSAO,
  gerarReferenciaBoletoSaas,
  PROPRIETARIO_APP,
} from "@/config/contratoServicoApp";
import { cooperadosUnicosParaCobranca } from "@/utils/cooperadoDedupe";
import { normalizeCnpj } from "@/utils/cooperativa";
import { PLATFORM_NAME } from "@/utils/constants";
import { formatCurrency } from "@/utils/format";

/** Preço padrão por cooperado cadastrado / mês (ciclo). */
export const COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT = 14.9;
/** Piso mensal padrão por cooperativa. */
export const COBRANCA_SAAS_MINIMO_MES_DEFAULT = 149;
/** Dia do mês para vencimento da cobrança HB (1–28). */
export const COBRANCA_SAAS_DIA_COBRANCA_DEFAULT = 10;

/** @deprecated Use getCobrancaSaasPricing() — mantido para compatibilidade. */
export const COBRANCA_SAAS_PRECO_COOPERADO = COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT;
/** @deprecated Use getCobrancaSaasPricing() — mantido para compatibilidade. */
export const COBRANCA_SAAS_MINIMO_MES = COBRANCA_SAAS_MINIMO_MES_DEFAULT;
/** @deprecated Use getCobrancaSaasPrecoLabel() — mantido para compatibilidade. */
export const COBRANCA_SAAS_PRECO_LABEL = "R$ 14,90";
/** @deprecated Use getCobrancaSaasMinimoLabel() — mantido para compatibilidade. */
export const COBRANCA_SAAS_MINIMO_LABEL = "R$ 149,00";

export interface CobrancaSaasPricing {
  precoCooperado: number;
  minimoMes: number;
  /** Dia do mês (1–28) em que vence a mensalidade HB. */
  diaCobranca?: number;
}

export function resolveDiaCobrancaSaas(pricing?: CobrancaSaasPricing | null): number {
  const d = pricing?.diaCobranca;
  if (typeof d === "number" && Number.isFinite(d) && d >= 1 && d <= 28) {
    return Math.floor(d);
  }
  return COBRANCA_SAAS_DIA_COBRANCA_DEFAULT;
}

function normalizePrecoSaas(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

export function getCobrancaSaasPricing(data?: Pick<AppData, "config"> | null): CobrancaSaasPricing {
  const diaRaw = data?.config?.cobrancaSaasDiaCobranca;
  const diaCobranca =
    typeof diaRaw === "number" && diaRaw >= 1 && diaRaw <= 28 ? Math.floor(diaRaw) : undefined;
  return {
    precoCooperado: normalizePrecoSaas(
      data?.config?.cobrancaSaasPrecoCooperado,
      COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT
    ),
    minimoMes: normalizePrecoSaas(data?.config?.cobrancaSaasMinimoMes, COBRANCA_SAAS_MINIMO_MES_DEFAULT),
    diaCobranca,
  };
}

export function getCobrancaSaasPrecoLabel(data?: Pick<AppData, "config"> | null): string {
  return formatCurrency(getCobrancaSaasPricing(data).precoCooperado);
}

export function getCobrancaSaasMinimoLabel(data?: Pick<AppData, "config"> | null): string {
  return formatCurrency(getCobrancaSaasPricing(data).minimoMes);
}

export function applyCobrancaSaasPricingToData(
  data: AppData,
  pricing: CobrancaSaasPricing
): AppData {
  return {
    ...data,
    config: {
      ...data.config,
      cobrancaSaasPrecoCooperado: pricing.precoCooperado,
      cobrancaSaasMinimoMes: pricing.minimoMes,
      cobrancaSaasDiaCobranca: resolveDiaCobrancaSaas(pricing),
    },
  };
}

export function calcularValorCobrancaSaas(
  qtdCooperados: number,
  pricing?: CobrancaSaasPricing
): {
  qtd: number;
  valorUnitario: number;
  valorMinimo: number;
  valorBruto: number;
  valorTotal: number;
} {
  const p = pricing ?? getCobrancaSaasPricing();
  const qtd = Math.max(0, Math.floor(qtdCooperados));
  const valorBruto = Math.round(qtd * p.precoCooperado * 100) / 100;
  const valorTotal = qtd === 0 ? 0 : Math.max(p.minimoMes, valorBruto);
  return {
    qtd,
    valorUnitario: p.precoCooperado,
    valorMinimo: p.minimoMes,
    valorBruto,
    valorTotal,
  };
}

export function textoTermosCobrancaSaas(pricing?: CobrancaSaasPricing): string[] {
  const p = pricing ?? getCobrancaSaasPricing();
  const precoLabel = formatCurrency(p.precoCooperado);
  const minimoLabel = formatCurrency(p.minimoMes);
  return [
    `A mensalidade do ${PLATFORM_NAME} é cobrada por cooperativa, conforme a quantidade de cooperados cadastrados.`,
    `Valor: ${precoLabel} por cooperado cadastrado no mês, com mínimo de ${minimoLabel} por cooperativa.`,
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

/** Aniversário mensal a partir do 1º cooperado (dia da adesão ao app). */
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
  const initial = businessDay(cicloInicioEm);
  const current = businessDay(ref);
  const anchor = Number(initial.slice(8, 10));
  const y = Number(current.slice(0, 4)), m = Number(current.slice(5, 7)) - 1;
  const inMonth = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(anchor, last)));
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  let start = inMonth(y, m);
  if (iso(start) > current) start = inMonth(y, m - 1);
  const next = inMonth(start.getUTCFullYear(), start.getUTCMonth() + 1);
  const end = new Date(next.getTime() - 86400000);
  const inicio = iso(start), fim = iso(end), vencimento = iso(next);
  return { periodoId: inicio, mesReferencia: inicio.slice(0, 7), inicio, fim, vencimento,
    label: `${inicio.split('-').reverse().join('/')} → ${fim.split('-').reverse().join('/')}` };
}

/** Plain dates are business dates; timestamps are interpreted in the cooperative business timezone. */
function businessDay(input: string | Date): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) throw new Error('Data de cobrança inválida.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Oldest issued unpaid cycle wins over a newer cycle. Existing period IDs retain their agreed anchor. */
export function getPeriodoCobrancaSaasAberto(cob: CobrancaSaasCooperativa, ref: Date = new Date()): ReturnType<typeof getPeriodoCobrancaSaas> {
  if (!cob.cicloInicioEm) throw new Error('Ciclo de cobrança não iniciado.');
  const history = [...(cob.historico ?? [])].filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.periodoId)).sort((a, b) => a.periodoId.localeCompare(b.periodoId));
  const firstPeriod = history[0]?.periodoId;
  const originalDay = Number(businessDay(cob.cicloInicioEm).slice(8, 10));
  const expectedDay = firstPeriod ? Math.min(originalDay, new Date(Date.UTC(Number(firstPeriod.slice(0, 4)), Number(firstPeriod.slice(5, 7)), 0)).getUTCDate()) : originalDay;
  const anchor = firstPeriod && Number(firstPeriod.slice(8, 10)) !== expectedDay ? firstPeriod : cob.cicloInicioEm;
  const current = getPeriodoCobrancaSaas(anchor, ref);
  const unpaid = history.find(h => h.periodoId <= current.periodoId && !['paga', 'cancelada'].includes(h.status) && !periodoCobrancaSaasEstaPago(cob, h.periodoId, h.mesReferencia));
  return unpaid ? getPeriodoCobrancaSaas(anchor, new Date(`${unpaid.periodoId}T15:00:00Z`)) : current;
}
export function contarCooperadosCobranca(data: AppData, cooperativaId: string): number {
  return cooperadosUnicosParaCobranca(
    data.cooperados.filter((c) => c.cooperativaId === cooperativaId)
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
    if (atual.cicloInicioEm && atual.historico?.length) return data;
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
  totalEmAberto: number;
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

export function totalCobrancaSaasEmAberto(cob: CobrancaSaasCooperativa): number {
  const periods = new Map<string, CobrancaSaasLancamento>();
  for (const h of cob.historico ?? []) {
    const previous = periods.get(h.periodoId);
    if (!previous || previous.status !== 'paga') periods.set(h.periodoId, h);
  }
  return Math.round([...periods.values()].filter(h => !['paga', 'cancelada'].includes(h.status) && !periodoCobrancaSaasEstaPago(cob, h.periodoId, h.mesReferencia))
    .reduce((s, h) => s + Math.max(0, Number(h.valorTotal) || 0), 0) * 100) / 100;
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

/** Contrato SaaS desligado — cobrança segue só com PIX + confirmação do criador no admin. */
export function contratoServicoAssinado(_coop?: Cooperativa): boolean {
  return true;
}

export function precisaAssinarContratoServico(_coop?: Cooperativa): boolean {
  return false;
}

/** Registra assinatura localmente — leve; ciclo de cobrança pode rodar depois (idle). */
export function registrarAssinaturaContratoServicoSaas(
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
  return sincronizarCicloCobrancaSaas(next, cooperativaId);
}

/** Conclui ciclo/cobrança do mês após assinatura (pode ser adiado para não travar a UI). */
export function finalizarCobrancaAposAssinaturaContratoSaas(
  data: AppData,
  cooperativaId: string
): AppData {
  return ensureCobrancaPeriodoAtualSaas(data, cooperativaId).data;
}

export function assinarContratoServicoSaas(
  data: AppData,
  cooperativaId: string,
  signatarioNome: string
): AppData {
  const next = registrarAssinaturaContratoServicoSaas(data, cooperativaId, signatarioNome);
  return finalizarCobrancaAposAssinaturaContratoSaas(next, cooperativaId);
}

function lancamentoPeriodoAtual(cob: CobrancaSaasCooperativa, periodoId: string): CobrancaSaasLancamento | undefined {
  return (cob.historico ?? []).find((h) => h.periodoId === periodoId);
}

function ymFromPeriodoId(periodoId: string): string | undefined {
  const m = periodoId.match(/^(\d{4}-\d{2})/);
  return m?.[1];
}

/** Ciclo já confirmado pelo admin — não reabrir cobrança nem mostrar painel. */
export function periodoCobrancaSaasEstaPago(
  cob: CobrancaSaasCooperativa,
  periodoId?: string,
  mesReferencia?: string
): boolean {
  const historico = cob.historico ?? [];
  if (periodoId) {
    if (cob.ultimoPeriodoPago === periodoId) return true;
    if (historico.some((h) => h.periodoId === periodoId && h.status === "paga")) return true;
    return historico.some(h => (!h.periodoId || /^\d{4}-\d{2}$/.test(h.periodoId)) && h.mesReferencia === (mesReferencia ?? periodoId.slice(0, 7)) && h.status === 'paga');
  }
  const mes = mesReferencia || (periodoId ? ymFromPeriodoId(periodoId) : undefined);
  if (mes) {
    if (historico.some((h) => h.mesReferencia === mes && h.status === "paga")) return true;
    if (cob.ultimoPeriodoPago && ymFromPeriodoId(cob.ultimoPeriodoPago) === mes) return true;
  }
  return false;
}

function diasAtraso(vencimento: string, ref = new Date()): number {
  return Math.max(0, Math.round((Date.parse(`${businessDay(ref)}T00:00:00Z`) - Date.parse(`${vencimento}T00:00:00Z`)) / 86400000));
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

  const periodo = getPeriodoCobrancaSaasAberto(cob);
  const qtd = contarCooperadosCobranca(next, cooperativaId);
  if (qtd <= 0) return { data: next, ok: true };

  if (periodoCobrancaSaasEstaPago(cob, periodo.periodoId, periodo.mesReferencia)) {
    if (cob.statusMes !== "em_dia" && cob.statusMes !== "aguardando_primeiro_cooperado") {
      next = patchCobrancaSaas(next, cooperativaId, {
        ...cob,
        statusMes: "em_dia",
        ultimoPeriodoPago: cob.ultimoPeriodoPago ?? periodo.periodoId,
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
  if (lanc?.status === 'cancelada') return { data: next, ok: true };
  const calc = calcularValorCobrancaSaas(qtd, getCobrancaSaasPricing(next));
  const now = new Date().toISOString();

  if (!lanc) {
    lanc = {
      id: `cs_${normalizeCnpj(coop.cnpj)}_${periodo.periodoId}`,
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

  const nextCob: CobrancaSaasCooperativa = {
    ...cob,
    historico,
    statusMes,
    avisoMensagem,
    avisoEm: avisoMensagem ? cob.avisoEm ?? now : undefined,
    bloqueadoEm: statusMes === "bloqueado" ? cob.bloqueadoEm ?? now : undefined,
    bloqueadoPor:
      statusMes === "bloqueado" ? cob.bloqueadoPor ?? "Sistema (inadimplência)" : undefined,
  };

  const semAlteracao =
    cob.statusMes === nextCob.statusMes &&
    cob.avisoMensagem === nextCob.avisoMensagem &&
    cob.ultimoPeriodoPago === nextCob.ultimoPeriodoPago &&
    JSON.stringify(cob.historico ?? []) === JSON.stringify(nextCob.historico ?? []);

  if (semAlteracao) {
    return { data: next, ok: true };
  }

  next = patchCobrancaSaas(next, cooperativaId, nextCob);

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
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return null;

  const cob = coop.cobrancaSaas ?? defaultCobrancaSaas();
  const precisaContrato = precisaAssinarContratoServico(coop);
  const qtd = contarCooperadosCobranca(data, cooperativaId);
  const calc = calcularValorCobrancaSaas(qtd, getCobrancaSaasPricing(data));
  const periodo = cob.cicloInicioEm ? getPeriodoCobrancaSaasAberto(cob) : undefined;
  const lanc = periodo ? lancamentoPeriodoAtual(cob, periodo.periodoId) : undefined;
  const valorTotal = lanc?.valorTotal ?? calc.valorTotal;
  const atraso = periodo ? diasAtraso(periodo.vencimento) : 0;
  const pago = periodoCobrancaSaasEstaPago(cob, periodo?.periodoId, periodo?.mesReferencia);
  const statusMes: CobrancaSaasStatusMes = pago || lanc?.status === 'cancelada' ? "em_dia" : lanc?.status === 'aguardando_confirmacao' ? 'aguardando_confirmacao' : ['bloqueado', 'aviso_bloqueio'].includes(cob.statusMes) ? cob.statusMes : cob.cicloInicioEm ? 'cobranca_enviada' : 'aguardando_primeiro_cooperado';

  return {
    precisaContrato,
    contratoVersao: CONTRATO_SERVICO_VERSAO,
    periodoLabel: periodo?.label ?? "Ciclo inicia no 1º cooperado",
    vencimento: periodo?.vencimento ?? "",
    vencimentoLabel: periodo
      ? periodo.vencimento.split("-").reverse().join("/")
      : "—",
    qtdCooperados: lanc?.qtdCooperados ?? qtd,
    valorTotal,
    valorFormatado: formatCurrency(valorTotal),
    statusMes,
    statusLabel: statusLabel(statusMes),
    lancamentoStatus: lanc?.status,
    pixChave: PROPRIETARIO_APP.pixChave,
    pixNome: PROPRIETARIO_APP.pixNome,
    cpfProprietario: PROPRIETARIO_APP.cpfFormatado,
    boletoReferencia:
      periodo && valorTotal > 0
        ? gerarReferenciaBoletoSaas(normalizeCnpj(coop.cnpj), periodo.periodoId, valorTotal)
        : undefined,
    podeInformarPagamento: Boolean(
      !pago &&
        !precisaContrato &&
        lanc &&
        (lanc.status === "enviada" || lanc.status === "rejeitada") &&
        valorTotal > 0
    ),
    aguardandoConfirmacao: !pago && lanc?.status === "aguardando_confirmacao",
    avisoMensagem: pago ? undefined : cob.avisoMensagem,
    emAtraso: !pago && atraso > 0 && cob.ultimoPeriodoPago !== periodo?.periodoId,
    diasAtraso: pago ? 0 : atraso,
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
  const periodo = getPeriodoCobrancaSaasAberto(cob);
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
  const diaCobranca = resolveDiaCobrancaSaas(getCobrancaSaasPricing(data));
  const periodo = getPeriodoCobrancaSaasAberto(cob);
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
      const calc = calcularValorCobrancaSaas(qtd, getCobrancaSaasPricing(data));
      const periodo = cob.cicloInicioEm ? getPeriodoCobrancaSaasAberto(cob) : undefined;
      const lanc = periodo ? lancamentoPeriodoAtual(cob, periodo.periodoId) : undefined;
      const billed = lanc?.valorTotal ?? calc.valorTotal;
      return {
        cooperativaId: c.id,
        nome: c.nome,
        cnpj: normalizeCnpj(c.cnpj),
        cnpjFormatado: c.cnpj,
        qtdCooperados: qtd,
        valorTotal: billed,
        totalEmAberto: totalCobrancaSaasEmAberto(cob),
        valorFormatado: formatCurrency(billed),
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
  const calc = calcularValorCobrancaSaas(qtd, getCobrancaSaasPricing(next));
  const periodo = getPeriodoCobrancaSaasAberto(cob);
  const now = new Date().toISOString();
  if (periodoCobrancaSaasEstaPago(cob, periodo.periodoId, periodo.mesReferencia)) return { data: next, ok: false, error: 'Este ciclo já foi confirmado como pago.' };
  const existing = lancamentoPeriodoAtual(cob, periodo.periodoId);
  if (existing?.status === 'cancelada') return { data: next, ok: false, error: 'Esta cobrança foi cancelada.' };
  if (existing) return { data: next, ok: true, valorTotal: existing.valorTotal };
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
  const periodo = getPeriodoCobrancaSaasAberto(cob);
  const now = new Date().toISOString();
  const lancAtual = lancamentoPeriodoAtual(cob, periodo.periodoId);

  if (lancAtual?.status === 'cancelada') return { data: next, ok: false, error: 'Esta cobrança foi cancelada.' };

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
    const calc = calcularValorCobrancaSaas(qtd, getCobrancaSaasPricing(next));
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

  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  const cob = coop?.cobrancaSaas;
  const periodo = cob?.cicloInicioEm ? getPeriodoCobrancaSaasAberto(cob) : undefined;

  if (
    (cob && periodoCobrancaSaasEstaPago(cob, periodo?.periodoId, periodo?.mesReferencia)) ||
    painel.lancamentoStatus === "paga" ||
    (painel.statusMes === "em_dia" && !painel.emAtraso)
  ) {
    return null;
  }

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
