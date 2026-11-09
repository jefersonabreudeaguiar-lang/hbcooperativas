import assert from 'node:assert/strict';
import { emptyInitialData } from '../src/mock/data';
import type { AppData, NotaPedido } from '../src/types';
import { reconciliarEntradaStaffCloud } from '../src/lib/staff/staffEntradaCloudReconcile';
import { confirmarStaffGestaoLastGoodCloud, noteStaffGestaoLastGood, peekStaffGestaoLastGood, preservarStaffGestaoContraWipe, resetStaffGestaoSnapshotGuardForTests } from '../src/lib/staff/staffGestaoSnapshotGuard';

const coopId = 'coop';
const old = '2026-11-01T00:00:00Z', start = Date.parse('2026-11-08T00:00:00Z');
const note = (id: string, extra = {}) => ({ id, cooperativaId: coopId, status: 'aguardando_conferencia', fotoNaNuvem: true, updatedAt: old, ...extra } as NotaPedido);
const cloudNote = note('paid', { status: 'pago' });
const base = { ...structuredClone(emptyInitialData), cooperativas: [{ id: coopId, cnpj: '88888888000181' }],
  notasPedido: [cloudNote], fichaCorrida: [{ id: 'paid-f', cooperativaId: coopId, notaPedidoId: 'paid', status: 'pago', updatedAt: old }], valoresAvulsosReceber: [] } as unknown as AppData;
const local = { ...base, notasPedido: [note('paid'), note('ghost'), note('unsent', { fotoNaNuvem: false, fotoPedido: 'data:image/jpeg;base64,AA' }), note('queued'), note('new', { updatedAt: '2026-11-08T00:00:01Z' }), note('other', { cooperativaId: 'other' })],
 fichaCorrida: [{ ...base.fichaCorrida[0], status: 'pendente' }, { id: 'ghost-f', cooperativaId: coopId, status: 'pendente', updatedAt: old }, { id: 'new-f', cooperativaId: coopId, status: 'pendente', updatedAt: '2026-11-08T00:00:01Z' }],
 valoresAvulsosReceber: [{ id: 'old-debit', cooperativaId: coopId, updatedAt: old }] } as AppData;
const cloud = { updatedAt: old, fichaCorrida: base.fichaCorrida, valoresAvulsosReceber: [] };
const before = JSON.stringify(local);
const r = reconciliarEntradaStaffCloud(local, local, cloud, [cloudNote], coopId, start, new Set(['queued']));
assert.equal(r.data.notasPedido.find(n => n.id === 'paid')?.status, 'pago');
assert.ok(!r.data.notasPedido.some(n => n.id === 'ghost'));
for (const id of ['unsent', 'queued', 'new', 'other']) assert.ok(r.data.notasPedido.some(n => n.id === id), id);
assert.equal(r.data.fichaCorrida.find(f => f.id === 'paid-f')?.status, 'pago');
assert.ok(!r.data.fichaCorrida.some(f => f.id === 'ghost-f'));
assert.ok(r.data.fichaCorrida.some(f => f.id === 'new-f'));
assert.equal(r.data.valoresAvulsosReceber.length, 0);
assert.deepEqual(r.retired.notasPedido.map((n: any) => n.id), ['paid', 'ghost']);
assert.deepEqual(r.retired.fichaCorrida.map((n: any) => n.id), ['paid-f', 'ghost-f']);
for (const id of ['unsent', 'queued']) assert.equal(r.data.notasPedido.find(n => n.id === id)?.status, 'rascunho', 'unpublished photos do not enter the conference queue');
assert.equal(JSON.stringify(local), before, 'source cache remains recoverable');
const omitted = reconciliarEntradaStaffCloud(local, local, { updatedAt: old }, [cloudNote], coopId, start, new Set());
assert.equal(omitted.data.fichaCorrida, local.fichaCorrida, 'omitted domain is not empty');
// Clean/private mode and populated stale normal mode produce identical active financial records.
const stale = { ...base, notasPedido: [note('paid'), note('ghost')], fichaCorrida: [local.fichaCorrida[0], local.fichaCorrida[1]] };
const cleanResult = reconciliarEntradaStaffCloud(base, base, cloud, [cloudNote], coopId, start, new Set()).data;
const staleResult = reconciliarEntradaStaffCloud(stale, stale, cloud, [cloudNote], coopId, start, new Set()).data;
assert.deepEqual(staleResult.notasPedido, cleanResult.notasPedido);
assert.deepEqual(staleResult.fichaCorrida, cleanResult.fichaCorrida);
resetStaffGestaoSnapshotGuardForTests();
noteStaffGestaoLastGood(stale, '88888888000181');
confirmarStaffGestaoLastGoodCloud(staleResult, '88888888000181');
assert.deepEqual(peekStaffGestaoLastGood('88888888000181')?.notasPedido, cleanResult.notasPedido);
const guarded = preservarStaffGestaoContraWipe(peekStaffGestaoLastGood('88888888000181'), staleResult);
assert.ok(!guarded.notasPedido.some(n => n.id === 'ghost'), 'fallback does not resurrect retired notes');
assert.throws(() => confirmarStaffGestaoLastGoodCloud(staleResult, '11111111000111'), /inválida/);
resetStaffGestaoSnapshotGuardForTests();
console.log('PASS: normal/private parity; paid records; stale queue; draft/offline/concurrent/other-tenant preservation; fallback rebase.');
