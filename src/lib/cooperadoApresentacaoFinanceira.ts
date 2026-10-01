import type { AppData, UserRole } from "@/types";
import {
  cooperadoFinanceiroBloqueiaEntradaApp,
  cooperadoFinanceiroDesatualizado,
} from "@/services/fichaSyncGuard";

export type CooperadoInicioCardsUi = {
  exibir: boolean;
  mes: string;
  meses: string[];
  mesLabel: string;
  valor: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
};

export type CooperadoSyncPresentationInput = {
  role: UserRole | string | undefined;
  syncing: boolean;
  cooperadoPagamentosHydrated: boolean;
};

/** H203 — cooperado só apresenta valores financeiros definitivos após hydration + fim de sync ativo. */
export function cooperadoApresentacaoFinanceiraConsolidada(
  input: CooperadoSyncPresentationInput
): boolean {
  if (input.role !== "cooperado") return true;
  return input.cooperadoPagamentosHydrated && !input.syncing;
}

export function cooperadoCarregandoValoresFinanceiros(input: CooperadoSyncPresentationInput): boolean {
  if (input.role !== "cooperado") return false;
  return !cooperadoApresentacaoFinanceiraConsolidada(input);
}

/**
 * H204 — libera `cooperadoPagamentosHydrated` só quando o runSync terminou bem
 * ou o aparelho está offline com fatia financeira local utilizável (mesmo critério Orlando).
 */
export function cooperadoApresentacaoFinanceiraPosRunSync(input: {
  syncCompleted: boolean;
  offline: boolean;
  data: AppData;
  cooperadoId: string;
  cooperativaId: string;
}): boolean {
  if (cooperadoFinanceiroDesatualizado(input.data, input.cooperadoId, input.cooperativaId)) {
    return false;
  }
  if (input.syncCompleted) return true;
  if (
    input.offline &&
    !cooperadoFinanceiroBloqueiaEntradaApp(input.data, input.cooperadoId, input.cooperativaId)
  ) {
    return true;
  }
  return false;
}

/** Mascara somente apresentação; não altera AppData nem projeção bruta. */
export function cooperadoInicioParaCardsDefinitivos(
  inicio: CooperadoInicioCardsUi,
  apresentacaoConsolidada: boolean
): CooperadoInicioCardsUi {
  if (apresentacaoConsolidada) return inicio;
  return {
    ...inicio,
    exibir: false,
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}

export type CooperadoQuantoVouReceberUi = {
  mes: string;
  meses: string[];
  mesLabel: string;
  valor: number;
  valorRecibo: number;
  aguardandoAssinatura: boolean;
};

/** H204 — mesma máscara de readiness do início (M6 agregado), sem alterar motor. */
export function cooperadoQuantoVouReceberParaApresentacao<T extends CooperadoQuantoVouReceberUi>(
  raw: T,
  apresentacaoConsolidada: boolean
): T {
  if (apresentacaoConsolidada) return raw;
  return {
    ...raw,
    valor: 0,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
}
