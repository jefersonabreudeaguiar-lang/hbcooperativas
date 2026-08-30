"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { fetchCooperativeFiscalPending } from "@/services/creditApiService";
import { getCurrentMesReferencia } from "@/utils/format";
import { cn } from "@/utils/format";

interface ContaCoopFilaCloudPanelProps {
  cnpj: string;
}

export function ContaCoopFilaCloudPanel({ cnpj }: ContaCoopFilaCloudPanelProps) {
  const [conferir, setConferir] = useState(0);
  const [mercadoPendente, setMercadoPendente] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!cnpj) return;
    let cancelled = false;
    void fetchCooperativeFiscalPending(cnpj, getCurrentMesReferencia())
      .then((data) => {
        if (cancelled) return;
        setConferir(data.conferir);
        setMercadoPendente(data.mercadoPendente);
      })
      .catch(() => {
        if (!cancelled) {
          setConferir(0);
          setMercadoPendente(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cnpj]);

  if (!loaded || (conferir === 0 && mercadoPendente === 0)) return null;

  return (
    <div className="space-y-2">
      {conferir > 0 && (
        <Link
          href="/conta-coop?tab=conferir_nf"
          className={cn(
            "flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 border-l-4 border-l-amber-500",
            "hover:border-green-300 hover:bg-green-50/40 transition-colors"
          )}
        >
          <span className="shrink-0 w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <FileText size={20} className="text-amber-700" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">Conferir NFs Conta Coop</span>
              <span className="text-xs font-bold bg-gray-900 text-white px-1.5 py-0.5 rounded-full tabular-nums">
                {conferir}
              </span>
            </span>
            <span className="block text-sm text-gray-500 mt-0.5">
              {conferir === 1 ? "1 nota fiscal aguardando conferência" : `${conferir} notas fiscais aguardando conferência`}
            </span>
          </span>
          <ChevronRight size={18} className="text-gray-300 shrink-0" />
        </Link>
      )}

      {mercadoPendente > 0 && (
        <AlertBanner variant="warning" title="Mercados com NF pendente">
          {mercadoPendente} venda(s) aguardando anexo ou correção de NF no app do mercado. Liquidação bloqueada até
          regularizar.
        </AlertBanner>
      )}
    </div>
  );
}
