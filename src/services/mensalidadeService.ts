import type { AppData, Cooperado, Mensalidade, MensalidadeConfig } from "@/types";
import { lancarMensalidadeNoCaixa } from "@/services/livroCaixaService";
import {
  resolverCooperadoIdCanonico,
  getCooperadoNomeResolvido,
  encontrarCooperadoLocalEquivalente,
  mesmoCooperadoCadastro,
  nomeNormalizado,
} from "@/services/cooperadoCloudService";
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

export function mensalidadePertenceCooperado(
  data: AppData,
  mensalidade: Mensalidade,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  if (mensalidade.cooperadoId === cooperadoId) return true;

  const coopCooperados = data.cooperados.filter(
    (c) => !cooperativaId || c.cooperativaId === cooperativaId
  );
  const alvo =
    coopCooperados.find((c) => c.id === cooperadoId) ??
    coopCooperados.find(
      (c) => c.id === resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId)
    );
  if (!alvo) return false;

  const donoDireto = coopCooperados.find((c) => c.id === mensalidade.cooperadoId);
  if (donoDireto && mesmoCooperadoCadastro(alvo, donoDireto)) return true;

  const donoCanonicoId = resolverCooperadoIdCanonico(
    data,
    mensalidade.cooperadoId,
    cooperativaId
  );
  const donoResolvido = coopCooperados.find((c) => c.id === donoCanonicoId);
  if (donoResolvido && mesmoCooperadoCadastro(alvo, donoResolvido)) return true;

  const nomeAlvo = nomeNormalizado(getCooperadoNomeResolvido(data, cooperadoId, cooperativaId));
  const nomeDono = nomeNormalizado(
    getCooperadoNomeResolvido(data, mensalidade.cooperadoId, cooperativaId)
  );
  if (nomeAlvo.length > 2 && nomeAlvo === nomeDono) return true;

  return false;
}

/** Alinha cobrança da nuvem (id do responsável) ao cooperado deste aparelho. */
export function prepararMensalidadeCloud(
  data: AppData,
  mensalidade: Mensalidade,
  cooperativaId: string,
  cloudCooperados: Cooperado[] = []
): Mensalidade {
  const cloudRef = cloudCooperados.find((c) => c.id === mensalidade.cooperadoId);
  if (cloudRef) {
    const local = encontrarCooperadoLocalEquivalente(data, cooperativaId, cloudRef);
    if (local && local.id !== mensalidade.cooperadoId) {
      return { ...mensalidade, cooperadoId: local.id };
    }
  }
  return normalizarMensalidadeCooperadoLocal(data, mensalidade, cooperativaId);
}

/** Reescreve cooperadoId órfão usando cadastros da nuvem. */
export function reconciliarMensalidadesComCooperadosCloud(
  data: AppData,
  cooperativaId: string,
  cloudCooperados: Cooperado[]
): AppData {
  if (cloudCooperados.length === 0) return data;

  let changed = false;
  const mensalidades = data.mensalidades.map((m) => {
    const localIds = new Set(
      data.cooperados.filter((c) => c.cooperativaId === cooperativaId).map((c) => c.id)
    );
    if (localIds.has(m.cooperadoId)) return m;

    const cloudRef = cloudCooperados.find((c) => c.id === m.cooperadoId);
    if (!cloudRef) return m;

    const local = encontrarCooperadoLocalEquivalente(data, cooperativaId, cloudRef);
    if (!local || local.id === m.cooperadoId) return m;

    changed = true;
    return { ...m, cooperadoId: local.id, updatedAt: new Date().toISOString() };
  });

  return changed ? { ...data, mensalidades } : data;
}

export function prepararMensalidadesCloud(
  data: AppData,
  mensalidades: Mensalidade[],
  cooperativaId: string,
  cloudCooperados: Cooperado[] = []
): Mensalidade[] {
  return mensalidades.map((m) =>
    prepararMensalidadeCloud(data, m, cooperativaId, cloudCooperados)
  );
}

