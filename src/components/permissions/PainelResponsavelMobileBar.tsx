"use client";

import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useAppDataSelector } from "@/hooks/useAppData";
import { canAccessPainelResponsavel } from "@/lib/security/responsavelPanelAccess";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import {
  preferPainelResponsavelMobile,
  setPreferPainelResponsavelMobile,
  PAINEL_MOBILE_PREF_EVENT,
} from "@/lib/mobilePainelPreference";
import { shouldRenderStaffPainelUi } from "@/lib/staffNavigationUser";
import { Button } from "@/components/ui/Button";

/** Só no celular da gestão — o app do cooperado não oferece atalho para o painel. */
export function PainelResponsavelMobileBar() {
  const { accountUser } = useAuth();
  const painelAccess = useAppDataSelector(
    (data) => {
      if (!accountUser) return null;
      return {
        canGestao: canAccessPainelResponsavel(accountUser, data),
        staffMode: shouldRenderStaffPainelUi(accountUser, data),
      };
    },
    [accountUser?.id, accountUser?.role]
  );
  const [painelMobile, setPainelMobile] = useState(false);

  useEffect(() => {
    setPainelMobile(preferPainelResponsavelMobile());
    const onPref = () => setPainelMobile(preferPainelResponsavelMobile());
    window.addEventListener(PAINEL_MOBILE_PREF_EVENT, onPref);
    return () => window.removeEventListener(PAINEL_MOBILE_PREF_EVENT, onPref);
  }, []);

  if (!accountUser || !painelAccess) return null;
  if (!painelAccess.canGestao) return null;
  if (!isMobileCooperativaApp()) return null;
  if (!painelAccess.staffMode) return null;

  return (
    <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <p className="min-w-0">
        <strong>Modo responsável</strong> — conferência, cooperados e pagamentos neste aparelho.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0"
        onClick={() => {
          if (!painelMobile) return;
          setPreferPainelResponsavelMobile(false);
        }}
      >
        <UserCircle size={16} className="mr-1 inline" />
        Ver como cooperado
      </Button>
    </div>
  );
}
