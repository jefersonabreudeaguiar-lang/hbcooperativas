import type { AppData, Mensalidade, MensalidadeConfig } from "@/types";
import { lancarMensalidadeNoCaixa } from "@/services/livroCaixaService";
import {
  aplicarAjustesFichaMesTodosCooperados,
  upsertAjustesFichaMesCooperativa,
} from "@/services/notaPedidoService";
import { getCurrentMesReferencia } from "@/utils/format";
import { normalizeCnpj } from "@/utils/cooperativa";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function vencimentoDoMes(mesReferencia: string, dia: number): string {
  const diaStr = String(Math.min(Math.max(dia, 1), 28)).padStart(2, "0");
  return `${mesReferencia}-${diaStr}`;
}

export function mesesCobrancaEfetivos(cfg: MensalidadeConfig | undefined): string[] {
  if (!cfg) return [];
  const marcados = (cfg.mesesCobranca ?? []).filter(Boolean).sort();
  if (marcados.length > 0) return marcados;
  if (cfg.gerarAutomaticamente && cfg.valorPadrao > 0) return [getCurrentMesReferencia()];
  return [];
}

export function deveCobrarMensalidadeMes(cfg: MensalidadeConfig | undefined, mesReferencia: string): boolean {
  if (!cfg || cfg.valorPadrao <= 0) return false;
  const meses = mesesCobrancaEfetivos(cfg);
  return meses.includes(mesReferencia);
}

/** True quando amanhã é o dia de vencimento configurado. */
export function isAvisoMensalidadeVenceAmanha(cfg: MensalidadeConfig | undefined): boolean {
  if (!cfg || cfg.valorPadrao <= 0) return false;
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const diaVenc = Math.min(Math.max(cfg.diaVencimento || 10, 1), 28);
  return amanha.getDate() === diaVenc;
}

/** Une config salva (Mensalidades / Perfil) sem apagar campos do outro lugar. */
export function mergeConfigMensalidadeCooperativa(
  existing: MensalidadeConfig | undefined,
  patch: MensalidadeConfig
): MensalidadeConfig {
  const valor = Number(patch.valorPadrao ?? existing?.valorPadrao) || 0;
  const diaVencimento = Math.min(28, Math.max(1, patch.diaVencimento ?? existing?.diaVencimento ?? 10));
  const mesesRaw = patch.mesesCobranca?.length
    ? patch.mesesCobranca
    : existing?.mesesCobranca ?? [];
  const meses = [...mesesRaw].filter(Boolean).sort();

  return {
    ...existing,
    ...patch,
    valorPadrao: valor,
    diaVencimento,
    diaLembrete: Math.min(
      28,
      Math.max(1, patch.diaLembrete ?? existing?.diaLembrete ?? Math.max(1, diaVencimento - 1))
    ),
    gerarAutomaticamente: patch.gerarAutomaticamente ?? existing?.gerarAutomaticamente ?? valor > 0,
    mesesCobranca: meses,
    lembreteAtivo: patch.lembreteAtivo ?? existing?.lembreteAtivo ?? true,
    lembreteTitulo: patch.lembreteTitulo ?? existing?.lembreteTitulo,
    lembreteTexto: patch.lembreteTexto ?? existing?.lembreteTexto,
    configSalvaEm: patch.configSalvaEm ?? existing?.configSalvaEm,
  };
}

export function getConfigMensalidadeCooperativa(
  data: AppData,
  cooperativaId: string
): MensalidadeConfig | undefined {
  return data.cooperativas.find((c) => c.id === cooperativaId)?.mensalidadeConfig;
}

export function textoAvisoMensalidadeAmanha(cfg: MensalidadeConfig): string {
  const dia = Math.min(Math.max(cfg.diaVencimento || 10, 1), 28);
  const valor = cfg.valorPadrao.toFixed(2).replace(".", ",");
  if (cfg.lembreteTexto?.trim()) {
    return cfg.lembreteTexto
      .replace("{valor}", valor)
      .replace("{dia}", String(dia))
      .replace("{amanha}", "amanhã");
  }
  return `A mensalidade de R$ ${valor} vence amanhã (dia ${dia}). Prepare o PIX para manter seu cadastro em dia.`;
}

