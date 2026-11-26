import type { Cooperado, Instituicao, NotaPedido } from "@/types";

type EntregaAnual = Pick<NotaPedido, "id" | "numeroNota" | "dataEntrega" | "mesReferencia" | "localEntrega" |
  "status" | "valorBruto" | "valorDesconto" | "valorLiquido" | "itens"> & { contrato: string };

export interface ExtratoAnualCooperado {
  cooperadoId: string;
  nome: string;
  ano: number;
  ate: string;
  entregas: EntregaAnual[];
}

export function montarExtratosAnuais(
  cooperados: readonly Cooperado[],
  notas: readonly NotaPedido[],
  instituicoes: readonly Pick<Instituicao, "id" | "nome">[],
  ano: number,
  ate: string,
): ExtratoAnualCooperado[] {
  const porCooperado = new Map(cooperados.map(c => [c.id, {
    cooperadoId: c.id, nome: c.nomeCompleto, ano, ate, entregas: [] as EntregaAnual[],
  }]));
  const contratos = new Map(instituicoes.map(i => [i.id, i.nome]));
  for (const nota of new Map(notas.map(n => [n.id, n])).values()) {
    const extrato = porCooperado.get(nota.cooperadoId);
    if (!extrato || nota.status === "rascunho" || nota.status === "cancelado") continue;
    const data = nota.dataEntrega || nota.mesReferencia;
    if (!data?.startsWith(`${ano}-`) || data > ate) continue;
    const { id, numeroNota, dataEntrega, mesReferencia, localEntrega, status,
      valorBruto, valorDesconto, valorLiquido, itens } = nota;
    extrato.entregas.push({ id, numeroNota, dataEntrega, mesReferencia, localEntrega, status,
      valorBruto, valorDesconto, valorLiquido, itens, contrato: contratos.get(nota.instituicaoId) ?? "" });
  }
  return [...porCooperado.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(e => ({
    ...e, entregas: e.entregas.sort((a, b) =>
      (a.dataEntrega || a.mesReferencia).localeCompare(b.dataEntrega || b.mesReferencia) || a.numeroNota.localeCompare(b.numeroNota)),
  }));
}

export function resumoExtratoAnual(extrato: ExtratoAnualCooperado) {
  const itens = new Map<string, { nome: string; unidade: string; quantidade: number; centavos: number }>();
  let bruto = 0;
  let descontos = 0;
  let liquido = 0;
  for (const entrega of extrato.entregas) {
    if (entrega.status !== "conferida" && entrega.status !== "pago" && entrega.status !== "entregue") continue;
    bruto += Math.round(entrega.valorBruto * 100);
    descontos += Math.round(entrega.valorDesconto * 100);
    liquido += Math.round(entrega.valorLiquido * 100);
    for (const item of entrega.itens ?? []) {
      const chave = JSON.stringify([item.produtoNome.trim().toLocaleLowerCase("pt-BR"), item.unidade]);
      const total = itens.get(chave) ?? { nome: item.produtoNome, unidade: item.unidade, quantidade: 0, centavos: 0 };
      total.quantidade += item.quantidade;
      total.centavos += Math.round(item.valorBruto * 100);
      itens.set(chave, total);
    }
  }
  return { bruto: bruto / 100, descontos: descontos / 100, liquido: liquido / 100,
    itens: [...itens.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
}
