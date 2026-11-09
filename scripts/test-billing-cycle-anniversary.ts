import assert from 'node:assert/strict';
import { getPeriodoCobrancaSaas, getPeriodoCobrancaSaasAberto, defaultCobrancaSaas, periodoCobrancaSaasEstaPago, totalCobrancaSaasEmAberto, ensureCobrancaPeriodoAtualSaas, getPainelCobrancaSaasResponsavel, responsavelInformouPagamentoSaas, confirmarPagamentoCobrancaSaas } from '../src/services/cobrancaSaasService';
import { emptyInitialData } from '../src/mock/data';
import type { AppData, CobrancaSaasLancamento, Cooperativa, Cooperado } from '../src/types';

const day = (s: string) => new Date(`${s}T15:00:00Z`);
for (const [anchor, ref, start, due] of [
  ['2026-01-31','2026-02-28','2026-02-28','2026-03-31'],
  ['2028-01-31','2028-02-29','2028-02-29','2028-03-31'],
  ['2026-01-31','2026-03-30','2026-02-28','2026-03-31'],
  ['2026-06-20','2026-11-09','2026-10-20','2026-11-20'],
]) {
  const p = getPeriodoCobrancaSaas(anchor, day(ref));
  assert.equal(p.periodoId, start); assert.equal(p.vencimento, due);
}
assert.equal(getPeriodoCobrancaSaas('2026-01-10T00:00:00Z', day('2026-11-09')).periodoId, '2026-11-09');
const issued = (periodoId: string, status: CobrancaSaasLancamento['status'], valorTotal = 387.4): CobrancaSaasLancamento => ({ id: periodoId, periodoId, mesReferencia: periodoId.slice(0,7), status, valorTotal, qtdCooperados: 26, valorUnitario: 14.9, valorMinimo: 290, criadaEm: `${periodoId}T15:00:00Z` });
const overdue = defaultCobrancaSaas({ cicloInicioEm: '2026-01-20', historico: [issued('2026-08-20', 'enviada'), issued('2026-09-20', 'paga'), issued('2026-10-20','aguardando_confirmacao')], ultimoPeriodoPago: '2026-09-20' });
assert.equal(getPeriodoCobrancaSaasAberto(overdue, day('2026-11-09')).periodoId, '2026-08-20');
assert.equal(totalCobrancaSaasEmAberto(overdue), 774.8);
assert.equal(periodoCobrancaSaasEstaPago(defaultCobrancaSaas({ historico: [issued('2026-10-10','paga')] }), '2026-10-20','2026-10'), false);
const endMonth = defaultCobrancaSaas({ cicloInicioEm: '2026-01-31', historico: [issued('2026-02-28','enviada')] });
assert.equal(getPeriodoCobrancaSaasAberto(endMonth, day('2026-04-01')).vencimento,'2026-03-31');
const legacy = defaultCobrancaSaas({ cicloInicioEm: '2026-01-31', historico: [issued('2026-06-15','paga')] });
assert.equal(getPeriodoCobrancaSaasAberto(legacy, day('2026-11-09')).periodoId,'2026-10-15');

const current = getPeriodoCobrancaSaas('2026-01-20');
const data = { ...emptyInitialData,
  config: { ...emptyInitialData.config, cobrancaSaasPrecoCooperado: 99, cobrancaSaasMinimoMes: 999 },
  cooperativas: [{ id:'fixture', cnpj:'88888888000181', nome:'Fixture', cobrancaSaas: defaultCobrancaSaas({ cicloInicioEm:'2026-01-20', historico:[issued(current.periodoId,'enviada')] }) } as Cooperativa],
  cooperados: [{ id:'member', cooperativaId:'fixture', nomeCompleto:'Fixture', status:'ativo', createdAt:'2026-01-20T15:00:00Z' } as Cooperado],
} as AppData;
const ensured = ensureCobrancaPeriodoAtualSaas(data,'fixture').data;
const panel = getPainelCobrancaSaasResponsavel(ensured,'fixture')!;
assert.equal(panel.valorTotal,387.4); // issued price is immutable despite changed rates/member count
const informed = responsavelInformouPagamentoSaas(ensured,'fixture','Fixture');
assert.equal(informed.ok,true);
assert.equal(totalCobrancaSaasEmAberto(informed.data.cooperativas[0].cobrancaSaas!),387.4);
assert.equal(getPainelCobrancaSaasResponsavel(informed.data,'fixture')!.statusMes,'aguardando_confirmacao');
const paid = confirmarPagamentoCobrancaSaas(informed.data,'fixture','Admin');
assert.equal(paid.ok,true);
assert.equal(totalCobrancaSaasEmAberto(paid.data.cooperativas[0].cobrancaSaas!),0);
assert.equal(getPainelCobrancaSaasResponsavel(paid.data,'fixture')!.statusMes,'em_dia');
assert.equal(data.cooperativas[0].cobrancaSaas!.historico[0].status,'enviada');
console.log('ok: anniversary, month-end, business timezone, old debt, frozen amounts, informed versus confirmed payment');
