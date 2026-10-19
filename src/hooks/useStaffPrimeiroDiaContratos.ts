"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAppDataWarm, getData, getSession } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { isCooperadoAppUser } from "@/permissions";
import {
  hasStaffPrimeiroDiaContratosBeenSeen,
  markStaffPrimeiroDiaContratosSeen,
  shouldRedirectStaffPrimeiroDiaContratos,
} from "@/lib/staff/staffPrimeiroDiaContratos";

/** Responsável sem contrato: uma vez por sessão, abre Contratos. Cooperado não entra. */
export function useStaffPrimeiroDiaContratos(): void {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const user = getSession();
    if (!user || isCooperadoAppUser(user)) return;
    if (!isAppDataWarm()) return;
    const data = getData();
    const coopId = getUserCooperativaId(user, data);
    if (
      !shouldRedirectStaffPrimeiroDiaContratos({
        role: user.role,
        coopId,
        pathname,
        data,
        warm: true,
      })
    ) {
      return;
    }
    const cnpj = normalizeCnpj(user.cooperativaCnpj ?? "");
    if (cnpj.length === 14 && hasStaffPrimeiroDiaContratosBeenSeen(cnpj)) return;
    if (cnpj.length === 14) markStaffPrimeiroDiaContratosSeen(cnpj);
    router.replace("/contratos");
  }, [pathname, router]);
}
