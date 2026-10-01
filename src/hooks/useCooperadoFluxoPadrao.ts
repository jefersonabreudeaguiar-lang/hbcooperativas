"use client";

import { useMemo } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useCooperadoApresentacaoFinanceiraConsolidada } from "@/hooks/useCooperadoApresentacaoFinanceiraConsolidada";
import { useCooperadoInicioCardContext } from "@/hooks/useCooperadoInicioCardContext";
import { useCooperadoExibirAguardandoAssinatura } from "@/hooks/useCooperadoExibirAguardandoAssinatura";
import { cooperadoFluxoPainelProjecaoOpts } from "@/lib/cooperadoFluxoFinanceiroGlobal";

/**
 * Contrato único do fluxo cooperado (referência H204 — mesmo pipeline para todo cooperadoId).
 * Use em Início, Ficha corrida e painéis financeiros do app cooperado.
 */
export function useCooperadoFluxoPadrao(opts?: { aguardandoAssinatura?: boolean }) {
  const { user } = useAuth();
  const financeiro = useCooperadoApresentacaoFinanceiraConsolidada();
  const inicioCard = useCooperadoInicioCardContext(user);
  const assinatura = useCooperadoExibirAguardandoAssinatura(Boolean(opts?.aguardandoAssinatura));

  const painelProjecaoOpts = useMemo(
    () =>
      cooperadoFluxoPainelProjecaoOpts({
        role: user?.role,
        syncing: financeiro.syncing,
        cooperadoPagamentosHydrated: financeiro.cooperadoPagamentosHydrated,
        conferindoPagamentoNuvem: assinatura.conferindoPagamentoNuvem,
      }),
    [
      user?.role,
      financeiro.syncing,
      financeiro.cooperadoPagamentosHydrated,
      assinatura.conferindoPagamentoNuvem,
    ]
  );

  return {
    user,
    cooperadoId: inicioCard?.cooperadoId,
    cooperativaId: inicioCard?.cooperativaId,
    data: inicioCard?.data ?? null,
    dataReady: inicioCard?.dataReady ?? false,
    ...financeiro,
    ...assinatura,
    painelProjecaoOpts,
  };
}
