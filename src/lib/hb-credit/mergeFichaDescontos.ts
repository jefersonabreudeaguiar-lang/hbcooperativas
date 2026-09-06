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

export function mesReferenciaFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function dedupeDescontosContaCoopRemotos(
  descontos: DescontoContaCoopRemoto[]
): DescontoContaCoopRemoto[] {
  const seen = new Set<string>();
  const out: DescontoContaCoopRemoto[] = [];
  for (const d of descontos) {
    const key = `${d.createdAt}|${round2(d.valorReais)}|${d.motivo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * Com ficha de agosto e setembro abertas, compras de setembro só abatem setembro —
 * evita cobrar duas vezes a mesma transação nos totais consolidados.
 */
export function filtrarDescontosContaCoopParaMesReferencia(
  descontos: DescontoContaCoopRemoto[],
  mesReferencia: string,
  mesesPendentes?: string[]
): DescontoContaCoopRemoto[] {
  const deduped = dedupeDescontosContaCoopRemotos(descontos);
  if (!mesesPendentes?.length) return deduped;
  const posteriores = mesesPendentes.filter((m) => m > mesReferencia);
  if (!posteriores.length) return deduped;
  return deduped.filter((d) => {
    const txMes = mesReferenciaFromIso(d.createdAt);
    return !(txMes > mesReferencia && posteriores.includes(txMes));
  });
}

export function dedupeDescontosExtrasContaCoop(extras: FichaCorridaDesconto[]): FichaCorridaDesconto[] {
  const seen = new Set<string>();
  return extras.filter((d) => {
    if (d.tipo !== "conta_coop" && !(d.tipo === "credito_avulso" && isEstornoContaCoop(d.motivo))) {
      return true;
    }
    const key = `${d.tipo}|${round2(d.valor)}|${d.motivo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

/** Total líquido usado na HB Créditos no mês (compras − estornos confirmados). */
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
  const descontos = dedupeDescontosContaCoopRemotos(descontosRemotos);
  if (!descontos.length) return resumo;

  const liquidoContaCoop = liquidoUsoContaCoopMes(descontos);
  const coopJaAplicado = round2(
    resumo.descontosExtras.filter((d) => d.tipo === "conta_coop").reduce((s, d) => s + d.valor, 0)
  );
  if (coopJaAplicado > 0 && Math.abs(coopJaAplicado - liquidoContaCoop) < 0.02) {
    return resumo;
  }

  const extrasBase = resumo.descontosExtras.filter((d) => d.tipo !== "conta_coop");
  const extras: FichaCorridaDesconto[] = [...extrasBase];
  for (const item of descontos) {
    const isEstorno = isEstornoContaCoop(item.motivo);
    extras.push({
      tipo: isEstorno ? "credito_avulso" : "conta_coop",
      motivo: item.motivo,
      valor: round2(item.valorReais),
    });
  }

  const totalDescontosSemCoop = round2(
    extrasBase.filter((d) => d.tipo !== "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const totalCreditosSemCoop = round2(
    extrasBase.filter((d) => d.tipo === "credito_avulso").reduce((s, d) => s + d.valor, 0)
  );
  const valorLiquido = round2(
    Math.max(0, resumo.valorEntregas - totalDescontosSemCoop - liquidoContaCoop + totalCreditosSemCoop)
  );

  return {
    ...resumo,
    descontosExtras: extras,
    valorLiquido,
  };
}
