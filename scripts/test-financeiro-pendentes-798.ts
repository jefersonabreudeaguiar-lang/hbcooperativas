import assert from 'node:assert/strict';
import type { AppData, PagamentoCooperadoRegistro } from '../src/types';
import { emptyInitialData } from '../src/mock/data';
import { agregarItensFichaMes } from '../src/services/notaPedidoService';
import type { HbUtilizacaoResumoLancamento } from '../src/lib/hb-credit/utilizacaoResumo';
import { projetarHbPendentesFinanceiro } from '../src/lib/hb-credit/hbFinanceiroPendentes';
import { escolherItensFichaExibicao, projetarQuitacaoRemotaNasFichas } from '../src/lib/cooperado/cooperadoFichaItensCache';
import type { CooperadoFinanceiroRemoto } from '../src/lib/cooperado/cooperadoFinanceiroRemotoTypes';
const empty = { itens: [], entregas: 0, valorBruto: 0 };
const old = { itens: [{ nome: 'Paid item' }], entregas: 1, valorBruto: 100 };
assert.equal(escolherItensFichaExibicao(empty, old, true, true), empty, 'Paid cached items cannot replace a confirmed empty open list');
assert.equal(escolherItensFichaExibicao(empty, old, false, true), old, 'Historical view can still use its snapshot');
assert.equal(escolherItensFichaExibicao(old, empty, true, true), old, 'A new open delivery stays visible');
assert.equal(escolherItensFichaExibicao(empty, old, true, false), old, 'No-data fallback remains separate from confirmed zero');
const paidData = { ...emptyInitialData, cooperados: [{ id: 'member', cooperativaId: 'coop', nomeCompleto: 'Fixture', status: 'ativo' }],
  fichaCorrida: [{ id: 'paid-ficha', cooperativaId: 'coop', cooperadoId: 'member', notaPedidoId: 'paid-note', mesReferencia: '2026-10', status: 'pago',
    valorBruto: 100, valorLiquido: 100, itens: [{ produtoNome: 'Alface', unidade: 'kg', quantidade: 10, precoUnitario: 10, valorBruto: 100 }] }],
} as AppData;
const realPaidItems = agregarItensFichaMes(paidData, 'member', '2026-10', 'coop');
const realOpenItems = agregarItensFichaMes(paidData, 'member', '2026-10', 'coop', { apenasPendentes: true });
assert.equal(realPaidItems.itens.length, 1);
assert.equal(escolherItensFichaExibicao(realOpenItems, realPaidItems, true, true).itens.length, 0);
assert.equal(escolherItensFichaExibicao(realOpenItems, realPaidItems, false, true).itens.length, 1);
const stale = { ...paidData, fichaCorrida: paidData.fichaCorrida.map(f => ({ ...f, status: 'pendente' as const })) };
const before = JSON.stringify(stale);
const remote = { cooperadoId: 'member', cooperativaId: 'coop', historicoPagamentos: { totalRecebido: 100,
  pagamentos: [{ id: 'confirmed', fichaIds: ['paid-ficha'], notaPedidoIds: ['paid-note'] }] } } as CooperadoFinanceiroRemoto;
const projected = projetarQuitacaoRemotaNasFichas(stale, remote, 'member', 'coop');
assert.equal(agregarItensFichaMes(projected, 'member', '2026-10', 'coop', { apenasPendentes: true }).entregas, 0);
assert.equal(JSON.stringify(stale), before, 'Cloud confirmation only projects; stale local records are not mutated');
assert.equal(projetarQuitacaoRemotaNasFichas(stale, { ...remote, cooperativaId: 'other' }, 'member', 'coop'), stale);
const withNew = { ...stale,
  notasPedido: [{ id: 'new-note', cooperativaId: 'coop', cooperadoId: 'member', status: 'conferida', mesReferencia: '2026-10', valorBruto: 100, valorLiquido: 100, itens: [{ produtoId: 'item', quantidade: 10, precoUnitario: 10 }] } as never],
  fichaCorrida: [...stale.fichaCorrida, { ...stale.fichaCorrida[0], id: 'new-ficha', notaPedidoId: 'new-note' }] };
assert.equal(agregarItensFichaMes(projetarQuitacaoRemotaNasFichas(withNew, remote, 'member', 'coop'), 'member', '2026-10', 'coop', { apenasPendentes: true }).entregas, 1, 'A new delivery after payment is not erased by a month-level reset');
const row = (id: string, overrides = {}) => ({ hbTransactionId: id, cooperadoId: 'member', eventType: 'PAYMENT',
  receiptCode: 'ABC12345', createdAt: '2026-11-05T12:00:00Z', valorHbUtilizadoReais: 100,
  valorImpactoAReceberReais: -100, ...overrides } as HbUtilizacaoResumoLancamento);
const pay = (overrides = {}) => ({ id: 'paid', cooperadoId: 'member', status: 'confirmado', pagoEm: '2026-11-06T12:00:00Z',
  descontosExtras: [{ tipo: 'conta_coop', valor: 100, motivo: 'Market', hbTransactionId: 'settled' }], ...overrides } as PagamentoCooperadoRegistro);
const rows = [row('settled'), row('new'), row('other', { cooperadoId: 'other' })];
const original = JSON.stringify(rows);
assert.deepEqual(projetarHbPendentesFinanceiro(rows, [pay()], ['member']).map(r => r.hbTransactionId), ['new']);
assert.equal(JSON.stringify(rows), original, 'Read projection must not alter the ledger');
assert.equal(projetarHbPendentesFinanceiro([row('settled')], [pay({ status: 'aguardando_confirmacao' })], ['member']).length, 1);
assert.equal(projetarHbPendentesFinanceiro([row('settled')], [pay({ cooperadoId: 'other' })], ['member']).length, 1);
assert.equal(projetarHbPendentesFinanceiro([row('settled', { createdAt: '2026-11-07T12:00:00Z' })], [pay()], ['member']).length, 1, 'An older payment cannot settle a later purchase');
const partial = pay({ descontosExtras: [{ tipo: 'conta_coop', valor: 30, motivo: 'Part', hbTransactionId: 'settled' }] });
assert.equal(projetarHbPendentesFinanceiro([row('settled')], [partial, partial], ['member'])[0].valorImpactoAReceberReais, -70, 'Partial settlement and duplicate payment IDs cannot hide the remainder');
const legacy = pay({ descontosExtras: [{ tipo: 'conta_coop', valor: 100, motivo: 'Market (ABC12345)' }] });
assert.equal(projetarHbPendentesFinanceiro([row('legacy')], [legacy], ['member']).length, 0);
assert.equal(projetarHbPendentesFinanceiro([row('different', { receiptCode: 'DIFFERENT' })], [legacy], ['member']).length, 1);
const refund = row('refund', { eventType: 'REFUND', valorImpactoAReceberReais: 100 });
assert.equal(projetarHbPendentesFinanceiro([refund], [pay()], ['member']).length, 1, 'New refund remains a pending credit');
assert.equal(projetarHbPendentesFinanceiro([refund], [pay({ descontosExtras: [{ tipo: 'credito_avulso', valor: 100, motivo: 'Refund', hbTransactionId: 'refund' }] })], ['member']).length, 0);
console.log('PASS: paid items cannot reappear from cache; HB settled movements leave the open view while new, partial and refund balances remain.');
