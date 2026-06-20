import type { AppData, Cooperado, Entrega, Mensalidade, Cota } from "@/types";

export interface DescontoCalculo {
  valorBruto: number;
  descontoCooperativa: number;
  descontoMensalidade: number;
  descontoCota: number;
  descontoManual: number;
  totalDescontos: number;
  valorLiquido: number;
}

export function calcularEntrega(
  quantidade: number,
  valorUnitario: number,
  percentualDescontoCooperativa: number,
  descontosAdicionais = 0
): Pick<Entrega, "valorBruto" | "valorDescontoCooperativa" | "descontosAdicionais" | "valorLiquido"> {
  const valorBruto = quantidade * valorUnitario;
  const valorDescontoCooperativa = valorBruto * (percentualDescontoCooperativa / 100);
  const valorLiquido = valorBruto - valorDescontoCooperativa - descontosAdicionais;

  return {
    valorBruto: round2(valorBruto),
    valorDescontoCooperativa: round2(valorDescontoCooperativa),
    descontosAdicionais: round2(descontosAdicionais),
    valorLiquido: round2(Math.max(0, valorLiquido)),
  };
}

export function calcularDescontosAutomaticos(
  cooperadoId: string,
  valorBruto: number,
  data: AppData,
  percentualPadrao: number,
  incluirMensalidade = true,
  incluirCota = true
): DescontoCalculo {
  const descontoCooperativa = valorBruto * (percentualPadrao / 100);

  let descontoMensalidade = 0;
  if (incluirMensalidade) {
    const mensalidadesAbertas = data.mensalidades.filter(
      (m) => m.cooperadoId === cooperadoId && (m.status === "pendente" || m.status === "atrasada")
    );
    descontoMensalidade = mensalidadesAbertas.reduce((sum, m) => sum + m.valor, 0);
  }

  let descontoCota = 0;
  if (incluirCota) {
    const cotasAbertas = data.cotas.filter(
      (c) => c.cooperadoId === cooperadoId && (c.status === "em_aberto" || c.status === "atrasada" || c.status === "parcelada")
    );
    descontoCota = cotasAbertas.reduce((sum, c) => sum + c.valorParcela, 0);
  }

  const totalDescontos = descontoCooperativa + descontoMensalidade + descontoCota;
  const valorLiquido = Math.max(0, valorBruto - totalDescontos);

  return {
    valorBruto: round2(valorBruto),
    descontoCooperativa: round2(descontoCooperativa),
    descontoMensalidade: round2(descontoMensalidade),
    descontoCota: round2(descontoCota),
    descontoManual: 0,
    totalDescontos: round2(totalDescontos),
    valorLiquido: round2(valorLiquido),
  };
}

export function calcularStatusFinanceiroCooperado(
  mensalidades: Mensalidade[],
  cotas: Cota[]
): "em_dia" | "pendente" | "com_debito" {
  const temAtrasada = mensalidades.some((m) => m.status === "atrasada");
  const temCotaAtrasada = cotas.some((c) => c.status === "atrasada");

  if (temAtrasada || temCotaAtrasada) return "com_debito";

  const temPendente = mensalidades.some((m) => m.status === "pendente" || m.status === "parcelada");
  const temCotaPendente = cotas.some((c) => c.status === "em_aberto" || c.status === "parcelada");

  if (temPendente || temCotaPendente) return "pendente";

  return "em_dia";
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumBy<T>(items: T[], getter: (item: T) => number): number {
  return round2(items.reduce((sum, item) => sum + getter(item), 0));
}

export function getCooperadoNome(
  cooperados: Cooperado[],
  id: string,
  fallbackNome?: string
): string {
  const found = cooperados.find((c) => c.id === id);
  if (found?.nomeCompleto?.trim()) return found.nomeCompleto;
  if (fallbackNome?.trim()) return fallbackNome.trim();
  return "Desconhecido";
}
