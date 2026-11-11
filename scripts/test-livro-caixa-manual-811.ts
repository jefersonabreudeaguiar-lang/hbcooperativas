import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { criarLancamentoManual, excluirLancamentoLivroCaixa, resumoLivroCaixa } from "../src/services/livroCaixaService";
import { aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional } from "../src/services/livroCaixaPagamentoGuard";

const base = { livroCaixa: [], livroCaixaControleAnual: [], cooperativas: [] } as unknown as AppData;
const primeiro = criarLancamentoManual(base, "coop", "credito", 125.30, "Receita", { id: "um" });
assert.equal(criarLancamentoManual(primeiro, "coop", "credito", 125.30, "Receita", { id: "um" }), primeiro);
const independente = criarLancamentoManual(primeiro, "coop", "credito", 125.30, "Receita", { id: "dois" });
assert.equal(resumoLivroCaixa(independente, "coop").totalCreditos, 250.60);

const excluido = excluirLancamentoLivroCaixa(primeiro, "coop", "um");
assert.equal(excluido.livroCaixa?.length, 0);
assert.equal(criarLancamentoManual(excluido, "coop", "credito", 125.30, "Receita", { id: "um" }), excluido);
const reenvioAntigo = aplicarPreservacaoLivroCaixaPagamentosConfirmadosNoOperacional(excluido, primeiro);
assert.equal(reenvioAntigo.payload.livroCaixa?.length, 0);
assert.equal(reenvioAntigo.payload.livroCaixaExcluidos?.[0].id, "um");
assert.equal(resumoLivroCaixa({ ...primeiro, livroCaixaExcluidos: excluido.livroCaixaExcluidos }, "coop").totalCreditos, 0);
console.log("PASS: reenvio não duplica crédito nem restaura a última linha excluída.");
