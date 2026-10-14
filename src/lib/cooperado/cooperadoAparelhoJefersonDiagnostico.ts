/**
 * Diagnóstico read-only — o que o aparelho do piloto Jeferson acumula localmente
 * vs aparelhos frios de outros cooperados (mesma conta em outro celular ≠ mesmo aparelho).
 */
import type { User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { cooperadoFinanceiroExibicaoCachePronto } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { cooperadoGaAparelhoPrecisaBootstrapNuvem } from "@/lib/cooperado/cooperadoGaColdBootstrap";
import {
  isCooperadoMobileGaPromoted,
  isCooperadoMobilePilot,
} from "@/lib/cooperado/cooperadoMobilePilot";
import { isCooperadoMobilePilotPerfActive } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { cooperadoPwaInstantPaintReady } from "@/lib/cooperado/cooperadoPwaInstantResume";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { isCooperadoPwaMobileLeveUi } from "@/lib/cooperado/cooperadoPwaLeveUi";
import { cooperadoLocalResumeReady } from "@/lib/performance/cooperadoColdStart";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";
import { getData, getSession, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { lerInicioCardPersistidoFlex } from "@/lib/cooperadoInicioCardPersistencia";
import { lerCooperadoPwaInicioDashboardSnapshot } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { lerCooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { lerCooperadoPwaEntregasResumosSnapshot } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";

export const COOPERADO_APARELHO_JEFERSON_DIAG_VERSION = "2026-10-14-v1";

const HB_OPERACIONAL_SYNCED_BUILD = "hb-coop-operacional-synced-build";
const STORAGE_KEY_APP_DATA = "coopeagriplla_data";
const SESSION_KEY = "coopeagriplla_session";

function mobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

function pilotPerfDom(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-cooperado-pilot-perf") === "1";
}

function readOperacionalSyncedBuild(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(HB_OPERACIONAL_SYNCED_BUILD);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function storageHasPrefix(prefix: string): boolean {
  if (typeof localStorage === "undefined") return false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes(prefix)) return true;
  }
  return false;
}

function appDataSizeKb(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APP_DATA);
    if (!raw) return 0;
    return Math.round((raw.length * 2) / 1024);
  } catch {
    return null;
  }
}

export type CooperadoAparelhoJefersonDiagnostico = {
  versao: string;
  build: number;
  geradoEm: string;
  conta: {
    cooperadoId?: string;
    email?: string;
    isPilotJeferson: boolean;
    gaPromoted: boolean;
  };
  runtime: {
    standalone: boolean;
    mobileViewport: boolean;
    pwaLeveUi: boolean;
    messengerMode: boolean;
    pilotPerfDom: boolean;
  };
  armazenamento: {
    sessionLocal: boolean;
    appDataWarm: boolean;
    appDataKb: number | null;
    operacionalSyncedBuild: number | null;
    operacionalBuildAlinhado: boolean;
    releaseOperacionalPendente: boolean;
    inicioCard: boolean;
    pwaInicioDash: boolean;
    pwaFichaResumo: boolean;
    pwaEntregasResumos: boolean;
    readModels: boolean;
  };
  gates: {
    aparelhoQuente: boolean;
    precisaBootstrapNuvem: boolean;
    instantPaintReady: boolean;
    exibicaoCachePronto: boolean;
    localResumeReady: boolean;
  };
  modeloJeferson: {
    paridadeCompleta: boolean;
    faltando: string[];
  };
};

