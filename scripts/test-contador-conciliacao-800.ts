import assert from 'node:assert/strict';
import { emptyInitialData } from '../src/mock/data';
import type { AppData, PagamentoCooperadoRegistro } from '../src/types';
import { calcularConciliacaoMensal, getDemonstrativoPagamentosMes, listMesesConciliacao } from '../src/services/conciliacaoMensalService';
import { contadorDadosCooperativa, aplicarSnapshotContadorCloud, contadorPodeConsultarCentral } from '../src/lib/staff/contadorDadosCooperativa';
import { criarContadorRevisionWatch } from '../src/lib/staff/contadorRevisionWatch';
import { resolveAppDataStorageKey } from '../src/lib/staff/appDataPersistIo';

async function main() {
  assert.equal(contadorPodeConsultarCentral({ role: 'contador' }, '/contador/dashboard'), true);
  assert.equal(contadorPodeConsultarCentral({ role: 'cooperado' }, '/contador/dashboard'), false);
  assert.equal(contadorPodeConsultarCentral({ role: 'contador', active: false }, '/contador/dashboard'), false);
  for (const path of ['/ficha-corrida', '/notas-pedido', '/contratos', '/contador-falso']) assert.equal(contadorPodeConsultarCentral({ role: 'contador' }, path), false);
  const p = { id: 'p1', cooperativaId: 'a', cooperadoId: 'm1', mesReferencia: '2026-10', mesesReferencia: ['2026-09', '2026-10'],
    status: 'confirmado', valorBruto: 100, descontoCooperativa: 5, valorLiquido: 60, pagoEm: '2026-11-06T10:00:00Z',
    fichaIds: [], notaPedidoIds: [], descontosExtras: [{ tipo: 'mensalidade', valor: 10 }, { tipo: 'conta_coop', valor: 15 }, { tipo: 'cota', valor: 5 }, { tipo: 'manual', valor: 5 }] } as unknown as PagamentoCooperadoRegistro;
  const entry = (id: string, origem: string, valor: number, tipo = 'credito') => ({ id, cooperativaId: 'a', origem, origemId: id,
    data: '2026-11-06', mesReferencia: '2026-10', valor, tipo });
  const data = { ...structuredClone(emptyInitialData), cooperativas: [{ id: 'a' }, { id: 'b' }],
    cooperados: [{ id: 'm1', cooperativaId: 'a', status: 'ativo' }, { id: 'm2', cooperativaId: 'b' }],
    pagamentosCooperado: [p, { ...p, id: 'foreign', cooperativaId: 'b', cooperadoId: 'm2', valorBruto: 9999, valorLiquido: 9999 }, { ...p, id: 'pending', status: 'aguardando_confirmacao' }],
    livroCaixa: [entry('pg_caixa_p1', 'pagamento_cooperado', 100, 'debito'), entry('pg_taxa_p1', 'taxa_cooperativa', 5), entry('pg_mensficha_p1', 'mensalidade_ficha', 10),
      entry('pg_desc_p1_0_conta_coop', 'desconto_ficha', 15), entry('pg_desc_p1_1_cota', 'desconto_ficha', 5), entry('pg_desc_p1_2_manual', 'desconto_ficha', 5),
      { ...entry('pg_caixa_foreign', 'pagamento_cooperado', 9999, 'debito'), cooperativaId: 'b' }],
    mensalidades: [{ id: 'foreign-m', cooperadoId: 'm2', mesReferencia: '2026-12', status: 'paga', valor: 9999 }],
  } as unknown as AppData;
  const original = JSON.stringify(data);
  const result = calcularConciliacaoMensal(data, '2026-11', 'a');
  for (const id of ['pagamentos_caixa', 'taxa_cooperativa_caixa', 'mensalidade_ficha_caixa', 'outros_descontos_caixa']) assert.equal(result.linhas.find(l => l.id === id)?.status, 'ok', id);
  assert.equal(result.kpis.totalPagoCooperados, 60, 'liquid amount is not compared with gross ledger debit');
  assert.equal(result.linhas.find(l => l.id === 'pagamentos_caixa')?.valorA, 100);
  assert.equal(calcularConciliacaoMensal(data, '2026-10', 'a').kpis.totalPagoCooperados, 0, 'cash receipt is not repeated in delivery competence');
  assert.equal(getDemonstrativoPagamentosMes(data, '2026-11', 'a').filter(p => p.status === 'confirmado').length, 1);
  assert.equal(getDemonstrativoPagamentosMes(data, '2026-10', 'a').length, 0);
  assert.ok(!listMesesConciliacao(data, 'a').includes('2026-12'), 'other tenant month is excluded');
  const missing = { ...data, livroCaixa: [] };
  assert.equal(calcularConciliacaoMensal(missing, '2026-11', 'a').linhas.find(l => l.id === 'pagamentos_caixa')?.status, 'divergencia');
  assert.equal(missing.livroCaixa.length, 0, 'read does not manufacture missing ledger records');
  assert.equal(aplicarSnapshotContadorCloud(data, { updatedAt: '2026-11-06', livroCaixa: [] }, 'a').livroCaixa.length, 0, 'saved empty ledger outranks a synthesized UI cache');
  const duplicated = { ...data, livroCaixa: [...data.livroCaixa.filter(l => l.origemId !== 'pg_caixa_p1'), { ...data.livroCaixa[0], valor: 50 }, { ...data.livroCaixa[0], id: 'duplicate', valor: 50 }] };
  assert.equal(calcularConciliacaoMensal(duplicated, '2026-11', 'a').linhas.find(l => l.id === 'pagamentos_caixa')?.status, 'divergencia', 'equal total does not conceal duplicate origin');
  const repeatedReceipt = { ...data, pagamentosCooperado: [...data.pagamentosCooperado, p] };
  assert.equal(calcularConciliacaoMensal(repeatedReceipt, '2026-11', 'a').kpis.totalPagoCooperados, 60);
  assert.equal(result.linhas.find(l => l.id === 'conta_coop')?.status, 'parcial', 'HB ledger not falsely certified by an equal value copy');
  assert.equal(JSON.stringify(data), original);
  assert.ok(contadorDadosCooperativa(data, 'a').pagamentosCooperado.every(p => p.cooperativaId === 'a'));
  const storage = { getItem: () => null } as never;
  const key = resolveAppDataStorageKey({ role: 'contador', cnpj: '88888888000181', storage });
  assert.ok(key.includes('88888888000181') && key.endsWith(':contador'));
  assert.notEqual(key, resolveAppDataStorageKey({ role: 'responsavel', cnpj: '88888888000181', storage }));
  let revision: string | null = 'one', changes = 0, failures = 0;
  const watch = criarContadorRevisionWatch({ applied: 'one', read: async () => revision, changed: () => changes++, failed: () => failures++ });
  await watch.check(); assert.equal(changes, 0);
  revision = 'two'; await watch.check(); assert.equal(changes, 1);
  revision = null; await watch.check(); assert.equal(failures, 1);
  watch.stop(); await watch.check(); assert.equal(failures, 1);
  console.log('PASS: saved ledger evidence, gross/net, cash date, multi-month/duplicate receipts, tenant isolation, missing/duplicate ledger origins, no mutation, private counter cache and revision refresh.');
}
void main();