/** Mensalidade visível neste aparelho (qualquer cooperado cadastrado na cooperativa). */
export function mensalidadeVisivelNoDispositivo(
  data: AppData,
  mensalidade: Mensalidade,
  cooperativaId: string
): boolean {
  return data.cooperados
    .filter((c) => c.cooperativaId === cooperativaId)
    .some((c) => mensalidadePertenceCooperado(data, mensalidade, c.id, cooperativaId));
}

/** Alinha cooperadoId da cobrança ao cadastro local (sync entre aparelhos). */
export function normalizarMensalidadeCooperadoLocal(
  data: AppData,
  mensalidade: Mensalidade,
  cooperativaId: string
): Mensalidade {
  const local = data.cooperados.find(
    (c) =>
      c.cooperativaId === cooperativaId &&
      mensalidadePertenceCooperado(data, mensalidade, c.id, cooperativaId)
  );
  if (local && local.id !== mensalidade.cooperadoId) {
    return { ...mensalidade, cooperadoId: local.id };
  }
  return mensalidade;
}

/** Evita que o cooperado apague na nuvem cobranças de outros ao sincronizar. */
export function mesclarMensalidadesPayloadNuvem(
  data: AppData,
  cooperativaId: string,
  payloadMensalidades: Mensalidade[],
  cloudMensalidades: Mensalidade[]
): Mensalidade[] {
  const outros = cloudMensalidades.filter(
    (m) => !mensalidadeVisivelNoDispositivo(data, m, cooperativaId)
  );
  const minhasNuvem = cloudMensalidades
    .filter((m) => mensalidadeVisivelNoDispositivo(data, m, cooperativaId))
    .map((m) => normalizarMensalidadeCooperadoLocal(data, m, cooperativaId));
  const minhas = mergeArrayByNewer(payloadMensalidades, minhasNuvem);
  return mergeArrayByNewer(outros, minhas);
}

function mergeArrayByNewer<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  cloud: T[]
): T[] {
  const map = new Map<string, T>();
  const time = (item: T) => {
    const t = item.updatedAt ?? item.createdAt;
    return t ? new Date(t).getTime() : 0;
  };
  for (const item of local) map.set(item.id, item);
  for (const item of cloud) {
    const cur = map.get(item.id);
    if (!cur || time(item) >= time(cur)) map.set(item.id, item);
  }
  return [...map.values()];
}

export function listarMensalidadesCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): Mensalidade[] {
  return data.mensalidades
    .filter((m) => mensalidadePertenceCooperado(data, m, cooperadoId, cooperativaId))
    .sort(
      (a, b) =>
        b.mesReferencia.localeCompare(a.mesReferencia) || a.vencimento.localeCompare(b.vencimento)
    );
}

export function statusEfetivoMensalidade(m: Mensalidade, hoje?: string): Mensalidade["status"] {
  const ref = hoje ?? new Date().toISOString().split("T")[0];
  if (m.status === "pendente" && m.vencimento && m.vencimento < ref) return "atrasada";
  return m.status;
}

/** True quando a data de vencimento já passou (cobrança exigível). */
export function mensalidadeJaVenceu(m: Mensalidade, hoje?: string): boolean {
  const ref = hoje ?? new Date().toISOString().split("T")[0];
  return Boolean(m.vencimento && m.vencimento < ref);
}

/** Cobrança visível na UI — só vencidas ou aguardando confirmação; nunca pendente antes do vencimento. */
export function mensalidadeCobrancaVisivel(m: Mensalidade, hoje?: string): boolean {
  const st = statusEfetivoMensalidade(m, hoje);
  return st === "atrasada" || st === "aguardando_confirmacao";
}

/** Inclui na listagem padrão (vencidas + aguardando + pagas para histórico). */
export function mensalidadeListagemVisivel(
  m: Mensalidade,
  hoje?: string,
  opts?: { incluirPagas?: boolean }
): boolean {
  if (mensalidadeCobrancaVisivel(m, hoje)) return true;
  if (opts?.incluirPagas !== false && m.status === "paga") return true;
  return false;
}

