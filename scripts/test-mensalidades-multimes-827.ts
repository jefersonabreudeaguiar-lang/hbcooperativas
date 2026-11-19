import assert from "node:assert/strict";
import { mergeMensalidadeConfig, mergeCooperativaIntoData } from "../src/services/cooperativaCloudService";
import { listarMensalidadesExibicaoCooperado, getResumoMensalidadesCooperado } from "../src/services/mensalidadeService";
import { mensalidadeConfigParaExibicao } from "../src/utils/mensalidadeConfigPublica";
import type { AppData, Cooperativa, MensalidadeConfig, Mensalidade } from "../src/types";

const antiga: MensalidadeConfig = {
  valorPadrao: 30, diaVencimento: 12, lembreteAtivo: true, gerarAutomaticamente: true,
  mesesCobranca: ["2026-11"], configSalvaEm: "2026-11-01T00:00:00Z",
};
const atual: MensalidadeConfig = {
  ...antiga, mesesCobranca: ["2026-10", "2026-11", "2026-12"],
  configSalvaEm: "2026-11-19T18:22:25Z",
};
const coop = { id: "coop", cnpj: "62351750000165", nome: "Coop", status: "ativa",
  mensalidadeConfig: antiga, updatedAt: "2026-11-20T00:00:00Z" } as Cooperativa;
const mensalidade = (mes: string, status: Mensalidade["status"] = "atrasada"): Mensalidade => ({
  id: mes, cooperadoId: "pessoa", mesReferencia: mes, valor: 30, vencimento: `${mes}-12`,
  status, createdAt: "2026-11-19", updatedAt: "2026-11-19",
});
const data = { cooperativas: [coop], cooperados: [{ id: "pessoa", cooperativaId: "coop", status: "ativo", nomeCompleto: "Pessoa" }],
  mensalidades: [mensalidade("2026-10"), mensalidade("2026-11"), mensalidade("2099-12", "pendente")],
  fichaCorrida: [], pagamentosCooperado: [], users: [], notasPedido: [], descontos: [], config: {},
} as unknown as AppData;
assert.equal(listarMensalidadesExibicaoCooperado(data, "pessoa", "coop").length, 1);
const merged = mergeCooperativaIntoData(data.cooperativas, { ...coop, mensalidadeConfig: atual, updatedAt: "2026-11-19T18:21:59Z" });
const next = { ...data, cooperativas: merged };
assert.deepEqual(listarMensalidadesExibicaoCooperado(next, "pessoa", "coop").map(m => m.mesReferencia), ["2026-11", "2026-10"]);
assert.equal(getResumoMensalidadesCooperado(next, "pessoa", "coop").valorEmAberto, 60);
const paid = { ...next, mensalidades: [mensalidade("2026-10", "paga"), mensalidade("2026-11")] };
assert.equal(getResumoMensalidadesCooperado(paid, "pessoa", "coop").valorEmAberto, 30);
assert.equal(mergeMensalidadeConfig(atual, antiga)?.mesesCobranca?.length, 3);
assert.deepEqual(mergeMensalidadeConfig(atual, { ...atual, mesesCobranca: ["2026-11"], configSalvaEm: "2026-11-20T00:00:00Z" })?.mesesCobranca, ["2026-11"]);
assert.deepEqual(mergeMensalidadeConfig(atual, { ...atual, mesesCobranca: [], gerarAutomaticamente: false, valorPadrao: 0, configSalvaEm: "2026-11-20T00:00:00Z" })?.valorPadrao, 0);
const safe = mensalidadeConfigParaExibicao({ ...atual, senhaCadastroCooperadoHash: "segredo", senhaAreaAdminHash: "segredo-admin" });
assert.ok(!JSON.stringify(safe).includes("segredo"));
assert.deepEqual(safe?.mesesCobranca, atual.mesesCobranca);
console.log("PASS: atualização de um para dois meses, total, baixa paga, versão da config e remoção de hashes.");
