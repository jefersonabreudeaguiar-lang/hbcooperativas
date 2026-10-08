"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CooperadoFinanceiroShellState = {
  /** Ficha/sync ainda não pronta — conteúdo pode mostrar skeleton; shell segue navegável. */
  aguardandoDadosFinanceiros: boolean;
  bloqueiaEntrada: boolean;
  mensagemStatus: string | null;
};

const CooperadoFinanceiroShellContext = createContext<CooperadoFinanceiroShellState | null>(null);

export function CooperadoFinanceiroShellProvider({
  value,
  children,
}: {
  value: CooperadoFinanceiroShellState | null;
  children: ReactNode;
}) {
  return (
    <CooperadoFinanceiroShellContext.Provider value={value}>
      {children}
    </CooperadoFinanceiroShellContext.Provider>
  );
}

export function useCooperadoFinanceiroShell(): CooperadoFinanceiroShellState | null {
  return useContext(CooperadoFinanceiroShellContext);
}

/** Banner discreto no conteúdo — não bloqueia abas. */
export function CooperadoFinanceiroSyncBanner() {
  const state = useCooperadoFinanceiroShell();
  if (!state?.aguardandoDadosFinanceiros || !state.mensagemStatus) return null;
  return (
    <div
      className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900"
      role="status"
      aria-live="polite"
    >
      {state.mensagemStatus}
    </div>
  );
}
