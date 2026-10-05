/**
 * HX 8.3 — notify por domínio AppData.
 * npx tsx scripts/test-app-data-domain-notify-h83.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types/index.ts";
import {
  getAppDataDomainRevision,
  inferAppDataDomainsTouched,
  resetAppDataDomainNotifyForTests,
  touchAppDataDomains,
} from "../src/lib/performance/appDataDomainNotify.ts";

function shell(extra?: Partial<AppData>): AppData {
  return {
    cooperativas: [],
    cooperados: [],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    descontos: [],
    config: {},
    ...extra,
  } as AppData;
}

resetAppDataDomainNotifyForTests();

const before = shell({ notasPedido: [{ id: "n1" } as never] });
const after = shell({
  notasPedido: [{ id: "n1" } as never, { id: "n2" } as never],
});
const domains = inferAppDataDomainsTouched(before, after);
assert.ok(domains.includes("notas"));

touchAppDataDomains(["notas"]);
assert.equal(getAppDataDomainRevision("notas"), 1);
assert.equal(getAppDataDomainRevision("financeiro"), 0);

console.log("OK — test-app-data-domain-notify-h83");
