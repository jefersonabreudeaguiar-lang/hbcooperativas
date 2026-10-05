/**
 * RQL 8.5 — paridade computeAdminStatsPure × getAdminStats + flag worker.
 * npx tsx scripts/test-rql-admin-stats-worker-h85.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { computeAdminStatsPure } from "../src/lib/performance/adminStatsComputeCore";
import { isRqlAdminStatsWorkerEnabled } from "../src/lib/performance/rqlAdminStats85";
import { getAdminStats, resetAdminStatsCacheForTests } from "../src/services/dashboardService";

function emptyAppData(): AppData {
  return {
    cooperativas: [{ id: "coop-1", nome: "Teste", cnpj: "62351750000165" }],
    users: [],
    cooperados: [
      { id: "c1", nomeCompleto: "A", cooperativaId: "coop-1", status: "ativo" },
      { id: "c2", nomeCompleto: "B", cooperativaId: "coop-1", status: "ativo" },
    ],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    votacaoPautas: [],
    votacaoVotos: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

resetAdminStatsCacheForTests();
const data = emptyAppData();

for (const bic of [false, true]) {
  const pure = computeAdminStatsPure(data, "coop-1", undefined, { bicCentralRead: bic });
  const prev = process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL;
  if (bic) process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
  else delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL;
  resetAdminStatsCacheForTests();
  const viaService = getAdminStats(data, "coop-1");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL;
  else process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = prev;
  assert.deepEqual(viaService, pure, `paridade bic=${bic}`);
}

const skipPure = computeAdminStatsPure(data, "coop-1", { skipValoresAPagar: true }, { bicCentralRead: true });
assert.equal(skipPure.valoresAPagar, 0, "skip valores");

assert.equal(isRqlAdminStatsWorkerEnabled(), false, "worker off em node");

console.log("OK — test-rql-admin-stats-worker-h85");
