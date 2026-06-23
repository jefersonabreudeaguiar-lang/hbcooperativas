import type { AppData, CronogramaContratoMensal, Instituicao, NotaPedido } from "@/types";
import { getCooperadoNome, round2, sumBy } from "@/utils/calculations";
import { getCronogramaMes } from "@/services/cronogramaContratoService";

export type StatusAtingimentoItem = "atingido" | "parcial" | "critico" | "nao_entregue";

export interface LinhaAtingimentoCronograma {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  quantidadePrevista: number;
  quantidadeEntregue: number;
  quantidadeFaltante: number;
  valorPrevisto: number;
  valorEntregue: number;
  valorFaltante: number;
  percentualQuantidade: number;
  percentualValor: number;
  status: StatusAtingimentoItem;
}

export interface LinhaCooperadoAtingimento {
  cooperadoId: string;
  cooperadoNome: string;
  entregas: number;
  valorEntregue: number;
  percentualDoContrato: number;
}

export interface RelatorioAtingimentoCronograma {
  mesReferencia: string;
  instituicao: Instituicao | undefined;
  instituicaoNome: string;
  cronograma?: CronogramaContratoMensal;
  anotacaoMes?: string;
  valorLimiteContrato: number;
  valorEntregueTotal: number;
  valorFaltante: number;
  percentualAtingimentoValor: number;
  quantidadeEntregas: number;
  itens: LinhaAtingimentoCronograma[];
  itensCriticos: LinhaAtingimentoCronograma[];
  porCooperado: LinhaCooperadoAtingimento[];
}

function notasEntreguesInstituicaoMes(
  data: AppData,
  instituicaoId: string,
  mesReferencia: string,
  cooperativaId?: string
): NotaPedido[] {
  return data.notasPedido.filter(
    (n) =>
      n.instituicaoId === instituicaoId &&
      n.mesReferencia === mesReferencia &&
      (n.status === "conferida" || n.status === "pago") &&
      (!cooperativaId || n.cooperativaId === cooperativaId)
  );
}

function agregarEntreguePorProduto(
  notas: NotaPedido[]
): Map<string, { qty: number; valor: number; nome: string; unidade: string }> {
  const map = new Map<string, { qty: number; valor: number; nome: string; unidade: string }>();
  for (const nota of notas) {
    for (const item of nota.itens ?? []) {
      if (item.quantidade <= 0) continue;
      const key = item.produtoInstituicaoId || item.produtoNome;
      const cur = map.get(key) ?? {
        qty: 0,
        valor: 0,
        nome: item.produtoNome,
        unidade: item.unidade,
      };
      cur.qty = round2(cur.qty + item.quantidade);
      cur.valor = round2(cur.valor + item.valorBruto);
      map.set(key, cur);
    }
  }
  return map;
}

function classificarAtingimento(percentual: number): StatusAtingimentoItem {
  if (percentual >= 100) return "atingido";
  if (percentual >= 70) return "parcial";
  if (percentual > 0) return "critico";
  return "nao_entregue";
}

export function getRelatorioAtingimentoCronograma(
  data: AppData,
  instituicaoId: string,
  mesReferencia: string,
  cooperativaId?: string
): RelatorioAtingimentoCronograma {
  const instituicao = data.instituicoes.find((i) => i.id === instituicaoId);
  const cronograma = getCronogramaMes(data, instituicaoId, mesReferencia, cooperativaId);
  const notas = notasEntreguesInstituicaoMes(data, instituicaoId, mesReferencia, cooperativaId);
  const entregueMap = agregarEntreguePorProduto(notas);

  const valorLimiteContrato = cronograma?.valorLimiteEntrega ?? 0;
  const valorEntregueTotal = round2(sumBy(notas, (n) => n.valorBruto));
  const valorFaltante = round2(Math.max(0, valorLimiteContrato - valorEntregueTotal));
  const percentualAtingimentoValor =
    valorLimiteContrato > 0 ? round2(Math.min(100, (valorEntregueTotal / valorLimiteContrato) * 100)) : 0;

  const itens: LinhaAtingimentoCronograma[] = (cronograma?.itens ?? []).map((prev) => {
    const ent = entregueMap.get(prev.produtoInstituicaoId) ?? entregueMap.get(prev.produtoNome);
    const quantidadeEntregue = ent?.qty ?? 0;
    const valorEntregue = ent?.valor ?? 0;
    const quantidadeFaltante = round2(Math.max(0, prev.quantidadePrevista - quantidadeEntregue));
    const valorFaltante = round2(Math.max(0, prev.valorPrevisto - valorEntregue));
    const percentualQuantidade =
      prev.quantidadePrevista > 0
        ? round2(Math.min(100, (quantidadeEntregue / prev.quantidadePrevista) * 100))
        : 0;
    const percentualValor =
      prev.valorPrevisto > 0 ? round2(Math.min(100, (valorEntregue / prev.valorPrevisto) * 100)) : 0;
    return {
      produtoInstituicaoId: prev.produtoInstituicaoId,
      produtoNome: prev.produtoNome,
      unidade: prev.unidade,
      quantidadePrevista: prev.quantidadePrevista,
      quantidadeEntregue,
      quantidadeFaltante,
      valorPrevisto: prev.valorPrevisto,
      valorEntregue,
      valorFaltante,
      percentualQuantidade,
      percentualValor,
      status: classificarAtingimento(percentualValor),
    };
  });

  const itensCriticos = itens
    .filter((i) => i.status === "critico" || i.status === "nao_entregue")
    .sort((a, b) => a.percentualValor - b.percentualValor);

  const coopMap = new Map<string, LinhaCooperadoAtingimento>();
  for (const nota of notas) {
    const cur = coopMap.get(nota.cooperadoId) ?? {
      cooperadoId: nota.cooperadoId,
      cooperadoNome: getCooperadoNome(data.cooperados, nota.cooperadoId),
      entregas: 0,
      valorEntregue: 0,
      percentualDoContrato: 0,
    };
    cur.entregas += 1;
    cur.valorEntregue = round2(cur.valorEntregue + nota.valorBruto);
    coopMap.set(nota.cooperadoId, cur);
  }

  const porCooperado = [...coopMap.values()]
    .map((c) => ({
      ...c,
      percentualDoContrato:
        valorLimiteContrato > 0 ? round2((c.valorEntregue / valorLimiteContrato) * 100) : 0,
    }))
    .sort((a, b) => b.valorEntregue - a.valorEntregue);

  return {
    mesReferencia,
    instituicao,
    instituicaoNome: instituicao?.nome ?? "Instituição",
    cronograma,
    anotacaoMes: cronograma?.anotacaoMes,
    valorLimiteContrato,
    valorEntregueTotal,
    valorFaltante,
    percentualAtingimentoValor,
    quantidadeEntregas: notas.length,
    itens,
    itensCriticos,
    porCooperado,
  };
}
