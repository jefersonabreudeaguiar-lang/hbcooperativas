"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
import { registrarCooperadoJefersonForegroundEntrada } from "@/lib/cooperado/cooperadoJefersonDuplaEntradaAutoAtualizar";

/**
 * Piloto Jeferson: 1ª entrada leve; 2ª entrada (≥30s após a 1ª) dispara Atualizar automático.
 * Sync automático só na 2ª entrada (≥30s); sem repetir a cada volta (evita travar).
 */
export function CooperadoJefersonDuplaEntradaAutoAtualizar() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !isCooperadoJefersonSomenteAtualizarPilot(user)) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      registrarCooperadoJefersonForegroundEntrada(user);
    };

    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [user?.id, user?.role, user?.cooperadoId]);

  return null;
}
