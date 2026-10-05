"use client";

import { createContext, useContext, type ReactNode } from "react";

export type CooperadoTabPanelContextValue = {
  /** Rota da aba inferior atualmente visível (pathname do App Router). */
  activeHref: string;
};

const CooperadoTabPanelContext = createContext<CooperadoTabPanelContextValue | null>(null);

export function CooperadoTabPanelProvider({
  activeHref,
  children,
}: {
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <CooperadoTabPanelContext.Provider value={{ activeHref }}>
      {children}
    </CooperadoTabPanelContext.Provider>
  );
}

export function useCooperadoTabPanelContext(): CooperadoTabPanelContextValue | null {
  return useContext(CooperadoTabPanelContext);
}