function criarMensalidade(
  cooperadoId: string,
  mes: string,
  valor: number,
  diaVencimento: number,
  now: string
): Mensalidade {
  return {
    id: newId("m"),
    cooperadoId,
    mesReferencia: mes,
    valor,
    vencimento: vencimentoDoMes(mes, diaVencimento),
    status: "pendente",
    observacao: "Gerada automaticamente",
    createdAt: now,
    updatedAt: now,
  };
}

/** Chave PIX da cooperativa para pagamento de mensalidade (CNPJ). */
export function getChavePixMensalidadeCooperativa(data: AppData, cooperativaId: string): string | null {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop?.cnpj) return null;
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : null;
}

export function getCooperativaIdDoCooperado(data: AppData, cooperadoId: string): string | undefined {
  return data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
}

/** Gera mensalidade do mês atual para um cooperado recém-cadastrado. */
export function ensureMensalidadeCooperado(data: AppData, cooperadoId: string): AppData | null {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado || cooperado.status !== "ativo") return null;

  const coop = data.cooperativas.find((c) => c.id === cooperado.cooperativaId);
  const cfg = coop?.mensalidadeConfig;
  if (!cfg?.gerarAutomaticamente || cfg.valorPadrao <= 0) return null;

  const mes = getCurrentMesReferencia();
  if (!deveCobrarMensalidadeMes(cfg, mes)) return null;
  const jaExiste = data.mensalidades.some(
    (m) => m.cooperadoId === cooperadoId && m.mesReferencia === mes
  );
  if (jaExiste) return null;

  const now = new Date().toISOString();
  return {
    ...data,
    mensalidades: [
      ...data.mensalidades,
      criarMensalidade(cooperadoId, mes, cfg.valorPadrao, cfg.diaVencimento, now),
    ],
  };
}

/** Gera mensalidades pendentes do mês para cooperados ativos quando configurado na cooperativa. */
export function ensureMensalidadesDoMes(data: AppData): AppData | null {
  return ensureMensalidadesMeses(data);
}

function gerarMensalidadesCooperativaMes(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string,
  cfg: MensalidadeConfig,
  mensalidades: Mensalidade[],
  now: string
): boolean {
  if (!deveCobrarMensalidadeMes(cfg, mesReferencia)) return false;
  let changed = false;
  const cooperados = data.cooperados.filter(
    (c) => c.cooperativaId === cooperativaId && c.status === "ativo"
  );
  for (const cooperado of cooperados) {
    const idx = mensalidades.findIndex(
      (m) => m.cooperadoId === cooperado.id && m.mesReferencia === mesReferencia
    );
    if (idx >= 0) {
      const m = mensalidades[idx];
      if (
        (m.status === "pendente" || m.status === "atrasada") &&
        (m.valor !== cfg.valorPadrao ||
          m.vencimento !== vencimentoDoMes(mesReferencia, cfg.diaVencimento))
      ) {
        mensalidades[idx] = {
          ...m,
          valor: cfg.valorPadrao,
          vencimento: vencimentoDoMes(mesReferencia, cfg.diaVencimento),
          updatedAt: now,
        };
        changed = true;
      }
      continue;
    }
    mensalidades.push(
      criarMensalidade(cooperado.id, mesReferencia, cfg.valorPadrao, cfg.diaVencimento, now)
    );
    changed = true;
  }
  return changed;
}

/** Gera mensalidades para os meses marcados na configuração (retroativo, atual ou futuro). */
export function ensureMensalidadesMeses(data: AppData, cooperativaId?: string): AppData | null {
  const now = new Date().toISOString();
  let changed = false;
  const mensalidades = [...data.mensalidades];

  for (const coop of data.cooperativas) {
    if (cooperativaId && coop.id !== cooperativaId) continue;
    const cfg = coop.mensalidadeConfig;
    if (!cfg?.gerarAutomaticamente || cfg.valorPadrao <= 0) continue;

    const meses = mesesCobrancaEfetivos(cfg);
    for (const mes of meses) {
      if (gerarMensalidadesCooperativaMes(data, coop.id, mes, cfg, mensalidades, now)) {
        changed = true;
      }
    }
  }

  return changed ? { ...data, mensalidades } : null;
}

