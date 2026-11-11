import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyInitialData } from '../src/mock/data';
import type { AppData, PagamentoCooperadoRegistro } from '../src/types';
import { buildCooperadoHistoricoPagamentos } from '../src/lib/cooperado/cooperadoPagamentosHistorico';
import { CooperadoPagamentosResumo } from '../src/components/cooperado/CooperadoPagamentosResumo';
import type { CooperadoFinanceiroRemoto } from '../src/lib/cooperado/cooperadoFinanceiroRemotoTypes';
import { cooperadoFinanceiroScopedData } from '../src/lib/cooperado/cooperadoFinanceiroScopedData';
import { agregarItensFichaMes } from '../src/services/notaPedidoService';
const payment = (id: string, value: number, overrides = {}) => ({ id, cooperadoId: 'member', cooperativaId: 'coop',
  status: 'confirmado', mesReferencia: '2026-10', valorBruto: value + 5, valorLiquido: value, descontoCooperativa: 5,
  descontosExtras: [], pagoEm: '2026-11-06', createdAt: '2026-11-06', updatedAt: '2026-11-06',
  reciboHtml: 'PRIVATE RECEIPT', assinaturaCooperado: 'PRIVATE SIGNATURE', ...overrides } as PagamentoCooperadoRegistro);
const data = { ...emptyInitialData,
  cooperados: [{ id: 'member', cooperativaId: 'coop', nomeCompleto: 'Synthetic member', status: 'ativo' }],
  pagamentosCooperado: [payment('old', 200, { mesesReferencia: ['2026-08', '2026-09'], pagoEm: '2026-09-21' }),
    payment('latest', 125), payment('latest', 125), payment('foreign', 900, { cooperativaId: 'other' }),
    payment('other-member', 800, { cooperadoId: 'other' }), payment('waiting', 700, { status: 'aguardando_confirmacao' })],
} as AppData;
const before = JSON.stringify(data);
const history = buildCooperadoHistoricoPagamentos(data, 'member', 'coop');
assert.equal(history.pagamentos.length, 2);
assert.equal(history.totalRecebido, 325, 'Multi-month PIX and duplicate IDs must count once');
assert.equal(history.pagamentos[0].id, 'latest');
assert.deepEqual(history.pagamentos[1].meses, ['2026-08', '2026-09']);
assert.doesNotMatch(JSON.stringify(history), /PRIVATE|foreign|other-member|waiting/);
assert.equal(JSON.stringify(data), before, 'Read-only projection');
assert.throws(() => buildCooperadoHistoricoPagamentos({ ...data, pagamentosCooperado: [payment('broken', NaN)] }, 'member', 'coop'));
const finance = { cooperadoId: 'member', cooperativaId: 'coop', fetchedAt: '',
  paridade: { valorLiquido: 0 }, historicoPagamentos: history } as CooperadoFinanceiroRemoto;
const html = renderToStaticMarkup(React.createElement(CooperadoPagamentosResumo, { financeiro: finance }));
assert.match(html, /A receber agora/); assert.match(html, /Último pagamento/);
assert.match(html, /Histórico de pagamentos \(2\)/);
assert.match(html, /Outubro 2026/); assert.match(html, /Agosto 2026/); assert.match(html, /Setembro 2026/);
assert.match(html, /125,00/); assert.match(html, /325,00/);
assert.match(html, /Nenhum valor pendente/);
assert.doesNotMatch(html, /PRIVATE/);
const pending = renderToStaticMarkup(React.createElement(CooperadoPagamentosResumo, { financeiro: { ...finance, paridade: { ...finance.paridade, valorLiquido: 40 } } }));
assert.match(pending, /40,00/); assert.match(pending, /Saldo ainda pendente/); assert.match(pending, /325,00/);
const comItens = renderToStaticMarkup(React.createElement(CooperadoPagamentosResumo, {
  financeiro: {
    ...finance,
    entregasPorMes: [{
      mes: '2026-10', entregas: 1, valorBruto: 100,
      itens: [{ produtoInstituicaoId: 'item', produtoNome: 'Melancia', quantidade: 10.125,
        unidade: 'kg', precoUnitario: 10, valorBruto: 100 },
      { produtoInstituicaoId: 'item-outro-contrato', produtoNome: 'melancia', quantidade: 2.5,
        unidade: 'KG', precoUnitario: 12, valorBruto: 30 }],
    }],
  },
}));
assert.match(comItens, /Total de itens entregues/);
assert.match(comItens, /Melancia/);
assert.match(comItens, /12,625 kg/);
assert.doesNotMatch(comItens, /10,125 kg/);
assert.match(comItens, /Nenhum valor pendente/);
const duasCooperativas = {
  ...data,
  cooperados: [
    { id: 'member', cooperativaId: 'coop', nomeCompleto: 'Cooperado A', status: 'ativo' },
    { id: 'member-b', cooperativaId: 'other', nomeCompleto: 'Cooperado B', status: 'ativo' },
  ],
  fichaCorrida: [
    { id: 'ficha-a', notaPedidoId: 'nota-a', cooperativaId: 'coop', cooperadoId: 'member',
      status: 'pago', mesReferencia: '2026-10',
      itens: [{ produtoNome: 'Banana', quantidade: 12, unidade: 'kg', precoUnitario: 5 }] },
    { id: 'ficha-b', notaPedidoId: 'nota-b', cooperativaId: 'other', cooperadoId: 'member-b',
      status: 'pago', mesReferencia: '2026-10',
      itens: [{ produtoNome: 'Mamão', quantidade: 7, unidade: 'kg', precoUnitario: 5 }] },
  ],
} as AppData;
for (const [cooperadoId, cooperativaId, esperado, outro, quantidade] of [
  ['member', 'coop', 'Banana', 'Mamão', 12],
  ['member-b', 'other', 'Mamão', 'Banana', 7],
] as const) {
  const scoped = cooperadoFinanceiroScopedData(duasCooperativas, cooperadoId, cooperativaId);
  const entregas = agregarItensFichaMes(scoped, cooperadoId, '2026-10', cooperativaId);
  assert.equal(entregas.itens.length, 1);
  assert.equal(entregas.itens[0].quantidade, quantidade);
  const markup = renderToStaticMarkup(React.createElement(CooperadoPagamentosResumo, {
    financeiro: { ...finance, cooperadoId, cooperativaId, entregasPorMes: [{ mes: '2026-10', ...entregas }] },
  }));
  assert.ok(markup.includes(esperado) && markup.includes(`${quantidade} kg`));
  assert.ok(!markup.includes(outro));
}
console.log('PASS: remote history stays separate from receivables; tenant/member boundaries, deduplication and paid-month rendering hold.');