export function buildCooperadoAparelhoJefersonDiagnostico(
  user: Omit<User, "password"> | null | undefined
): CooperadoAparelhoJefersonDiagnostico | null {
  if (!user || user.role !== "cooperado") return null;

  const session = getSession();
  const ga = isCooperadoMobileGaPromoted(user);
  const data = isAppDataWarm() ? getData() : null;
  const coopId = data ? getUserCooperativaId(user, data) ?? user.cooperativaId : user.cooperativaId;
  const cooperadoId =
    data && user.cooperadoId && coopId
      ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
      : user.cooperadoId;

  const inicioCard = Boolean(
    cooperadoId && coopId && lerInicioCardPersistidoFlex(cooperadoId, coopId)?.display
  );
  const pwaInicioDash = Boolean(
    cooperadoId && coopId && lerCooperadoPwaInicioDashboardSnapshot(cooperadoId, coopId)?.view
  );
  const pwaFicha = Boolean(
    cooperadoId && coopId && lerCooperadoPwaFichaResumoSnapshot(cooperadoId, coopId)?.paridade
  );
  const pwaEntregas = Boolean(
    cooperadoId && coopId && lerCooperadoPwaEntregasResumosSnapshot(cooperadoId, coopId)?.entregasBase
  );

  const syncedBuild = readOperacionalSyncedBuild();
  const aparelhoQuente =
    cooperadoFinanceiroExibicaoCachePronto(user) ||
    cooperadoLocalResumeReady(user) ||
    Boolean(inicioCard && pwaInicioDash);

  const faltando: string[] = [];
  if (!mobileViewport()) faltando.push("viewport_mobile");
  if (!isCooperadoPwaMobileLeveUi()) faltando.push("pwa_leve_ui");
  if (!isCooperadoPwaMessengerMode()) faltando.push("modo_mensageiro");
  if (!pilotPerfDom()) faltando.push("dom_pilot_perf");
  if (!isAppDataWarm()) faltando.push("app_data_aquecido");
  if ((appDataSizeKb() ?? 0) < 8) faltando.push("app_data_vazio_ou_minimo");
  if (!inicioCard) faltando.push("cache_inicio_card");
  if (!pwaInicioDash) faltando.push("snapshot_inicio_dashboard");
  if (!pwaFicha) faltando.push("snapshot_ficha_resumo");
  if (!syncedBuild || syncedBuild !== APP_BUILD_VERSION) faltando.push("build_operacional_alinhado");
  if (cooperadoAppReleaseNeedsOperacionalSync()) faltando.push("release_operacional_pendente");

  const paridadeCompleta = faltando.length === 0;

  return {
    versao: COOPERADO_APARELHO_JEFERSON_DIAG_VERSION,
    build: APP_BUILD_VERSION,
    geradoEm: new Date().toISOString(),
    conta: {
      cooperadoId,
      email: user.email,
      isPilotJeferson: isCooperadoMobilePilot(user),
      gaPromoted: ga,
    },
    runtime: {
      standalone: isAppStandalone(),
      mobileViewport: mobileViewport(),
      pwaLeveUi: isCooperadoPwaMobileLeveUi(),
      messengerMode: isCooperadoPwaMessengerMode(),
      pilotPerfDom: pilotPerfDom() || isCooperadoMobilePilotPerfActive(user),
    },
    armazenamento: {
      sessionLocal: Boolean(
        typeof localStorage !== "undefined" && localStorage.getItem(SESSION_KEY)
      ),
      appDataWarm: isAppDataWarm(),
      appDataKb: appDataSizeKb(),
      operacionalSyncedBuild: syncedBuild,
      operacionalBuildAlinhado: syncedBuild === APP_BUILD_VERSION,
      releaseOperacionalPendente: cooperadoAppReleaseNeedsOperacionalSync(),
      inicioCard,
      pwaInicioDash,
      pwaFichaResumo: pwaFicha,
      pwaEntregasResumos: pwaEntregas,
      readModels: storageHasPrefix("hb.coop.readModels"),
    },
    gates: {
      aparelhoQuente,
      precisaBootstrapNuvem: cooperadoGaAparelhoPrecisaBootstrapNuvem(user),
      instantPaintReady: cooperadoPwaInstantPaintReady(user),
      exibicaoCachePronto: cooperadoFinanceiroExibicaoCachePronto(user),
      localResumeReady: cooperadoLocalResumeReady(user),
    },
    modeloJeferson: {
      paridadeCompleta,
      faltando,
    },
  };
}

export function formatCooperadoAparelhoJefersonDiagnosticoText(
  diag: CooperadoAparelhoJefersonDiagnostico
): string {
  const lines = [
    `=== HB APARELHO vs JEFERSON · ${diag.versao} ===`,
    `build v${diag.build} · ${diag.geradoEm}`,
    `cooperado: ${diag.conta.cooperadoId ?? "—"} · piloto_jeferson: ${diag.conta.isPilotJeferson ? "SIM" : "não"}`,
    "",
    "--- RUNTIME (código) ---",
    `standalone(PWA instalado): ${diag.runtime.standalone}`,
    `mobile: ${diag.runtime.mobileViewport} · leve_ui: ${diag.runtime.pwaLeveUi} · mensageiro: ${diag.runtime.messengerMode}`,
    `pilot_perf_dom: ${diag.runtime.pilotPerfDom}`,
    "",
    "--- ARMAZENAMENTO LOCAL (o que o Jeferson já tem) ---",
    `app_data_kb: ${diag.armazenamento.appDataKb ?? "—"} · warm: ${diag.armazenamento.appDataWarm}`,
    `inicio_card: ${diag.armazenamento.inicioCard} · snap_inicio: ${diag.armazenamento.pwaInicioDash}`,
    `snap_ficha: ${diag.armazenamento.pwaFichaResumo} · snap_entregas: ${diag.armazenamento.pwaEntregasResumos}`,
    `operacional_synced_build: ${diag.armazenamento.operacionalSyncedBuild ?? "—"} · alinhado: ${diag.armazenamento.operacionalBuildAlinhado}`,
    "",
    "--- GATES ---",
    `aparelho_quente: ${diag.gates.aparelhoQuente} · bootstrap_nuvem: ${diag.gates.precisaBootstrapNuvem}`,
    `instant_paint: ${diag.gates.instantPaintReady} · cache_exibicao: ${diag.gates.exibicaoCachePronto}`,
    "",
    "--- MODELO JEFERSON ---",
    `paridade_completa: ${diag.modeloJeferson.paridadeCompleta ? "SIM" : "NÃO"}`,
    diag.modeloJeferson.faltando.length
      ? `faltando: ${diag.modeloJeferson.faltando.join(", ")}`
      : "faltando: (nenhum)",
    "",
    "--- JSON ---",
    JSON.stringify(diag, null, 2),
  ];
  return lines.join("\n");
}
