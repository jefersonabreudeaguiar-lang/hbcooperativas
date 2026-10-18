import type { AppData } from "@/types";
import { getRelatorioLancamentosEmAbertoResponsavel } from "@/services/responsavelPainelIndex";
import { flattenLinhasPagarCooperadoEmAberto } from "@/services/relatorioService";
import { classificarSituacaoEmAbertoConferir } from "@/components/notas/conferirEmAbertoSituacao";
import type { LinhaTabelaConferir } from "@/components/notas/LancamentosEmAbertoPainelView";

type OrigemLinhaEmAberto = {
  cooperadoId: string;
  meses?: string[];
  porMes: { mes: string }[];
};

/** Flatten usa `${cooperadoId}-${mes}`. Associação só por igualdade desse id. */
export function origemLinhaEmAbertoConferir<T extends OrigemLinhaEmAberto>(
  rowId: string,
  porCooperado: T[],
  detalharPorMes: boolean
): { origem: T | undefined; meses: string[] } {
  const origem = porCooperado.find((r) =>
    detalharPorMes
      ? r.porMes.some((m) => rowId === `${r.cooperadoId}-${m.mes}`)
      : r.cooperadoId === rowId
  );
  const meses = detalharPorMes
    ? (origem?.porMes.filter((m) => rowId === `${origem.cooperadoId}-${m.mes}`).map((m) => m.mes) ?? [])
    : (origem?.meses ?? []);
  return { origem, meses };
}

/**
 * Transformação pura do wrapper Conferir → Em aberto.
 * Entrada: AppData + coopId. Sem hook, sem getData(), sem persistência.
 */
export function montarRelatorioEmAbertoConferir(
  data: AppData,
  coopId: string,
  cooperadoId?: string
): {
  porCooperado: ReturnType<typeof getRelatorioLancamentosEmAbertoResponsavel>;
  linhasTabela: LinhaTabelaConferir[];
  detalharPorMes: boolean;
  totalGeral: number;
} {
  const porCooperado = getRelatorioLancamentosEmAbertoResponsavel(data, coopId, cooperadoId);
  const detalharPorMes = porCooperado.some((r) => r.porMes.length > 1);
  const linhasTabela: LinhaTabelaConferir[] = flattenLinhasPagarCooperadoEmAberto(porCooperado).map(
    (row) => {
      const { origem, meses } = origemLinhaEmAbertoConferir(row.id, porCooperado, detalharPorMes);
      return {
        ...row,
        situacao: classificarSituacaoEmAbertoConferir(
          data,
          coopId,
          origem?.cooperadoId ?? "",
          meses
        ),
      };
    }
  );
  const totalGeral = porCooperado.reduce((s, r) => s + r.total, 0);
  return { porCooperado, linhasTabela, detalharPorMes, totalGeral };
}
