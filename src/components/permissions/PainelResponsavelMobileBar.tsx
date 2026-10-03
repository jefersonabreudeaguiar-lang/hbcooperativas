"use client";

import { useEffect, useState } from "react";
import { Shield, UserCircle } from "lucide-react";
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

/** Celular: alternar cooperado vinculado × painel da diretoria; desktop gestão = tela larga. */
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

  const staffMode = painelAccess.staffMode;

  return (
    <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <p className="min-w-0">
        {staffMode ? (
          <>
            <strong>Modo responsável</strong> — conferência, cooperados e pagamentos neste aparelho.
          </>
        ) : (
          <>
            <strong>Modo cooperado</strong> no celular (padrão). Gestão completa funciona melhor no{" "}
            <strong>computador</strong> (tela larga).
          </>
        )}
      </p>
      <Button
        type="button"
        size="sm"
        variant={staffMode ? "secondary" : "primary"}
        className="shrink-0"
        onClick={() => setPreferPainelResponsavelMobile(!painelMobile)}
      >
        {staffMode ? (
          <>
            <UserCircle size={16} className="mr-1 inline" />
            Ver como cooperado
          </>
        ) : (
          <>
            <Shield size={16} className="mr-1 inline" />
            Abrir painel responsável
          </>
        )}
      </Button>
    </div>
  );
}
