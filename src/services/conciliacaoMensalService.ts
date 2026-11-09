import type { AppData } from "@/types";
import { round2, sumBy } from "@/utils/calculations";
import { hrefRelatorio } from "@/utils/relatorioRoutes";
import {
  dedupeFichaCorridaPorNota,
  fichaValidaNoExtrato,
  getTotalAPagarCooperado,
} from "@/services/notaPedidoService";
import { listMesesComLancamentos } from "@/services/relatorioService";
import { dataLancamentoPagamento, resolverDataIsoLancamentoLivroCaixa } from "@/services/livroCaixaService";
import { contadorDadosCooperativa } from '@/lib/staff/contadorDadosCooperativa';
import { getUserCooperativaId } from "@/utils/cooperativa";

export type ConciliacaoStatus = "ok" | "divergencia" | "ausente" | "parcial";

export interface LinhaConciliacao {
  id: string;
  label: string;
  descricao: string;
  valorA: number;
  labelA: string;
  valorB: number;
  labelB: string;
  diferenca: number;
  status: ConciliacaoStatus;
  detalhe?: string;
}

export interface AlertaConciliacao {
  id: string;
  severidade: "info" | "aviso" | "critico";
  titulo: string;
  descricao: string;
  href?: string;
}

export interface ConciliacaoMensalResult {
  mesReferencia: string;
  linhas: LinhaConciliacao[];
  alertas: AlertaConciliacao[];
  resumo: {
    totalLinhas: number;
    conciliadas: number;
    divergencias: number;
    ausentes: number;
    percentualOk: number;
  };
  kpis: {
    totalEntregasConferidas: number;
    totalAPagarCooperados: number;
    totalPagoCooperados: number;
    pagamentosSemAssinatura: number;
    notasSemFicha: number;
    mensalidadesAbertas: number;
    fechamentoStatus: string | null;
  };
}

const TOLERANCIA = 0.02;

function compare(a: number, b: number): ConciliacaoStatus {
  return a === 0 && b === 0 ? 'ausente' : Math.abs(a - b) <= TOLERANCIA ? 'ok' : 'divergencia';
}

