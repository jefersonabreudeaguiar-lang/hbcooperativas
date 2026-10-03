"use client";

import { memo, useCallback, useDeferredValue, useMemo } from "react";
import { DataTable } from "@/components/ui/Table";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { NotaFotoImg } from "@/components/ui/NotaFotoImg";
import { FOTO_ENTREGA_THUMB_IMG } from "@/components/notas/fotoEntregaDisplay";
import { useAppDataSelector } from "@/hooks/useAppData";
import { getCooperadoNome } from "@/utils/calculations";
import { formatCurrency, formatDate } from "@/utils/format";
import { getFotoExibicaoNota, notaPertenceCooperativa, notaPertenceGrupoConferencia } from "@/utils/fotoEntrega";
import {
  notaElegivelParaFilaConferenciaResponsavel,
  notaPassaFiltroStatusListaConferencia,
  sanitizarNotaParaFilaConferencia,
} from "@/utils/notaStatus";
import { notaPertenceCooperado } from "@/services/cooperadoCloudService";
import type { NotaPedido } from "@/types";
import { Camera, ChevronRight, FileText } from "lucide-react";
function getEscolaNotaLabel(nota: NotaPedido, instituicoes: { id: string; nome: string }[]): string {
  if (nota.escolaAvulsaNome?.trim()) return nota.escolaAvulsaNome.trim();
  const inst = instituicoes.find((i) => i.id === nota.instituicaoId);
  if (inst) return inst.nome;
  return "Escola na nota";
}

type Props = {
  coopId: string;
  filtroCooperadoId: string;
  abaConferenciaEfetiva: string;
  statusFilter: string;
  canEdit: boolean;
  onView: (n: NotaPedido) => void;
  onConferir: (n: NotaPedido) => void;
  onDelete?: (n: NotaPedido) => void;
};

function NotasPedidoHistoricoResponsavelInner({
  coopId,
  filtroCooperadoId,
  abaConferenciaEfetiva,
  statusFilter,
  canEdit,
  onView,
  onConferir,
  onDelete,
}: Props) {
  const notas = useAppDataSelector(
    (d) => {
      const filtrarPorGrupoAtivo = Boolean(abaConferenciaEfetiva);
      return d.notasPedido
        .filter((n) => {
          if (!notaPertenceCooperativa(d, n, coopId)) return false;
          if (filtrarPorGrupoAtivo) {
            if (!notaPertenceGrupoConferencia(n, d, abaConferenciaEfetiva, coopId)) return false;
          } else if (filtroCooperadoId) {
            if (!notaPertenceCooperado(d, n, filtroCooperadoId, coopId)) return false;
          }
          if (statusFilter && !notaPassaFiltroStatusListaConferencia(n.status, statusFilter)) return false;
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [coopId, filtroCooperadoId, abaConferenciaEfetiva, statusFilter]
  );

  const instituicoes = useAppDataSelector((d) => d.instituicoes, []);
  const cooperados = useAppDataSelector((d) => d.cooperados, []);

  const notasDeferred = useDeferredValue(notas ?? []);

  const columns = useMemo(
    () => [
      { key: "numero", label: "Nota", render: (n: NotaPedido) => n.numeroNota },
      { key: "data", label: "Data", render: (n: NotaPedido) => formatDate(n.dataEntrega) },
      {
        key: "coop",
        label: "Cooperado",
        render: (n: NotaPedido) => getCooperadoNome(cooperados ?? [], n.cooperadoId),
      },
      {
        key: "escola",
        label: "Escola",
        render: (n: NotaPedido) => getEscolaNotaLabel(n, instituicoes ?? []),
      },
      {
        key: "tipo",
        label: "Tipo",
        render: (n: NotaPedido) =>
          n.lancamentoDireto ? <span className="text-xs text-amber-700 font-medium">Avulso</span> : "Com nota",
      },
      {
        key: "valor",
        label: "Valor",
        render: (n: NotaPedido) => (n.valorLiquido > 0 ? formatCurrency(n.valorLiquido) : "—"),
      },
      { key: "status", label: "Status", render: (n: NotaPedido) => <NotaStatusBadge status={n.status} /> },
    ],
    [cooperados, instituicoes]
  );

  const handleRowView = useCallback(
    (n: NotaPedido) => {
      if (notaElegivelParaFilaConferenciaResponsavel(sanitizarNotaParaFilaConferencia(n))) {
        void onConferir(n);
      } else {
        onView(n);
      }
    },
    [onConferir, onView]
  );

  const renderMobileCard = useCallback(
    (n: NotaPedido) => {
      const escola = getEscolaNotaLabel(n, instituicoes ?? []);
      const foto = getFotoExibicaoNota(n);
      return (
        <button
          type="button"
          onClick={() => handleRowView(n)}
          className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 transition-colors hover:border-green-300"
        >
          <div className="flex gap-3">
            {foto ? (
              <div className="w-20 h-24 rounded-lg border border-gray-200 bg-gray-50 shrink-0 flex items-center justify-center overflow-hidden p-1">
                <NotaFotoImg src={foto} alt="" className={FOTO_ENTREGA_THUMB_IMG} />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-400">
                {n.lancamentoDireto ? <FileText size={20} /> : <Camera size={20} />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-gray-900 truncate">{escola}</p>
                <NotaStatusBadge status={n.status} />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatDate(n.dataEntrega)} · {n.numeroNota}
              </p>
              {n.lancamentoDireto && <p className="text-xs text-amber-700 mt-0.5">Avulso · sem nota</p>}
              <p className="text-xs text-gray-600 mt-0.5">{getCooperadoNome(cooperados ?? [], n.cooperadoId)}</p>
              {n.valorLiquido > 0 && (
                <p className="text-sm font-semibold text-green-700 mt-1">{formatCurrency(n.valorLiquido)}</p>
              )}
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0 self-center" />
          </div>
        </button>
      );
    },
    [cooperados, instituicoes, handleRowView]
  );

  return (
    <>
      {canEdit && (
        <p className="text-sm text-gray-600 mb-3">
          Histórico de entregas — filtre por cooperado e use <strong>Excluir</strong> para remover uma entrega
          específica (não disponível para entregas já pagas).
        </p>
      )}
      <DataTable
        data={notasDeferred}
        keyField="id"
        mobileCard={renderMobileCard}
        emptyMessage="Nenhuma entrega registrada."
        columns={columns}
        onView={handleRowView}
        viewLabel="Ver"
        onDelete={canEdit ? onDelete : undefined}
      />
    </>
  );
}

export const NotasPedidoHistoricoResponsavel = memo(NotasPedidoHistoricoResponsavelInner);
