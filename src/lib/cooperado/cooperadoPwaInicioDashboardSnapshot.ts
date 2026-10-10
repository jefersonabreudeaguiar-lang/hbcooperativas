/**
 * Snapshot do painel Início (cooperado PWA mobile) — evita recomputar a cada sync do AppData.
 */
import type { AppData, User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  contarFotosEmAnaliseCooperado,
  listarNotasPendentesCooperado,
} from "@/services/cooperadoEntregasService";
import {
  bicCentralMesPrincipalQuantoVouReceber,
  bicCentralResolveInicioParaExibicao,
} from "@/services/bicLeituraCentralCooperado";
import {
  bicCentralGetResumoMensalidadesCooperado,
  bicCentralTotalValoresAvulsosPendentes,
} from "@/services/bicLeituraCentralDominios";
import { getComunicadosInicioCooperado } from "@/services/comunicadoService";
import { getPagamentoPendenteAssinaturaReciboCooperado } from "@/services/notaPedidoService";
import { listarResolvidosInicioCooperado } from "@/services/cooperadoInicioResolvidosService";
import { cooperadoTemAppInstalado, isAppStandalone } from "@/services/cooperadoAppInstallService";
import { cooperadoUsaAssinaturaCadastroPilot } from "@/config/assinaturaCadastroPilot";
import {
  cooperadoPrecisaCadastrarAssinatura,
} from "@/services/cooperadoAssinaturaService";
import { listPautasAbertasCooperado, resultadoVisivelCooperado } from "@/services/votacaoService";
import { getCooperativaCnpj, getPendingNotaDeleteIds } from "@/services/notaPedidoCloudService";
import { prestacaoPrincipalCooperado, prestacaoExigeAtencaoCooperado } from "@/services/prestacaoContasService";
import { cooperadoPrecisaCadastrarPix } from "@/utils/pix";
import { getUserCooperativaId, getUserCooperativaNome, normalizeCnpj } from "@/utils/cooperativa";
import { getCurrentMesReferencia } from "@/utils/format";

export const COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION = 1;

export type CooperadoPwaInicioDashboardView = {
  cooperadoId: string;
  mes: string;
  cooperado: AppData["cooperados"][number] | undefined;
  coopNome: string;
  valorReceber: ReturnType<typeof bicCentralResolveInicioParaExibicao>;
  precisaPix: boolean;
  rejeitadas: ReturnType<typeof listarNotasPendentesCooperado>;
  fotosEmAnalise: number;
  mensalidadeAberta: boolean;
  prestacao: ReturnType<typeof prestacaoPrincipalCooperado>;
  prestacaoAberta: boolean;
  exibirCardAvulsosSeparado: boolean;
  comunicados: ReturnType<typeof getComunicadosInicioCooperado>;
  pautasAbertas: ReturnType<typeof listPautasAbertasCooperado>;
  resultadoVotacao: ReturnType<typeof resultadoVisivelCooperado>;
  resolvidos: ReturnType<typeof listarResolvidosInicioCooperado>;
  temSecaoPendencias: boolean;
  mostrarBaixarApp: boolean;
  coopId: string | undefined;
  mostrarAssinaturaPilot: boolean;
  precisaAssinatura: boolean;
  cnpjDigits: string;
};

export type CooperadoPwaInicioDashboardSnapshot = {
  v: number;
  appBuild: number;
  savedAt: string;
  view: CooperadoPwaInicioDashboardView;
};

function storageKey(cooperadoId: string, cooperativaId: string): string {
  return `hb.coop.pwaInicioDash.v${COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION}:${cooperativaId}:${cooperadoId}`;
}