/** Saved evidence only: reconciliation never creates or repairs a ledger entry. */
export function calcularConciliacaoMensal(data: AppData, mesReferencia: string, cooperativaId?: string): ConciliacaoMensalResult {
  const coopId = cooperativaId ?? data.cooperativas[0]?.id ?? '';
  const fonte = contadorDadosCooperativa(data, coopId);
  const confirmed = [...new Map(fonte.pagamentosCooperado.filter(p => p.status === 'confirmado').map(p => [p.id, p])).values()];
  const cashPayments = confirmed.filter(p => dataLancamentoPagamento(p).slice(0, 7) === mesReferencia);
  const cash = fonte.livroCaixa.filter(l => resolverDataIsoLancamentoLivroCaixa(l, fonte).slice(0, 7) === mesReferencia);
  const notas = fonte.notasPedido.filter(n => n.mesReferencia === mesReferencia && ['conferida', 'pago'].includes(n.status));
  const fichas = dedupeFichaCorridaPorNota(fonte.fichaCorrida.filter(f => f.mesReferencia === mesReferencia && fichaValidaNoExtrato(fonte, f)), fonte.notasPedido);
  const fichaNotes = new Set(fichas.map(f => f.notaPedidoId));
  const notasSemFicha = notas.filter(n => !fichaNotes.has(n.id)).length;
  const totalAPagar = round2(sumBy(fonte.cooperados, c => getTotalAPagarCooperado(fonte, c.id, mesReferencia, coopId)));
  const totalPago = round2(sumBy(cashPayments, p => p.valorLiquido));
  const totalBruto = round2(sumBy(cashPayments, p => p.valorBruto));
  const extra = (tipo: string) => round2(sumBy(cashPayments, p => sumBy((p.descontosExtras ?? []).filter(d => d.tipo === tipo && !/\(estornada\)/i.test(d.motivo ?? '')), d => d.valor)));
  const outros = (p: typeof cashPayments[number]) => (p.descontosExtras ?? []).filter(d => !['mensalidade', 'credito_avulso', 'cooperativa'].includes(d.tipo) && d.valor > 0 && !/\(estornada\)/i.test(d.motivo ?? ''));
  const sumCash = (origem: string, tipo: string) => round2(sumBy(cash.filter(l => l.origem === origem && l.tipo === tipo), l => l.valor));
  const linhas: LinhaConciliacao[] = [];
  const add = (id: string, label: string, descricao: string, a: number, b: number, labelA: string, labelB: string, broken = 0) => {
    a = round2(a); b = round2(b);
    linhas.push({ id, label, descricao, valorA: a, valorB: b, labelA, labelB, diferenca: round2(a - b),
      status: broken ? 'divergencia' : compare(a, b), detalhe: broken ? `${broken} vínculo(s) de pagamento ausente(s), duplicado(s) ou com valor divergente.` : undefined });
  };
  const links = (expected: (p: typeof cashPayments[number]) => number, matches: (origin: string, id: string) => boolean, tipo: string) => cashPayments.filter(p => {
    const rows = cash.filter(l => l.tipo === tipo && matches(l.origemId ?? '', p.id));
    const amount = expected(p);
    return Math.abs(amount - sumBy(rows, l => l.valor)) > TOLERANCIA || (amount > TOLERANCIA && rows.length === 0) || new Set(rows.map(l => l.origemId)).size !== rows.length;
  }).length;
  add('entregas_ficha', 'Entregas × Ficha', 'Competência das entregas: compara notas conferidas com a ficha registrada, sem alterar valores históricos.',
    sumBy(notas, n => n.valorBruto), sumBy(fichas, f => f.valorBruto), 'Notas conferidas (bruto)', 'Ficha corrida (bruto)');
  add('pagamentos_caixa', 'Pagamentos brutos × Livro Caixa', 'Data efetiva do pagamento: bruto registrado versus débito bruto salvo no caixa. O líquido é mostrado separadamente no painel.',
    totalBruto, sumCash('pagamento_cooperado', 'debito'), 'Bruto dos pagamentos confirmados', 'Débitos brutos no caixa',
    links(p => p.valorBruto, (o, id) => o === `pg_caixa_${id}`, 'debito'));
  add('taxa_cooperativa_caixa', 'Taxa cooperativa × Caixa', 'Retenção dos pagamentos confirmados na data efetiva de pagamento; cada taxa é conferida pelo identificador do pagamento.',
    sumBy(cashPayments, p => p.descontoCooperativa), sumCash('taxa_cooperativa', 'credito'), 'Taxa nos pagamentos', 'Taxa salva no caixa',
    links(p => p.descontoCooperativa, (o, id) => o === `pg_taxa_${id}`, 'credito'));
  add('mensalidade_ficha_caixa', 'Mensalidade retida × Caixa', 'Descontos efetivamente retidos em pagamentos confirmados versus créditos de retenção no caixa, sem somar novamente a ficha.',
    extra('mensalidade'), sumCash('mensalidade_ficha', 'credito'), 'Mensalidade nos pagamentos', 'Retenção salva no caixa',
    links(p => sumBy((p.descontosExtras ?? []).filter(d => d.tipo === 'mensalidade'), d => d.valor), (o, id) => o === `pg_mensficha_${id}` || o.startsWith(`pg_mensficha_${id}_m`), 'credito'));
  add('outros_descontos_caixa', 'Outros descontos × Caixa', 'HB Créditos, cotas e outros débitos retidos nos pagamentos confirmados versus créditos correspondentes salvos no caixa.',
    sumBy(cashPayments, p => sumBy(outros(p), d => d.valor)), sumCash('desconto_ficha', 'credito'), 'Outros descontos nos pagamentos', 'Retenções salvas no caixa',
    links(p => sumBy(outros(p), d => d.valor), (o, id) => o.startsWith(`pg_desc_${id}_`), 'credito'));
  const paidMemberships = fonte.mensalidades.filter(m => m.status === 'paga' && m.dataPagamento?.slice(0, 7) === mesReferencia);
  add('mensalidades_caixa', 'Mensalidades recebidas × Caixa', 'Recebimentos diretos confirmados, pela data de recebimento, versus créditos diretos de mensalidade no caixa.',
    sumBy(paidMemberships, m => m.valor), sumCash('mensalidade', 'credito'), 'Mensalidades recebidas', 'Créditos diretos no caixa');
  linhas.push({ id: 'obrigacao_pagamento', label: 'Saldo pendente da competência', descricao: 'Saldo que ainda falta pagar pelas entregas do período. Pagamentos já concluídos não são subtraídos uma segunda vez.',
    valorA: totalAPagar, valorB: 0, labelA: 'Ainda a pagar', labelB: 'Saldo quitado', diferenca: totalAPagar,
    status: totalAPagar > TOLERANCIA ? 'parcial' : notas.length || cashPayments.length ? 'ok' : 'ausente', detalhe: totalAPagar > TOLERANCIA ? 'Há obrigações ainda abertas; isso não significa divergência no pagamento já registrado.' : undefined });
  const hb = extra('conta_coop');
  linhas.push({ id: 'conta_coop', label: 'HB Créditos retidos', descricao: 'Descontos HB efetivamente retidos nos pagamentos deste mês de caixa. O extrato de compras exige conferência própria no ledger HB.',
    valorA: hb, valorB: hb, labelA: 'Retido nos pagamentos', labelB: 'Referência de retenção', diferenca: 0, status: hb ? 'parcial' : 'ausente',
    detalhe: hb ? 'Informativo: este valor não comprova, sozinho, conciliação com o ledger de compras HB.' : 'Nenhuma retenção HB nos pagamentos deste mês.' });
  const repasse = sumCash('hb_app_repasse', 'debito');
  linhas.push({ id: 'hb_app_repasse_caixa', label: 'Repasses HB registrados', descricao: 'Pagamentos de repasse identificados no Livro Caixa; não substitui confirmação do recebedor na nuvem.',
    valorA: repasse, valorB: repasse, labelA: 'Débito salvo no caixa', labelB: 'Referência de registro', diferenca: 0,
    status: repasse || hb ? 'parcial' : 'ausente', detalhe: 'Conferir a liquidação na área HB Créditos. Esta linha é informativa.' });
  const alertas: AlertaConciliacao[] = [];
  for (const l of linhas.filter(l => l.status === 'divergencia')) alertas.push({ id: `div_${l.id}`, severidade: 'critico', titulo: `Divergência: ${l.label}`,
    descricao: l.detalhe ?? `Diferença de R$ ${Math.abs(l.diferenca).toFixed(2)} entre ${l.labelA} e ${l.labelB}.`, href: hrefRelatorio('conciliacao_mensal', { mes: mesReferencia }) });
  if (notasSemFicha) alertas.push({ id: 'notas_sem_ficha', severidade: 'critico', titulo: 'Notas conferidas sem ficha', descricao: `${notasSemFicha} entrega(s) conferida(s) sem ficha registrada.` });
  const pending = fonte.pagamentosCooperado.filter(p => p.status === 'aguardando_confirmacao' && dataLancamentoPagamento(p).slice(0, 7) === mesReferencia);
  if (pending.length) alertas.push({ id: 'pagamentos_aguardando', severidade: 'aviso', titulo: 'Pagamentos aguardando confirmação', descricao: `${pending.length} pagamento(s) ainda não entram nos totais confirmados.` });
  const fechamento = fonte.fechamentos.find(f => f.mesReferencia === mesReferencia);
  if (fechamento?.status === 'aprovado' && linhas.some(l => l.status === 'divergencia')) alertas.push({ id: 'fechamento_com_divergencia', severidade: 'critico', titulo: 'Fechamento aprovado com divergência', descricao: 'O fechamento aprovado não elimina diferenças encontradas nos registros.' });
  const mensalidadesAbertas = fonte.mensalidades.filter(m => m.mesReferencia === mesReferencia && !['paga', 'aguardando_confirmacao'].includes(m.status)).length;
  const conciliadas = linhas.filter(l => l.status === 'ok').length;
  const verificaveis = linhas.filter(l => l.status !== 'ausente').length;
  return { mesReferencia, linhas, alertas, resumo: { totalLinhas: linhas.length, conciliadas, divergencias: linhas.filter(l => l.status === 'divergencia').length,
    ausentes: linhas.filter(l => l.status === 'ausente').length, percentualOk: verificaveis ? Math.round(conciliadas / verificaveis * 100) : 0 },
    kpis: { totalEntregasConferidas: notas.length, totalAPagarCooperados: totalAPagar, totalPagoCooperados: totalPago,
      pagamentosSemAssinatura: pending.length, notasSemFicha, mensalidadesAbertas, fechamentoStatus: fechamento?.status ?? null } };
}

