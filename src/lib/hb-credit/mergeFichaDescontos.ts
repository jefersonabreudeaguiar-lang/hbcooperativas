import type { FichaCorridaDesconto } from "@/types";
import type { ResumoPagamentoCooperado } from "@/services/notaPedidoService";

function isEstornoContaCoop(motivo: string): boolean {
  return motivo.toLowerCase().includes("estorno");
}

export type DescontoContaCoopRemoto = {
  motivo: string;
  valorReais: number;
  tipo: "conta_coop";
  createdAt: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function descontosContaCoopFromArquivo(
  arquivo?: { contaCoopDescontos?: Array<{ motivo: string; valorReais: number; tipo: "conta_coop" | "credito_avulso"; createdAt?: string }> }
): DescontoContaCoopRemoto[] {
  return (arquivo?.contaCoopDescontos ?? [])
    .filter((d) => d.valorReais > 0)
    .map((d) => ({
      motivo: d.motivo,
      valorReais: d.valorReais,
      tipo: "conta_coop" as const,
      createdAt: d.createdAt ?? new Date().toISOString(),
    }));
}

/** Total líquido usado na Conta Coop no mês (compras − estornos confirmados). */
export function liquidoUsoContaCoopMes(descontos: DescontoContaCoopRemoto[]): number {
  let compras = 0;
  let estornos = 0;
  for (const d of descontos) {
    if (isEstornoContaCoop(d.motivo)) estornos += d.valorReais;
    else compras += d.valorReais;
  }
  return round2(Math.max(0, compras - estornos));
}

export function descontosContaCoopLinhasExibicao(descontos: DescontoContaCoopRemoto[]): FichaCorridaDesconto[] {
  return descontos
    .filter((d) => d.valorReais > 0)
    .map((d) => ({
      tipo: isEstornoContaCoop(d.motivo) ? ("credito_avulso" as const) : ("conta_coop" as const),
      motivo: d.motivo,
      valor: round2(d.valorReais),
    }));
}

export function mergeDescontosContaCoopNoResumo(
  resumo: ResumoPagamentoCooperado,
  descontosRemotos: DescontoContaCoopRemoto[]
): ResumoPagamentoCooperado {
  if (!descontosRemotos.length) return resumo;

  const extras: FichaCorridaDesconto[] = [...resumo.descontosExtras];
  for (const item of descontosRemotos) {
    const isEstorno = isEstornoContaCoop(item.motivo);
    extras.push({
      tipo: isEstorno ? "credito_avulso" : "conta_coop",
      motivo: item.motivo,
      valor: round2(item.valorReais),
    });
  }

  const totalDescontosSemCoop = round2(
    resumo.descontosExtras.filter((d) => d.tipo !== "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const totalCreditosSemCoop = round2(
    resumo.descontosExtras.filter((d) => d.tipo === "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  /** Líquido Conta Coop (compras − estornos) — evita estorno órfão inflar o valor a receber. */
  const liquidoContaCoop = liquidoUsoContaCoopMes(descontosRemotos);
  const valorLiquido = round2(
    Math.max(0, resumo.valorEntregas - totalDescontosSemCoop - liquidoContaCoop + totalCreditosSemCoop)
  );

  return {
    ...resumo,
    descontosExtras: extras,
    valorLiquido,
  };
}
