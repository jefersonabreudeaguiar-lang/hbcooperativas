import assert from 'node:assert/strict';
import fs from 'node:fs';
import { iniciarStaffEntrada, staffEntradaEmAndamento, aguardarEscritasStaff } from '../src/lib/staff/staffEntradaCoordination';
import { beginSaveBatch, endSaveBatch, staffEntradaEscritaOcupada } from '../src/services/dataStore';
import { atualizarEntradaStaff } from '../src/services/staffEntradaAtualizadaService';
import type { User } from '../src/types';

async function main() {
  const release = iniciarStaffEntrada();
  assert.equal(staffEntradaEmAndamento(), true);
  beginSaveBatch();
  const finish = setTimeout(endSaveBatch, 20);
  try { await aguardarEscritasStaff(staffEntradaEscritaOcupada, () => true); }
  finally { clearTimeout(finish); }
  assert.equal(staffEntradaEscritaOcupada(), false);
  assert.equal(staffEntradaEmAndamento(), true, 'entry remains exclusive while existing batch finishes');
  release(); release(); assert.equal(staffEntradaEmAndamento(), false);
  beginSaveBatch();
  try {
    await assert.rejects(aguardarEscritasStaff(staffEntradaEscritaOcupada, () => true, 0), /atualização anterior/);
    assert.equal(staffEntradaEscritaOcupada(), true, 'timeout must not reset a real write or discard queued data');
    await assert.rejects(aguardarEscritasStaff(staffEntradaEscritaOcupada, () => false), /cancelada/);
  } finally { endSaveBatch(); }
  await assert.rejects(atualizarEntradaStaff({ id:'fixture',role:'responsavel' } as User, () => false), /cancelada/);
  assert.equal(staffEntradaEmAndamento(), false, 'failure/cancellation always releases entry priority');
  const provider = fs.readFileSync('src/components/sync/CooperativaSyncProvider.tsx','utf8');
  assert.match(provider,/currentUser.role !== 'cooperado' && staffEntradaEmAndamento\(\)/);
  assert.match(fs.readFileSync('src/lib/hb-credit/syncContaCoopFichaDescontos.ts','utf8'),/if \(staffEntradaEmAndamento\(\)\) return false/);
  console.log('PASS: staff entry waits for real writes, prevents competing background jobs, releases on cancellation and never resets active batches.');
}
void main();
