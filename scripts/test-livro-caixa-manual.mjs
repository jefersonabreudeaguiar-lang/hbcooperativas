/**
 * Livro caixa — editar/excluir só lançamentos manuais
 * node scripts/test-livro-caixa-manual.mjs
 */
import {
  criarLancamentoManual,
  atualizarLancamentoManual,
  excluirLancamentoLivroCaixa,
  isLancamentoManualEditavel,
} from "../src/services/livroCaixaService.ts";

const coopId = "coop-1";
let data = { livroCaixa: [], cooperados: [], pagamentosCooperado: [] };

data = criarLancamentoManual(data, coopId, "credito", 100, "PNAE teste", { origem: "pnae" });
const manualId = data.livroCaixa[0].id;
if (!isLancamentoManualEditavel(data.livroCaixa[0])) throw new Error("manual deve ser editável");

data = atualizarLancamentoManual(data, coopId, manualId, {
  tipo: "credito",
  valor: 150,
  historico: "PNAE ajustado",
});
if (data.livroCaixa[0].valor !== 150) throw new Error("update valor");

data = excluirLancamentoLivroCaixa(data, coopId, manualId);
if (data.livroCaixa.length !== 0) throw new Error("delete manual");

console.log("OK: livro caixa manual edit/delete");
