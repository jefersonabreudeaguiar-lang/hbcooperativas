"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useHbCreditEnabled } from "@/hooks/useHbCreditEnabled";
import { Button } from "@/components/ui/Button";
import { fetchMercadoParceiroData, requestMercadoPinReset } from "@/services/creditApiService";

/** Barra fixa para mercado parceiro — reset do PIN de estorno sempre visível. */
export function MercadoParceiroPinResetBar() {
  const { user } = useAuth();
  const { enabled: creditEnabled } = useHbCreditEnabled();
  const pathname = usePathname();
  const router = useRouter();
  const [pinResetPending, setPinResetPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const isParceiro = user?.role === "parceiro";

  const reload = useCallback(async () => {
    if (!isParceiro || !creditEnabled) return;
    try {
      const data = await fetchMercadoParceiroData();
      setPinResetPending(Boolean(data.pinResetPending));
    } catch {
      /* offline */
    }
  }, [creditEnabled, isParceiro]);

  useEffect(() => {
    void reload();
  }, [reload, pathname]);

  if (!isParceiro || !creditEnabled) return null;

  const irPainel = () => {
    if (pathname !== "/mercado-parceiro") {
      router.push("/mercado-parceiro");
      return;
    }
    document.getElementById("pin-financeiro-mercado")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const solicitarReset = async () => {
    const msg =
      "Solicitar reset do PIN de estorno?\n\n" +
      "O responsável da cooperativa receberá o pedido em Conta Coop → Mercados.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await requestMercadoPinReset();
      setPinResetPending(true);
      setMessage(data.message ?? "Solicitação enviada.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível solicitar reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-300 bg-amber-50 px-3 py-2.5 shadow-lg safe-area-pb lg:bottom-auto lg:top-14 lg:border-t-0 lg:border-b">
      <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 text-sm text-amber-950">
          <KeyRound size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">PIN de estorno (HB Créditos)</p>
            <p className="text-xs text-amber-900">
              {pinResetPending
                ? "Reset solicitado — aguarde o responsável em Conta Coop → Mercados."
                : "Esqueceu o PIN? Solicite reset ou cadastre um novo no painel."}
            </p>
            {message && <p className="text-xs mt-1 text-amber-800">{message}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={irPainel}>
            Ver PIN
          </Button>
          {!pinResetPending && (
            <Button type="button" size="sm" onClick={() => void solicitarReset()} disabled={busy}>
              {busy ? "Enviando…" : "Solicitar reset"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
