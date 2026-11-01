import assert from "node:assert/strict";
import { lerEntradaStaffComRetry } from "../src/services/staffEntradaAtualizadaService";
import { fetchNotasPedidoFromCloud } from "../src/services/notaPedidoCloudService";
import { setSecureApiFetchTestOverrideForTests } from "../src/lib/security/clientSession";
async function main() {
 let consulta = "";
 Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => null, setItem: () => {} } });
 setSecureApiFetchTestOverrideForTests(async input => { consulta = String(input); return Response.json({ notas: [] }); });
 try {
  const resultado = await fetchNotasPedidoFromCloud("62351750000165", { forceFull: true, repairFila: false });
  assert.equal(resultado.ok, true); assert.equal(new URL(consulta, "https://teste.local").searchParams.has("repairFila"), false);
 } finally { setSecureApiFetchTestOverrideForTests(null); }

 let chamadas = 0;
 const valor = await lerEntradaStaffComRetry("entregas", async () => { chamadas++; if (chamadas === 1) throw new Error("503"); return { ok: true }; }, r => r.ok, () => true);
 assert.equal(valor.ok, true); assert.equal(chamadas, 2);
 chamadas = 0;
 await assert.rejects(lerEntradaStaffComRetry("entregas", async () => { chamadas++; return { ok: false }; }, r => r.ok, () => true), /consultar entregas/);
 assert.equal(chamadas, 2);
 chamadas = 0;
 await assert.rejects(lerEntradaStaffComRetry("entregas", async () => { chamadas++; return true; }, Boolean, () => false), /cancelada/);
 assert.equal(chamadas, 0);
 console.log("OK: recuperação transitória, falha persistente e cancelamento");
}
void main();
