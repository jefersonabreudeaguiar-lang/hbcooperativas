/** A paid cycle closes without deleting history or absorbing later deliveries. No cloud access. */
import assert from 'node:assert/strict';
import { emptyInitialData } from '../src/mock/data';
import type { AppData } from '../src/types';
import { registrarPagamentoCooperado, getTotalAPagarCooperado } from '../src/services/notaPedidoService';
import { listarMesesComPagamentoRegistradoCooperado, somarTotalRecebidoConfirmadoCooperado, getValorQuantoVouReceberMotorLegado } from '../src/services/cooperadoEntregasService';
const coop = 'cycle-fixture-coop', member = 'cycle-fixture-member';
let clock = Date.now();
const realNow = Date.now;
Date.now = () => ++clock;
function addDelivery(data: AppData, id: string, month: string, amount: number): AppData {
  const createdAt = new Date().toISOString();
  return { ...data,
    notasPedido: [...data.notasPedido, { id: `n-${id}`, cooperadoId: member, cooperativaId: coop, mesReferencia: month,
      status: 'conferida', valorBruto: amount, valorLiquido: amount, instituicaoId: 'fixture-school',
      itens: [{ produtoId: 'fixture-item', quantidade: 1, precoUnitario: amount }], createdAt, updatedAt: createdAt } as never],
    fichaCorrida: [...data.fichaCorrida, { id, notaPedidoId: `n-${id}`, cooperadoId: member, cooperativaId: coop,
      mesReferencia: month, status: 'pendente', descricao: 'Synthetic delivery', valorBruto: amount,
      descontos: 0, valorLiquido: amount, saldoAcumulado: amount, createdAt, updatedAt: createdAt } as never] };
}
function assertOpen(data: AppData, amount: number) {
  assert.equal(getTotalAPagarCooperado(data, member, undefined, coop), amount, 'Responsible open balance');
  assert.equal(getValorQuantoVouReceberMotorLegado(data, member, coop).valor, amount, 'Cooperado receivable');
}
try {
  let data = { ...structuredClone(emptyInitialData), config: { descontoPadraoCooperativa: 0 },
    cooperativas: [{ id: coop, nome: 'Synthetic coop', cnpj: '99999999999993' }],
    cooperados: [{ id: member, cooperativaId: coop, nomeCompleto: 'Synthetic member', cpfCnpj: 'fixture', status: 'ativo' }],
  } as AppData;
  data = addDelivery(addDelivery(data, 'august', '2026-08', 100), 'september', '2026-09', 200);
  assertOpen(data, 300);
  data = registrarPagamentoCooperado(data, member, '2026-08', 'Synthetic staff', undefined, { mesesReferencia: ['2026-08', '2026-09'] });
  assertOpen(data, 0);
  assert.deepEqual(listarMesesComPagamentoRegistradoCooperado(data, member, coop), ['2026-09', '2026-08']);
  assert.equal(somarTotalRecebidoConfirmadoCooperado(data, member, coop), 300, 'Multi-month payment is counted once');
  const firstPayment = structuredClone(data.pagamentosCooperado[0]);
  assert.ok(firstPayment.reciboHtml);
  const firstBook = structuredClone(data.livroCaixa ?? []);
  data = addDelivery(data, 'september-later', '2026-09', 40);
  assertOpen(data, 40);
  assert.equal(data.pagamentosCooperado[0].reciboHtml, firstPayment.reciboHtml);
  data = registrarPagamentoCooperado(data, member, '2026-09', 'Synthetic staff');
  assertOpen(data, 0);
  assert.equal(data.pagamentosCooperado.length, 2, 'New delivery in the same month creates a distinct payment');
  assert.equal(somarTotalRecebidoConfirmadoCooperado(data, member, coop), 340);
  assert.deepEqual(data.pagamentosCooperado[0], firstPayment, 'Previous receipt/payment stays immutable');
  assert.ok(firstBook.length > 0);
  data = addDelivery(data, 'october', '2026-10', 70);
  assertOpen(data, 70);
  data = registrarPagamentoCooperado(data, member, '2026-10', 'Synthetic staff');
  assertOpen(data, 0);
  const reopened = JSON.parse(JSON.stringify(data)) as AppData;
  assertOpen(reopened, 0);
  assert.deepEqual(listarMesesComPagamentoRegistradoCooperado(reopened, member, coop), ['2026-10', '2026-09', '2026-08']);
  assert.equal(somarTotalRecebidoConfirmadoCooperado(reopened, member, coop), 410);
  assert.equal(reopened.pagamentosCooperado.length, 3);
  for (const p of reopened.pagamentosCooperado) {
    assert.equal(p.status, 'confirmado'); assert.ok(p.reciboHtml);
    assert.equal(reopened.livroCaixa?.filter(l => l.origemId === `pg_caixa_${p.id}` && l.tipo === 'debito').length, 1);
  }
  assert.deepEqual(reopened.pagamentosCooperado[0], JSON.parse(JSON.stringify(firstPayment)), 'Persisted receipt/payment survives JSON roundtrip');
  for (const original of firstBook) assert.deepEqual(reopened.livroCaixa?.find(l => l.id === original.id), JSON.parse(JSON.stringify(original)), 'Earlier cashbook entry is preserved');
  console.log('PASS: paid cycle becomes zero; same-month/new-month deliveries restart it; monthly history, receipts and cashbook survive reopening.');
} finally { Date.now = realNow; }
