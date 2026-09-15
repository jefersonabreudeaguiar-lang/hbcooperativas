import { useEffect } from "react";
import type { User } from "@/types";
import { refreshContaCoopDescontosAfterOperacionalSync } from "@/lib/hb-credit/syncContaCoopFichaDescontos";
import { getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

/** Carrega compras HB da Supabase ao abrir o app (todos os cooperados / equipe). */
export function useHbCreditDescontosWarmup(user: Omit<User, "password"> | null) {
  useEffect(() => {
    if (!user || !isContaCoopValorReceberPilot()) return;
    const coopId = getUserCooperativaId(user, getData());
    if (!coopId) return;

    let cancelled = false;
    void resolveCooperativaCnpj(getData(), coopId, user).then((cnpj) => {
      if (cancelled || !cnpj) return;
      void refreshContaCoopDescontosAfterOperacionalSync({
        cnpj,
        cooperativaId: coopId,
        user,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);
}