/** Salva configuração de mensalidade, aplica desconto fixo nos pagamentos e gera cobranças. */
export function aplicarConfigMensalidadeCooperativa(
  data: AppData,
  cooperativaId: string,
  cfg: MensalidadeConfig
): AppData {
  const now = new Date().toISOString();
  const existing = data.cooperativas.find((c) => c.id === cooperativaId)?.mensalidadeConfig;
  const normalized = mergeConfigMensalidadeCooperativa(existing, {
    ...cfg,
    configSalvaEm: now,
  });
  const valor = normalized.valorPadrao;
  const meses = normalized.mesesCobranca ?? [];

  let next: AppData = {
    ...data,
    cooperativas: data.cooperativas.map((c) =>
      c.id === cooperativaId
        ? { ...c, mensalidadeConfig: normalized, updatedAt: now }
        : c
    ),
  };

  if (valor > 0 && meses.length > 0) {
    let ajustesFichaMes = next.ajustesFichaMes ?? [];
    let arquivosMensais = next.arquivosMensais;
    for (const mes of meses) {
      const patch = { mensalidadeFixa: valor };
      ajustesFichaMes = upsertAjustesFichaMesCooperativa(next, cooperativaId, mes, patch);
      arquivosMensais = aplicarAjustesFichaMesTodosCooperados(
        { ...next, ajustesFichaMes },
        cooperativaId,
        mes,
        patch
      );
      next = { ...next, ajustesFichaMes, arquivosMensais };
    }
  }

  return sincronizarMensalidadeCooperativa(next, cooperativaId);
}

/** Gera/atualiza cobranças e alinha valores com a config da cooperativa. */
export function sincronizarMensalidadeCooperativa(
  data: AppData,
  cooperativaId?: string
): AppData {
  let next = data;
  const ensured = ensureMensalidadesMeses(next, cooperativaId);
  if (ensured) next = ensured;
  const status = atualizarStatusMensalidades(next);
  if (status) next = status;
  return next;
}

/** Marca mensalidades pendentes como atrasadas após o vencimento. */
export function atualizarStatusMensalidades(data: AppData): AppData | null {
  const hoje = new Date().toISOString().split("T")[0];
  let changed = false;

  const mensalidades = data.mensalidades.map((m) => {
    if (m.status !== "pendente" || !m.vencimento) return m;
    if (m.vencimento >= hoje) return m;
    changed = true;
    return { ...m, status: "atrasada" as const, updatedAt: new Date().toISOString() };
  });

  return changed ? { ...data, mensalidades } : null;
}

/** Cooperado informou que pagou via PIX — aguarda confirmação. */
export function cooperadoInformouPagamentoMensalidade(
  data: AppData,
  mensalidadeId: string,
  comprovante?: string
): AppData | null {
  const m = data.mensalidades.find((x) => x.id === mensalidadeId);
  if (!m) return null;

  const podeInformar =
    m.status === "pendente" ||
    m.status === "atrasada" ||
    (m.status === "aguardando_confirmacao" && comprovante && !m.comprovante);

  if (!podeInformar) return null;

  const now = new Date().toISOString();
  return {
    ...data,
    mensalidades: data.mensalidades.map((x) =>
      x.id === mensalidadeId
        ? {
            ...x,
            status: "aguardando_confirmacao" as const,
            informadoPagamentoEm: x.informadoPagamentoEm ?? now,
            formaPagamento: "PIX",
            comprovante: comprovante ?? x.comprovante,
            updatedAt: now,
          }
        : x
    ),
  };
}

/** Diretoria confirma recebimento do PIX. */
export function confirmarPagamentoMensalidade(
  data: AppData,
  mensalidadeId: string,
  responsavel: string
): AppData | null {
  const m = data.mensalidades.find((x) => x.id === mensalidadeId);
  if (!m || m.status !== "aguardando_confirmacao") return null;

  const hoje = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const atualizada: Mensalidade = {
    ...m,
    status: "paga" as const,
    dataPagamento: hoje,
    formaPagamento: m.formaPagamento ?? "PIX",
    observacao: m.observacao
      ? `${m.observacao} · Confirmado por ${responsavel}`
      : `Confirmado por ${responsavel}`,
    updatedAt: now,
  };
  const next: AppData = {
    ...data,
    mensalidades: data.mensalidades.map((x) => (x.id === mensalidadeId ? atualizada : x)),
  };
  return lancarMensalidadeNoCaixa(next, atualizada);
}

