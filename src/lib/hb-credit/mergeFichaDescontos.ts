import type { FichaCorridaDesconto } from "@/types";
import type { ResumoPagamentoCooperado } from "@/services/notaPedidoService";

export type DescontoContaCoopRemoto = {
  motivo: string;
  valorReais: number;
  tipo: "conta_coop";
  createdAt: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function mergeDescontosContaCoopNoResumo(
  resumo: ResumoPagamentoCooperado,
  descontosRemotos: DescontoContaCoopRemoto[]
): ResumoPagamentoCooperado {
  if (!descontosRemotos.length) return resumo;

  const extras: FichaCorridaDesconto[] = [...resumo.descontosExtras];
  for (const item of descontosRemotos) {
    const isEstorno = item.motivo.toLowerCase().includes("estorno");
    extras.push({
      tipo: isEstorno ? "credito_avulso" : "conta_coop",
      motivo: item.motivo,
      valor: round2(item.valorReais),
    });
  }

  const totalDescontos = round2(
    extras.filter((d) => d.tipo !== "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const totalCreditos = round2(
    extras.filter((d) => d.tipo === "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const valorLiquido = round2(Math.max(0, resumo.valorEntregas - totalDescontos + totalCreditos));

  return {
    ...resumo,
    descontosExtras: extras,
    valorLiquido,
  };
}
