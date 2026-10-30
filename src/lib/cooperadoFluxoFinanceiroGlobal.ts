/**
 * H204 — caminho funcional global cooperado (Orlando Desktop como referência de fluxo, não de dados).
 * Centraliza critérios de readiness e projeção para UI/testes — sem exceção por cooperadoId.
 */
import type { AppData } from "@/types";
import type { UserRole } from "@/types";
import {
  cooperadoApresentacaoFinanceiraConsolidada,
  cooperadoCarregandoValoresFinanceiros,
  type CooperadoSyncPresentationInput,
} from "@/lib/cooperadoApresentacaoFinanceira";
import {
  getInicioCooperadoParaExibicao,
  getPainelQuantoVouReceberCooperadoParaExibicao,
  getQuantoVouReceberCooperadoParaExibicao,
  type BicProjecaoFinanceiraCooperadoOpts,
} from "@/services/bicProjecaoFinanceiraCooperado";
import { getValorQuantoVouReceber } from "@/services/cooperadoEntregasService";
import { getPagamentoAguardandoCooperado } from "@/services/notaPedidoService";

export type CooperadoFluxoReadiness = CooperadoSyncPresentationInput;

/** Etapas do fluxo real (login → UI) — ordem fixa para todos os cooperados. */
export const COOPERADO_FLUXO_FINANCEIRO_ETAPAS = [
  "login_resolveExperienceUser",
  "appdata_warm_waitForAppDataWarm",
  "sync_provider_mount_runSync_force",
  "sync_cooperadoPagamentosHydrated_false",
  "sync_syncCooperativaBackground",
  "sync_ensureCooperadoFinanceiroFromCloud",
  "sync_aplicarSanidadeFinanceiroCooperadoLocal",
  "sync_cooperadoPagamentosHydrated_true_runSync_finally",
  "gate_cooperadoApresentacaoFinanceiraConsolidada",
  "projecao_getInicioCooperadoParaExibicao",
  "projecao_getQuantoVouReceberCooperadoParaExibicao",
  "projecao_getPainelQuantoVouReceberCooperadoParaExibicao",
  "ui_dashboard_ficha",
] as const;

export function cooperadoFluxoApresentacaoPronta(input: CooperadoFluxoReadiness): boolean {
  return cooperadoApresentacaoFinanceiraConsolidada(input);
}

export function cooperadoFluxoCarregandoFinanceiro(input: CooperadoFluxoReadiness): boolean {
  return cooperadoCarregandoValoresFinanceiros(input);
}

/** Mesmo critério M7 / ficha — sync ativo ou hydration incompleta. */
export function cooperadoFluxoPainelProjecaoOpts(
  input: CooperadoFluxoReadiness & { conferindoPagamentoNuvem?: boolean }
): Pick<BicProjecaoFinanceiraCooperadoOpts, "carregandoNuvem" | "financeiroSincronizando"> {
  return {
    carregandoNuvem: Boolean(input.conferindoPagamentoNuvem),
    financeiroSincronizando: !cooperadoFluxoApresentacaoPronta(input),
  };
}

export type CooperadoFluxoProjecaoSnapshot = {
  apresentacaoConsolidada: boolean;
  carregando: boolean;
  inicioValor: number;
  inicioAguardando: boolean;
  m6Valor: number;
  m6Aguardando: boolean;
  painelEstado: string;
  pagamentoAguardandoId: string | null;
  motorValor: number;
};

/**
 * Projeção única usada na simulação H204 — espelha dashboard + ficha (facades + gates).
 */
export function projetarCooperadoFluxoFinanceiroGlobal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  readiness: CooperadoFluxoReadiness & { conferindoPagamentoNuvem?: boolean }
): CooperadoFluxoProjecaoSnapshot {
  const apresentacaoConsolidada = cooperadoFluxoApresentacaoPronta(readiness);
  const painelOpts = cooperadoFluxoPainelProjecaoOpts(readiness);
  const inicio = getInicioCooperadoParaExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada,
  }).value;
  const m6 = getQuantoVouReceberCooperadoParaExibicao(data, cooperadoId, cooperativaId, {
    apresentacaoConsolidada,
  }).value;
  const painel = getPainelQuantoVouReceberCooperadoParaExibicao(
    data,
    cooperadoId,
    cooperativaId,
    painelOpts
  ).value;
  const motor = getValorQuantoVouReceber(data, cooperadoId, cooperativaId);
  const pg = getPagamentoAguardandoCooperado(data, cooperadoId);
  return {
    apresentacaoConsolidada,
    carregando: cooperadoFluxoCarregandoFinanceiro(readiness),
    inicioValor: inicio.valor,
    inicioAguardando: inicio.aguardandoAssinatura,
    m6Valor: m6.valor,
    m6Aguardando: m6.aguardandoAssinatura,
    painelEstado: painel.estado,
    pagamentoAguardandoId: pg?.id ?? null,
    motorValor: motor.valor,
  };
}

/** Proibido no fluxo global de produção — usado nos testes H204. */
export function fluxoGlobalProibidoReferenciaOrlandoNoCodigo(fonte: string): boolean {
  const forbidden = [
    /if\s*\(\s*cooperadoId\s*===\s*['"]c_1782263929381_ncp55['"]/,
    /if\s*\(\s*orlando/i,
    /cooperadoId\s*===\s*ORLANDO/i,
  ];
  return !forbidden.some((re) => re.test(fonte));
}

export function fluxoGlobalRoleReadinessDefault(role: UserRole | string | undefined): CooperadoFluxoReadiness {
  if (role !== "cooperado") {
    return { role, syncing: false, cooperadoPagamentosHydrated: true };
  }
  return { role: "cooperado", syncing: true, cooperadoPagamentosHydrated: false };
}
