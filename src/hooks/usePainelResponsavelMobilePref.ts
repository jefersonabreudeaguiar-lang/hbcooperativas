"use client";

import { useSyncExternalStore } from "react";
import {
  PAINEL_MOBILE_PREF_EVENT,
  preferPainelResponsavelMobile,
} from "@/lib/mobilePainelPreference";

function subscribePainelPref(onChange: () => void): () => void {
  window.addEventListener(PAINEL_MOBILE_PREF_EVENT, onChange);
  return () => window.removeEventListener(PAINEL_MOBILE_PREF_EVENT, onChange);
}

/** Reabre o Início/shell no mesmo clique de «Abrir painel responsável». */
export function usePainelResponsavelMobilePref(): boolean {
  return useSyncExternalStore(
    subscribePainelPref,
    preferPainelResponsavelMobile,
    () => false
  );
}
