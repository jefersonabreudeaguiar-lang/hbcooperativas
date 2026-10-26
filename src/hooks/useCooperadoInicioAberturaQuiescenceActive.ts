"use client";

import { useSyncExternalStore } from "react";
import {
  cooperadoInicioAberturaQuiescenceActive,
  subscribeCooperadoInicioAberturaQuiescence,
} from "@/lib/cooperado/cooperadoInicioAberturaQuiescence";

/** Re-render quando a quiescência de abertura do Início termina. */
export function useCooperadoInicioAberturaQuiescenceActive(): boolean {
  return useSyncExternalStore(
    subscribeCooperadoInicioAberturaQuiescence,
    cooperadoInicioAberturaQuiescenceActive,
    () => false
  );
}
