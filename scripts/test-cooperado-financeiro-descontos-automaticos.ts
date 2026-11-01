import { getTotalValoresAPagarGestaoCooperativa, valorAPagarCooperadoEmAberto } from "../src/lib/responsavel/responsavelGestaoLeitura";
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import type { AppData } from "../src/types";
import { persistDescontosContaCoopNoArquivo, valorLiquidoFromResumoPartes, reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import { leituraFinanceiraParidadeCooperado } from "../src/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { cooperadoFinanceiroScopedData } from "../src/lib/cooperado/cooperadoFinanceiroScopedData";

const coop = "coop-finance-test", actor = "actor-test", mes = "2026-10";
let data: AppData = {
  ...structuredClone(emptyInitialData),
  config: { ...emptyInitialData.config, descontoPadraoCooperativa: 0 },
  cooperativas: [{ id: coop, cnpj: "12345678000190", nome: "Teste" } as AppData["cooperativas"][0]],
  cooperados: [{ id: actor, cooperativaId: coop, nomeCompleto: "Teste", status: "ativo" } as AppData["cooperados"][0]],
  notasPedido: [{ id: "note", cooperadoId: actor, cooperativaId: coop, mesReferencia: mes, status: "conferida", valorBruto: 1000, valorLiquido: 1000, itens: [], dataEntrega: "2026-10-15", dataConferencia: "2026-10-15" } as AppData["notasPedido"][0]],
  fichaCorrida: [{ id: "ficha", notaPedidoId: "note", cooperadoId: actor, cooperativaId: coop, mesReferencia: mes, status: "pendente", valorBruto: 1000, descontos: 0, valorLiquido: 1000, createdAt: "2026-10-15" } as AppData["fichaCorrida"][0]],
  valoresAvulsosReceber: [
    { id: "debit", cooperadoId: actor, cooperativaId: coop, mesReferencia: mes, natureza: "debito", valor: 50, motivo: "Combustível", status: "pendente", dataLancamento: "2026-10-20" },
    { id: "credit", cooperadoId: actor, cooperativaId: coop, mesReferencia: mes, natureza: "credito", valor: 20, motivo: "Ajuste de entrega", status: "pendente", dataLancamento: "2026-10-20" },
  ] as AppData["valoresAvulsosReceber"],
};
const purchase = { motivo: "Compra HB Créditos — Mercado (ABCDEF12)", valorReais: 120, tipo: "conta_coop" as const, createdAt: "2026-10-20T12:00:00Z", hbTransactionId: "tx-one" };
data = persistDescontosContaCoopNoArquivo(data, actor, mes, coop, [purchase, purchase]);
const original = JSON.stringify(data);
let p = leituraFinanceiraParidadeCooperado(data, actor, coop);
assert.equal(p.valorLiquido, 850, "1000 - HB120 - débito50 + crédito20");
assert.equal(p.resumo.valorLiquido, p.valorLiquido);
assert.equal(p.consolidado.valorLiquido, p.valorLiquido);
assert.equal(valorLiquidoFromResumoPartes(p.resumo.valorEntregas, p.descontosExtras), p.valorLiquido);
assert.equal(p.descontosExtras.filter((d) => d.tipo === "conta_coop").length, 1, "transação duplicada só abate uma vez");
assert.ok(p.descontosExtras.some((d) => d.origem === "debito_avulso" && d.motivo === "Combustível" && d.dataLancamento === "2026-10-20"));
assert.equal(JSON.stringify(data), original, "cálculo não altera lançamentos");
data = persistDescontosContaCoopNoArquivo(data, actor, mes, coop, [purchase, { ...purchase, motivo: "Estorno HB Créditos — Mercado", valorReais: 30, hbTransactionId: "refund-one" }]);
p = leituraFinanceiraParidadeCooperado(data, actor, coop);
assert.equal(p.valorLiquido, 880, "estorno devolve valor uma única vez");
data = { ...data, valoresAvulsosReceber: data.valoresAvulsosReceber!.map((v) => v.id === "debit" ? { ...v, valor: 1500 } : v) };
p = leituraFinanceiraParidadeCooperado(data, actor, coop);
assert.equal(p.valorLiquido, 0, "desconto integral não restaura valor anterior");
assert.equal(p.resumo.valorEntregas, 1000, "zero não apaga as entregas do demonstrativo");
assert.ok(p.descontosExtras.some((d) => d.valor === 1500));
assert.deepEqual(p.mesesResumo, [mes]);
const crossTenant = { ...data.valoresAvulsosReceber![0], id: "other", cooperativaId: "other-coop", valor: 99999 };
const scoped = cooperadoFinanceiroScopedData({ ...data, valoresAvulsosReceber: [...data.valoresAvulsosReceber!, crossTenant] }, actor, coop);
assert.equal(scoped.valoresAvulsosReceber!.some((v) => v.id === "other"), false, "outro CNPJ não entra no resumo");
console.log("OK: HB + avulsos + créditos + estorno, sem duplicação; saldo zero detalhado; isolamento; cálculo somente leitura");

// Nota conferida na nuvem pode existir antes da ficha operacional ser sincronizada.
const missingNote = { ...data.notasPedido[0], id: "missing-cloud-note", valorBruto: 2500, valorLiquido: 2500, descontoCooperativa: 0, itens: [{ produtoId: "p-test", quantidade: 1, precoUnitario: 2500 }], createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" } as AppData["notasPedido"][0];
const gap = { ...data, valoresAvulsosReceber: [], arquivosMensais: [], notasPedido: [...data.notasPedido, missingNote] };
const beforeRepair = JSON.stringify(gap);
const repaired = reconciliarFichaFromNotasConferidas(gap);
assert.equal(JSON.stringify(gap), beforeRepair, "reconciliação não altera a fonte");
assert.equal(repaired.fichaCorrida.filter(f => f.notaPedidoId === missingNote.id).length, 1);
assert.equal(leituraFinanceiraParidadeCooperado(repaired, actor, coop).resumo.valorEntregas, 3500, "nota conferida sem ficha entra no total");
assert.equal(reconciliarFichaFromNotasConferidas(repaired).fichaCorrida.filter(f => f.notaPedidoId === missingNote.id).length, 1, "reconciliação não duplica entrega");
console.log("OK: entrega conferida sem ficha incluída, sem mutação ou duplicação");
assert.equal(getTotalValoresAPagarGestaoCooperativa(data, coop), 0, "responsável não recupera entregas quando descontos zeram o saldo");
assert.equal(valorAPagarCooperadoEmAberto(gap, actor, coop).total, 3500, "responsável também inclui nota conferida sem ficha");
console.log("OK: totais do responsável incluem nota sem ficha e respeitam descontos integrais");