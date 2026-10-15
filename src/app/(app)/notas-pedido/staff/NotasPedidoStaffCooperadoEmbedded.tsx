"use client";

import dynamic from "next/dynamic";
import type { NotaPedido } from "@/types";
import type { listarResumosMensaisEntregas } from "@/services/cooperadoEntregasService";
import type { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";

type ResumoMensalEntregas = ReturnType<typeof listarResumosMensaisEntregas>[number];
type ResumoFichaEmAberto = ReturnType<typeof listarResumosFichaEmAbertoCooperado>[number];

const CooperadoEntregasPorMes = dynamic(
  () =>
    import("@/components/cooperado/CooperadoEntregasPorMes").then((m) => ({
      default: m.CooperadoEntregasPorMes,
    })),
  {
    loading: () => (
      <div className="py-8 text-center text-sm text-gray-500 bg-white rounded-2xl border border-gray-100">
        Carregando entregas…
      </div>
    ),
  }
);

const CooperadoMinhaFichaTab = dynamic(
  () =>
    import("@/components/cooperado/CooperadoMinhaFichaTab").then((m) => ({
      default: m.CooperadoMinhaFichaTab,
    })),
  {
    loading: () => (
      <div className="py-10 text-center text-sm text-gray-500 bg-white rounded-2xl border">Carregando ficha…</div>
    ),
  }
);

export type NotasPedidoStaffCooperadoEmbeddedProps = {
  abaCooperado: "entregas" | "ficha";
  cooperadoId: string;
  coopId: string | undefined;
  nomeCooperadoExibicao: string;
  resumosMensaisCooperado: ResumoMensalEntregas[];
  resumosFichaCooperado: ResumoFichaEmAberto[];
  statusFilter: string;
  ultimaNotaEnviadaIds: string[];
  onReenviar: (n: NotaPedido) => void;
  onExcluir: (n: NotaPedido) => void;
  getEscolaLabel: (n: NotaPedido) => string;
};

/** Trecho cooperado legado no StaffMain — chunk separado (não carrega na fila do responsável). */
export default function NotasPedidoStaffCooperadoEmbedded(props: NotasPedidoStaffCooperadoEmbeddedProps) {
  const {
    abaCooperado,
    cooperadoId,
    coopId,
    nomeCooperadoExibicao,
    resumosMensaisCooperado,
    resumosFichaCooperado,
    statusFilter,
    ultimaNotaEnviadaIds,
    onReenviar,
    onExcluir,
    getEscolaLabel,
  } = props;

  if (abaCooperado === "ficha") {
    return (
      <CooperadoMinhaFichaTab
        cooperadoId={cooperadoId}
        cooperativaId={coopId}
        nomeCooperado={nomeCooperadoExibicao}
        resumos={resumosFichaCooperado}
        getEscolaLabel={getEscolaLabel}
      />
    );
  }

  if (statusFilter && resumosMensaisCooperado.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border">
        <p className="font-medium">
          {statusFilter === "pendentes" ? "Nenhuma entrega pendente" : "Nenhuma entrega com este filtro"}
        </p>
        <p className="text-sm mt-1">
          {statusFilter === "pendentes"
            ? "Entregas aprovadas ou pagas ficam no histórico completo."
            : "Toque em Histórico completo para ver todas as entregas."}
        </p>
      </div>
    );
  }

  return (
    <CooperadoEntregasPorMes
      resumos={resumosMensaisCooperado}
      nomeCooperado={nomeCooperadoExibicao}
      ultimaNotaEnviadaIds={ultimaNotaEnviadaIds}
      onReenviar={onReenviar}
      onExcluir={onExcluir}
      getEscolaLabel={getEscolaLabel}
    />
  );
}
