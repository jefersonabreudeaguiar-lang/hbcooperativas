import type { AppData, Cooperativa, CobrancaSaasCooperativa, CobrancaSaasLancamento, CobrancaSaasStatusMes } from "@/types";
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
  avisoMensagem?: string;
  ultimoPeriodoPago?: string;
  valorFormatado: string;
}

function statusLabel(s: CobrancaSaasStatusMes): string {
  switch (s) {
    case "aguardando_primeiro_cooperado":
      return "Aguardando 1º cooperado";
    case "em_dia":
      return "Em dia";
    case "cobranca_enviada":
      return "Cobrança enviada";
    case "aviso_bloqueio":
      return "Aviso de bloqueio";
    case "bloqueado":
      return "Bloqueado";
    default:
      return s;
  }
}

export function listarCobrancasSaasAdmin(data: AppData): CobrancaSaasAdminRow[] {
  return [...data.cooperativas]
    .map((coop) => {
      const synced = sincronizarCicloCobrancaSaas(data, coop.id);
      const c = synced.cooperativas.find((x) => x.id === coop.id) ?? coop;
      const cob = c.cobrancaSaas ?? defaultCobrancaSaas();
      const qtd = contarCooperadosCobranca(data, c.id);
      const calc = calcularValorCobrancaSaas(qtd);
      const periodo = cob.cicloInicioEm ? getPeriodoCobrancaSaas(cob.cicloInicioEm) : undefined;
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
        avisoMensagem: cob.avisoMensagem,
        ultimoPeriodoPago: cob.ultimoPeriodoPago,
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
  cooperativaId: string
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
  const historico = (cob.historico ?? []).map((h) =>
    h.periodoId === periodo.periodoId
      ? { ...h, status: "paga" as const, pagaEm: now }
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
  if (!cooperativaId) return null;
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop) return null;
  const cob = coop.cobrancaSaas;
  if (!cob) return null;

  if (cob.statusMes === "bloqueado") {
    return {
      tom: "error",
      titulo: "Bloqueio temporário — mensalidade HB",
      mensagem:
        cob.avisoMensagem ||
        "A área da cooperativa está com bloqueio temporário por pendência de pagamento da plataforma.",
    };
  }
  if (cob.statusMes === "aviso_bloqueio") {
    return {
      tom: "warning",
      titulo: "Aviso de bloqueio — mensalidade HB",
      mensagem:
        cob.avisoMensagem ||
        "Há cobrança em aberto. Regularize para evitar bloqueio temporário.",
    };
  }
  if (cob.statusMes === "cobranca_enviada") {
    const qtd = contarCooperadosCobranca(data, cooperativaId);
    const calc = calcularValorCobrancaSaas(qtd);
    return {
      tom: "info",
      titulo: "Cobrança HB enviada",
      mensagem: `Mensalidade do ciclo: ${formatCurrency(calc.valorTotal)} (${qtd} cooperado${qtd === 1 ? "" : "s"} × ${COBRANCA_SAAS_PRECO_LABEL}, mín. ${COBRANCA_SAAS_MINIMO_LABEL}).`,
    };
  }
  return null;
}

export function cooperativaEstaBloqueadaSaas(coop: Cooperativa | undefined): boolean {
  return coop?.cobrancaSaas?.statusMes === "bloqueado";
}