export function listMesesConciliacao(data: AppData, cooperativaId?: string): string[] {
  const fonte = contadorDadosCooperativa(data, cooperativaId ?? data.cooperativas[0]?.id ?? '');
  const meses = new Set(listMesesComLancamentos(fonte));
  for (const p of fonte.pagamentosCooperado) meses.add(dataLancamentoPagamento(p).slice(0, 7));
  for (const l of fonte.livroCaixa) meses.add(resolverDataIsoLancamentoLivroCaixa(l, fonte).slice(0, 7));
  return [...meses].filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
}

/** Cash-date statement: a multi-month receipt appears once, in the month it was paid. */
export function getDemonstrativoPagamentosMes(data: AppData, mesReferencia: string, cooperativaId?: string) {
  const fonte = contadorDadosCooperativa(data, cooperativaId ?? data.cooperativas[0]?.id ?? '');
  return [...new Map(fonte.pagamentosCooperado.filter(p => dataLancamentoPagamento(p).slice(0, 7) === mesReferencia).map(p => [p.id, p])).values()]
    .sort((a, b) => new Date(b.pagoEm).getTime() - new Date(a.pagoEm).getTime()).map(p => ({
      id: p.id, cooperadoNome: fonte.cooperados.find(c => c.id === p.cooperadoId)?.nomeCompleto ?? 'Cooperado',
      valorBruto: p.valorBruto, descontoCooperativa: p.descontoCooperativa, descontosExtras: p.descontosExtras, valorLiquido: p.valorLiquido,
      status: p.status, pagoPor: p.pagoPor, pagoEm: p.pagoEm, assinado: Boolean(p.assinaturaCooperado), assinadoEm: p.assinadoEm, qtdEntregas: (p.notaPedidoIds ?? []).length,
    }));
}
export { getUserCooperativaId };