export function mensalidadePodePagarComPix(m: Mensalidade): boolean {
  return m.status === "pendente" || m.status === "atrasada";
}

export function mensalidadeAguardandoConfirmacao(m: Mensalidade): boolean {
  return m.status === "aguardando_confirmacao";
}

export type SituacaoMensalidadesCooperado =
  | "em_dia"
  | "pendente"
  | "atrasada"
  | "aguardando_confirmacao";

export interface ResumoMensalidadesCooperado {
  situacao: SituacaoMensalidadesCooperado | "sem_mensalidade";
  mensalidadeMesAtual?: Mensalidade;
  qtdAtrasadas: number;
  qtdAguardandoConfirmacao: number;
  valorEmAberto: number;
}

function statusEfetivoMensalidade(m: Mensalidade, hoje: string): Mensalidade["status"] {
  if (m.status === "pendente" && m.vencimento && m.vencimento < hoje) return "atrasada";
  return m.status;
}

/** Resumo para exibir no início do painel do cooperado. */
export function getResumoMensalidadesCooperado(
  data: AppData,
  cooperadoId: string
): ResumoMensalidadesCooperado {
  const hoje = new Date().toISOString().split("T")[0];
  const mesAtual = getCurrentMesReferencia();
  const todas = data.mensalidades
    .filter((m) => m.cooperadoId === cooperadoId)
    .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));

  if (todas.length === 0) {
    const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
    const coop = cooperado
      ? data.cooperativas.find((c) => c.id === cooperado.cooperativaId)
      : undefined;
    const cfg = coop?.mensalidadeConfig;
    if (
      cooperado?.status === "ativo" &&
      cfg &&
      cfg.valorPadrao > 0 &&
      deveCobrarMensalidadeMes(cfg, mesAtual)
    ) {
      const vencimento = vencimentoDoMes(mesAtual, cfg.diaVencimento || 10);
      const atrasada = vencimento < hoje;
      const sintetica: Mensalidade = {
        id: `cfg_${cooperadoId}_${mesAtual}`,
        cooperadoId,
        mesReferencia: mesAtual,
        valor: cfg.valorPadrao,
        vencimento,
        status: atrasada ? "atrasada" : "pendente",
        observacao: "Configuração da cooperativa",
        createdAt: hoje,
        updatedAt: hoje,
      };
      return {
        situacao: atrasada ? "atrasada" : "pendente",
        mensalidadeMesAtual: sintetica,
        qtdAtrasadas: atrasada ? 1 : 0,
        qtdAguardandoConfirmacao: 0,
        valorEmAberto: cfg.valorPadrao,
      };
    }
    return {
      situacao: "sem_mensalidade",
      qtdAtrasadas: 0,
      qtdAguardandoConfirmacao: 0,
      valorEmAberto: 0,
    };
  }

  const mensalidadeMesAtual = todas.find((m) => m.mesReferencia === mesAtual);
  const qtdAtrasadas = todas.filter((m) => statusEfetivoMensalidade(m, hoje) === "atrasada").length;
  const qtdAguardandoConfirmacao = todas.filter((m) => m.status === "aguardando_confirmacao").length;
  const abertas = todas.filter((m) => {
    const st = statusEfetivoMensalidade(m, hoje);
    return st === "pendente" || st === "atrasada" || st === "aguardando_confirmacao" || st === "parcelada";
  });
  const valorEmAberto = abertas.reduce((s, m) => s + m.valor, 0);

  let situacao: SituacaoMensalidadesCooperado | "sem_mensalidade" = "em_dia";
  if (qtdAtrasadas > 0) {
    situacao = "atrasada";
  } else if (qtdAguardandoConfirmacao > 0) {
    situacao = "aguardando_confirmacao";
  } else if (mensalidadeMesAtual) {
    const st = statusEfetivoMensalidade(mensalidadeMesAtual, hoje);
    if (st === "paga") situacao = "em_dia";
    else if (st === "pendente") situacao = "pendente";
    else situacao = "em_dia";
  } else if (abertas.length > 0) {
    situacao = "pendente";
  } else {
    situacao = "em_dia";
  }

  return {
    situacao,
    mensalidadeMesAtual,
    qtdAtrasadas,
    qtdAguardandoConfirmacao,
    valorEmAberto,
  };
}