/** Vincula mensalidades com id órfão ao cooperado local (nome/CPF). */
export function vincularMensalidadesCooperativa(data: AppData, cooperativaId: string): AppData {
  const coopCooperados = data.cooperados.filter((c) => c.cooperativaId === cooperativaId);
  if (coopCooperados.length === 0) return data;

  let changed = false;
  const mensalidades = data.mensalidades.map((m) => {
    if (coopCooperados.some((c) => c.id === m.cooperadoId)) return m;

    for (const local of coopCooperados) {
      if (!mensalidadePertenceCooperado(data, m, local.id, cooperativaId)) continue;
      if (m.cooperadoId === local.id) return m;
      changed = true;
      return { ...m, cooperadoId: local.id, updatedAt: new Date().toISOString() };
    }
    return m;
  });

  return changed ? { ...data, mensalidades } : data;
}

/** Cloud → aparelho: entra se pertence a algum cooperado local (mesmo com id da nuvem diferente). */
export function mensalidadeCloudEntraNoDispositivo(
  data: AppData,
  mensalidade: Mensalidade,
  cooperativaId: string,
  cloudCooperados: Cooperado[] = []
): boolean {
  const prep = prepararMensalidadeCloud(data, mensalidade, cooperativaId, cloudCooperados);
  if (mensalidadeVisivelNoDispositivo(data, prep, cooperativaId)) return true;

  const cloudRef = cloudCooperados.find((c) => c.id === mensalidade.cooperadoId);
  if (cloudRef && encontrarCooperadoLocalEquivalente(data, cooperativaId, cloudRef)) return true;

  return false;
}

function mensalidadeDestaqueResumo(
  todas: Mensalidade[],
  hoje: string,
  _mesAtual: string
): Mensalidade | undefined {
  const vencidas = todas.filter((m) => mensalidadeCobrancaVisivel(m, hoje));
  const atrasadas = vencidas.filter((m) => statusEfetivoMensalidade(m, hoje) === "atrasada");
  if (atrasadas.length > 0) return atrasadas[0];
  if (vencidas.length > 0) return vencidas[0];
  return undefined;
}

function resumoConfigSemRegistros(
  data: AppData,
  cooperadoId: string,
  hoje: string,
  mesAtual: string
): ResumoMensalidadesCooperado | null {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coop = cooperado
    ? data.cooperativas.find((c) => c.id === cooperado.cooperativaId)
    : undefined;
  const cfg = coop?.mensalidadeConfig;
  if (!cooperado || cooperado.status === "desligado" || !cfg || cfg.valorPadrao <= 0) return null;

  let meses = [...mesesCobrancaEfetivos(cfg)];
  if (meses.length === 0) meses = [mesAtual];

  meses.sort().reverse();
  let destaque: Mensalidade | undefined;
  let qtdAtrasadas = 0;
  let valorEmAberto = 0;

  for (const mes of meses) {
    const vencimento = vencimentoDoMes(mes, cfg.diaVencimento || 10);
    const atrasada = vencimento < hoje;
    if (!atrasada) continue;

    const sintetica: Mensalidade = {
      id: `cfg_${cooperadoId}_${mes}`,
      cooperadoId,
      mesReferencia: mes,
      valor: cfg.valorPadrao,
      vencimento,
      status: "atrasada",
      observacao: "Configuração da cooperativa",
      createdAt: hoje,
      updatedAt: hoje,
    };

    qtdAtrasadas += 1;
    valorEmAberto += cfg.valorPadrao;
    if (!destaque) destaque = sintetica;
  }

  if (!destaque) return null;

  return {
    situacao: "atrasada",
    mensalidadeMesAtual: destaque,
    qtdAtrasadas,
    qtdAguardandoConfirmacao: 0,
    valorEmAberto,
  };
}

function mensalidadesSinteticasCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): Mensalidade[] {
  const hoje = new Date().toISOString().split("T")[0];
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coopId = cooperativaId ?? cooperado?.cooperativaId;
  const coop = coopId ? data.cooperativas.find((c) => c.id === coopId) : undefined;
  const cfg = coop?.mensalidadeConfig;
  if (!cooperado || cooperado.status === "desligado" || !cfg || cfg.valorPadrao <= 0) return [];

  let meses = [...mesesCobrancaEfetivos(cfg)];
  if (meses.length === 0) meses = [getCurrentMesReferencia()];

  return meses
    .sort()
    .reverse()
    .map((mes) => {
      const vencimento = vencimentoDoMes(mes, cfg.diaVencimento || 10);
      return {
        id: `cfg_${cooperadoId}_${mes}`,
        cooperadoId,
        mesReferencia: mes,
        valor: cfg.valorPadrao,
        vencimento,
        status: vencimento < hoje ? ("atrasada" as const) : ("pendente" as const),
        observacao: "Configuração da cooperativa",
        createdAt: hoje,
        updatedAt: hoje,
      } satisfies Mensalidade;
    })
    .filter((m) => mensalidadeJaVenceu(m, hoje));
}

/** Lista para a aba Mensalidades do cooperado (inclui cobranças sintéticas da config quando ainda não geradas). */
export function listarMensalidadesExibicaoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): Mensalidade[] {
  const coopId =
    cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const reais = listarMensalidadesCooperado(data, cooperadoId, coopId).map((m) =>
    coopId ? normalizarMensalidadeCooperadoLocal(data, m, coopId) : m
  );
  const sinteticas = mensalidadesSinteticasCooperado(data, cooperadoId, coopId);

  const byMes = new Map<string, Mensalidade>();
  for (const m of reais) byMes.set(m.mesReferencia, m);
  for (const s of sinteticas) {
    if (!byMes.has(s.mesReferencia)) byMes.set(s.mesReferencia, s);
  }

  return [...byMes.values()]
    .filter((m) => mensalidadeListagemVisivel(m))
    .sort(
      (a, b) =>
        b.mesReferencia.localeCompare(a.mesReferencia) || a.vencimento.localeCompare(b.vencimento)
    );
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
    if (!cfg || cfg.valorPadrao <= 0) continue;

    const meses = mesesCobrancaEfetivos(cfg);
    if (meses.length === 0) continue;
    if (cfg.gerarAutomaticamente === false) continue;

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
  if (cooperativaId) {
    next = vincularMensalidadesCooperativa(next, cooperativaId);
  } else {
    for (const coop of next.cooperativas) {
      next = vincularMensalidadesCooperativa(next, coop.id);
    }
  }
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
  return statusEfetivoMensalidade(m) === "atrasada";
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

/** Resumo para exibir no início do painel do cooperado. */
export function getResumoMensalidadesCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ResumoMensalidadesCooperado {
  const hoje = new Date().toISOString().split("T")[0];
  const mesAtual = getCurrentMesReferencia();
  const coopId =
    cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const todas = listarMensalidadesExibicaoCooperado(data, cooperadoId, coopId);

  const cobrancas = todas.filter((m) => mensalidadeCobrancaVisivel(m, hoje));

  if (cobrancas.length === 0 && todas.filter((m) => m.status === "paga").length === 0) {
    return (
      resumoConfigSemRegistros(data, cooperadoId, hoje, mesAtual) ?? {
        situacao: "sem_mensalidade",
        qtdAtrasadas: 0,
        qtdAguardandoConfirmacao: 0,
        valorEmAberto: 0,
      }
    );
  }

  const mensalidadeMesAtual = mensalidadeDestaqueResumo(cobrancas, hoje, mesAtual);
  const qtdAtrasadas = cobrancas.filter((m) => statusEfetivoMensalidade(m, hoje) === "atrasada").length;
  const qtdAguardandoConfirmacao = cobrancas.filter((m) => m.status === "aguardando_confirmacao").length;
  const valorEmAberto = cobrancas.reduce((s, m) => s + m.valor, 0);

  let situacao: SituacaoMensalidadesCooperado | "sem_mensalidade" = "em_dia";
  if (qtdAtrasadas > 0) {
    situacao = "atrasada";
  } else if (qtdAguardandoConfirmacao > 0) {
    situacao = "aguardando_confirmacao";
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
