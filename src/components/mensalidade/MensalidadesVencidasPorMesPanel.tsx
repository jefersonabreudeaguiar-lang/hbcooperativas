"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { agruparMensalidadesVencidasPorMes } from "@/services/mensalidadeService";
import { formatCurrency, formatDate, formatMesReferencia } from "@/utils/format";
import { getCooperadoNome } from "@/utils/calculations";
import type { AppData } from "@/types";

interface Props {
  cooperativaId: string;
}

export function MensalidadesVencidasPorMesPanel({ cooperativaId }: Props) {
  const data = useAppData();
  const [mesAberto, setMesAberto] = useState<string | null>(null);

  const grupos = useMemo(() => {
    if (!data) return [];
    return agruparMensalidadesVencidasPorMes(data, cooperativaId);
  }, [data, cooperativaId]);

  const toggleMes = (mes: string) => {
    setMesAberto((atual) => (atual === mes ? null : mes));
  };

  if (!data) return null;

  return (
    <Card title="Mensalidades vencidas por mês">
      <p className="text-sm text-gray-600 mb-4">
        Toque no mês para ver os cooperados. Mensalidades pagas não aparecem aqui.
        Os meses desmarcados na configuração acima somem automaticamente.
      </p>

      {grupos.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          Nenhuma mensalidade vencida nos meses de cobrança marcados.
        </p>
      ) : (
        <div className="space-y-2">
          {grupos.map((grupo) => {
            const aberto = mesAberto === grupo.mesReferencia;
            const totalValor = grupo.itens.reduce((s, m) => s + m.valor, 0);
            return (
              <div
                key={grupo.mesReferencia}
                className="rounded-xl border border-gray-200 overflow-hidden bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleMes(grupo.mesReferencia)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  aria-expanded={aberto}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {aberto ? (
                      <ChevronDown size={18} className="text-gray-500 shrink-0" />
                    ) : (
                      <ChevronRight size={18} className="text-gray-500 shrink-0" />
                    )}
                    <span className="font-semibold text-gray-900">
                      {formatMesReferencia(grupo.mesReferencia)}
                    </span>
                    <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                      {grupo.itens.length} cooperado(s)
                    </span>
                  </div>
                  <span className="text-sm font-bold text-red-700 shrink-0 tabular-nums">
                    {formatCurrency(totalValor)}
                  </span>
                </button>

                {aberto && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {grupo.itens.map((m) => (
                      <LinhaCooperado key={m.id} m={m} data={data} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function LinhaCooperado({
  m,
  data,
}: {
  m: import("@/types").Mensalidade;
  data: AppData;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-red-50/30">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 truncate">
          {getCooperadoNome(data.cooperados, m.cooperadoId)}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Venceu em {formatDate(m.vencimento)}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-bold text-gray-900 tabular-nums">{formatCurrency(m.valor)}</span>
        <StatusBadge status="atrasada" />
      </div>
    </div>
  );
}
