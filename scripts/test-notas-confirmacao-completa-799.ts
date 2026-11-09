import assert from 'node:assert/strict';
import { fetchNotasFromStorage, fetchNotasFromTable } from '../src/lib/supabase/notasStorage';
import { fetchNotasPedidoFromCloud } from '../src/services/notaPedidoCloudService';
import { setSecureApiFetchTestOverrideForTests } from '../src/lib/security/clientSession';

async function main() {
  let sqlError = false, listError = false, downloadError = false, corrupt = false;
  let sqlPages = 0, storagePages = 0, writes = 0;
  const row = (i: number) => ({ payload: { id: `n${i}`, status: 'conferida', updatedAt: '2026-11-01' }, status: 'pago', updated_at: '2026-11-02' });
  const fake = {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async (offset: number) => {
      sqlPages++;
      return { error: sqlError ? { message: 'unavailable' } : null,
        data: Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => row(offset + i)) };
    } }) }) }) }),
    storage: {
      createBucket: () => { writes++; throw Error('Unexpected write'); },
      from: () => ({
        list: async (_: string, { offset }: { offset: number }) => {
          storagePages++;
          return { error: listError ? { message: 'unavailable' } : null,
            data: Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({ name: `n${offset + i}.json` })) };
        },
        download: async (path: string) => ({ error: downloadError ? { message: 'unavailable' } : null,
          data: new Blob([corrupt ? '{bad' : JSON.stringify({ id: path, status: 'pago', updatedAt: '2026-11-02' })]) }),
      }),
    },
  } as never;
  const sql = await fetchNotasFromTable(fake, '88888888000181', undefined, true);
  assert.equal(sql.notas.length, 501); assert.equal(sqlPages, 2); assert.ok(sql.notas.every(n => n.status === 'pago'));
  const storage = await fetchNotasFromStorage(fake, '88888888000181', true);
  assert.equal(storage.length, 501); assert.equal(storagePages, 2); assert.equal(writes, 0);
  sqlError = true;
  await assert.rejects(fetchNotasFromTable(fake, '88888888000181', undefined, true), /consultar/);
  listError = true;
  await assert.rejects(fetchNotasFromStorage(fake, '88888888000181', true), /listar/);
  listError = false; downloadError = true;
  await assert.rejects(fetchNotasFromStorage(fake, '88888888000181', true), /ler/);
  downloadError = false; corrupt = true;
  await assert.rejects(fetchNotasFromStorage(fake, '88888888000181', true), /validar/);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => null, setItem: () => {} } });
  let complete = false, requested = '';
  setSecureApiFetchTestOverrideForTests(async input => {
    requested = String(input); return Response.json({ notas: [], complete });
  });
  try {
    const options = { forceFull: true, repairFila: false, confirmarCompleta: true };
    assert.equal((await fetchNotasPedidoFromCloud('88888888000181', options)).ok, false);
    complete = true;
    assert.equal((await fetchNotasPedidoFromCloud('88888888000181', options)).ok, true);
    assert.equal(new URL(requested, 'https://fixture.invalid').searchParams.get('confirmarCompleta'), '1');
  } finally { setSecureApiFetchTestOverrideForTests(null); }
  console.log('PASS: paginated complete reads; SQL/list/download/JSON failure rejected; no writes; explicit completeness required.');
}
void main();