export function buildCooperadoPwaInicioDashboardView(
  data: AppData,
  user: Omit<User, "password">,
  apresentacaoConsolidada: boolean
): CooperadoPwaInicioDashboardView | null {
  if (!user.cooperadoId) return null;

  const coopId = getUserCooperativaId(user, data);
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const mes = getCurrentMesReferencia();
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coopNome = getUserCooperativaNome(user, data);
  let valorReceber = bicCentralResolveInicioParaExibicao(data, cooperadoId, coopId, {
    apresentacaoConsolidada,
  });
  const reciboPendente = getPagamentoPendenteAssinaturaReciboCooperado(data, cooperadoId);
  if (!reciboPendente && valorReceber.valor <= 0) {
    valorReceber = {
      ...valorReceber,
      exibir: false,
      valor: 0,
      valorRecibo: 0,
      aguardandoAssinatura: false,
    };
  }
  const precisaPix = cooperado ? cooperadoPrecisaCadastrarPix(cooperado.chavePix, cooperado.pixValido) : false;
  const notasPendentes = listarNotasPendentesCooperado(data, cooperadoId, coopId);
  const rejeitadas = notasPendentes.filter((n) => n.status === "rejeitada");
  const cnpj = coopId ? getCooperativaCnpj(data, coopId) : undefined;
  const pendingDeletes = cnpj ? getPendingNotaDeleteIds(cnpj) : new Set<string>();
  const notasEmAnalise = notasPendentes.filter(
    (n) => n.status === "aguardando_conferencia" && !pendingDeletes.has(n.id)
  );
  const fotosEmAnalise = contarFotosEmAnaliseCooperado(notasEmAnalise);
  const resumoMens = bicCentralGetResumoMensalidadesCooperado(data, cooperadoId, coopId);
  const mensalidadeAberta = resumoMens.situacao === "atrasada";
  const prestacao = coopId ? prestacaoPrincipalCooperado(data, cooperadoId, coopId) : undefined;
  const prestacaoAberta = prestacao ? prestacaoExigeAtencaoCooperado(prestacao) : false;
  const avulsosPendentesTotal = bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, undefined, coopId);
  const avulsosJaNoCardPrincipal =
    valorReceber.exibir &&
    (valorReceber.meses.length > 0
      ? valorReceber.meses.some((m) => bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, m, coopId) > 0)
      : bicCentralTotalValoresAvulsosPendentes(data, cooperadoId, valorReceber.mes, coopId) > 0);
  const exibirCardAvulsosSeparado = avulsosPendentesTotal > 0 && !avulsosJaNoCardPrincipal;
  const comunicados = coopId ? getComunicadosInicioCooperado(data, coopId, cooperadoId) : [];
  const pautasAbertas = coopId ? listPautasAbertasCooperado(data, coopId, cooperadoId) : [];
  const resultadoVotacao = coopId ? resultadoVisivelCooperado(data, coopId) : null;
  const resolvidos = listarResolvidosInicioCooperado(data, cooperadoId, coopId);
  const mostrarAssinaturaPilot = cooperadoUsaAssinaturaCadastroPilot(cooperadoId);
  const precisaAssinatura =
    mostrarAssinaturaPilot && cooperadoPrecisaCadastrarAssinatura(cooperadoId, cooperado);
  const temSecaoPendencias =
    rejeitadas.length > 0 ||
    fotosEmAnalise > 0 ||
    valorReceber.exibir ||
    valorReceber.valor > 0 ||
    precisaPix ||
    precisaAssinatura ||
    mensalidadeAberta ||
    prestacaoAberta ||
    exibirCardAvulsosSeparado;
  const mostrarBaixarApp =
    Boolean(cooperado) &&
    !cooperado!.avulso &&
    !isAppStandalone() &&
    !cooperadoTemAppInstalado(cooperado!);
  const cnpjDigits = cnpj ? normalizeCnpj(cnpj) : "";

  return {
    cooperadoId,
    mes,
    cooperado,
    coopNome,
    valorReceber,
    precisaPix,
    rejeitadas,
    fotosEmAnalise,
    mensalidadeAberta,
    prestacao,
    prestacaoAberta,
    exibirCardAvulsosSeparado,
    comunicados,
    pautasAbertas,
    resultadoVotacao,
    resolvidos,
    temSecaoPendencias,
    mostrarBaixarApp,
    coopId,
    mostrarAssinaturaPilot,
    precisaAssinatura,
    cnpjDigits,
  };
}

export function lerCooperadoPwaInicioDashboardSnapshot(
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaInicioDashboardSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(cooperadoId, cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPwaInicioDashboardSnapshot;
    if (parsed.v !== COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION || !parsed.view) return null;
    if (!cooperadoPwaSnapshotBuildReadable(parsed.appBuild)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarCooperadoPwaInicioDashboardSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  payload: CooperadoPwaInicioDashboardSnapshot
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(cooperadoId, cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function persistirCooperadoPwaInicioDashboardSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  user: Omit<User, "password">,
  apresentacaoConsolidada: boolean,
  data?: AppData | null
): CooperadoPwaInicioDashboardSnapshot | null {
  const d = data ?? (isAppDataWarm() ? getData() : null);
  if (!d) return null;
  const view = buildCooperadoPwaInicioDashboardView(d, user, apresentacaoConsolidada);
  if (!view) return null;
  const payload: CooperadoPwaInicioDashboardSnapshot = {
    v: COOPERADO_PWA_INICIO_DASHBOARD_SNAPSHOT_VERSION,
    appBuild: APP_BUILD_VERSION,
    savedAt: new Date().toISOString(),
    view,
  };
  gravarCooperadoPwaInicioDashboardSnapshot(cooperadoId, cooperativaId, payload);
  return payload;
}

export function persistirCooperadoPwaInicioDashboardSnapshotFromUser(
  user: Omit<User, "password">,
  apresentacaoConsolidada = true
): CooperadoPwaInicioDashboardSnapshot | null {
  if (user.role !== "cooperado" || !user.cooperadoId) return null;
  const d = isAppDataWarm() ? getData() : null;
  const coopId = (d ? getUserCooperativaId(user, d) : undefined) ?? user.cooperativaId;
  if (!coopId) return null;
  const canon = d
    ? resolverCooperadoIdCanonico(d, user.cooperadoId, coopId)
    : user.cooperadoId;
  return persistirCooperadoPwaInicioDashboardSnapshot(canon, coopId, user, apresentacaoConsolidada, d);
}
