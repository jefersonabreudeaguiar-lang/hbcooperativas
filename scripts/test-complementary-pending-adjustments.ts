import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import type { AppData } from "../src/types";
import { getResumoValorAPagarRelatorio, resumoComplementaresPosPagamento } from "../src/services/notaPedidoService";
import { valoresAvulsosPendentesMes, totalDebitosAvulsosPendentes, saldoValoresAvulsosPendentes } from "../src/services/valoresAvulsosReceberService";
import { getConsolidadoFinanceiroCooperadoMotorLegado } from "../src/services/cooperadoEntregasService";

const coop = "coop-fixture";
const member = "member-fixture";
const month = "2026-10";
const data = {
  ...structuredClone(emptyInitialData),
  config: { descontoPadraoCooperativa: 0 },
  cooperativas: [{id: coop, cnpj: "99999999999999", nome: "Fixture", mensalidadeConfig: {valorPadrao: 0}}],
  cooperados: [{id: member, cooperativaId: coop, nomeCompleto: "Fixture", status: "ativo"}],
  notasPedido: ["old", "new"].map((id, i) => ({id: `n-${id}`, cooperadoId: member, cooperativaId: coop, mesReferencia: month, status: "conferida", valorBruto: i ? 300 : 100, valorLiquido: i ? 300 : 100, valorDesconto: 0, itens: [], createdAt: i ? "2026-11-02T12:00:00Z" : "2026-10-01T12:00:00Z"})),
  fichaCorrida: ["old", "new"].map((id, i) => ({id: `f-${id}`, notaPedidoId: `n-${id}`, cooperadoId: member, cooperativaId: coop, mesReferencia: month, status: i ? "pendente" : "pago", valorBruto: i ? 300 : 100, valorLiquido: i ? 300 : 100, descontos: 0, dataLancamento: i ? "2026-11-02T12:00:00Z" : "2026-10-01T12:00:00Z", createdAt: i ? "2026-11-02T12:00:00Z" : "2026-10-01T12:00:00Z"})),
  pagamentosCooperado: [{id: "payment-old", cooperadoId: member, cooperativaId: coop, mesReferencia: month, valorBruto: 100, valorLiquido: 100, descontoCooperativa: 0, descontosExtras: [], fichaIds: ["f-old"], notaPedidoIds: ["n-old"], status: "confirmado", pagoEm: "2026-11-01T12:00:00Z", createdAt: "2026-11-01T12:00:00Z"}],
  valoresAvulsosReceber: [
    {id: "debit", cooperadoId: member, cooperativaId: coop, mesReferencia: month, status: "pendente", natureza: "debito", valor: 50, motivo: "Adiantamento novo", dataLancamento: "2026-11-02"},
    {id: "credit", cooperadoId: member, cooperativaId: coop, mesReferencia: month, status: "pendente", natureza: "credito", valor: 20, motivo: "Acerto novo", dataLancamento: "2026-11-02"},
    {id: "settled", cooperadoId: member, cooperativaId: coop, mesReferencia: month, status: "pago", natureza: "debito", valor: 15, motivo: "Já acertado", dataLancamento: "2026-10-01"},
  ],
} as unknown as AppData;

for (const summary of [getResumoValorAPagarRelatorio(data, member, month, coop), resumoComplementaresPosPagamento(data, member, month, coop)!]) {
  assert.equal(summary.valorLiquido, 270, "Entrega complementar de 300, débito de 50 e crédito de 20 devem resultar em 270");
  assert.equal(summary.descontosExtras.filter(d => d.referenciaId === "debit").length, 1);
  assert.equal(summary.descontosExtras.filter(d => d.referenciaId === "credit").length, 1);
  assert.equal(summary.descontosExtras.some(d => d.referenciaId === "settled"), false);
}
const foreign = structuredClone(data);
foreign.valoresAvulsosReceber.push({...foreign.valoresAvulsosReceber[0], id: "foreign", cooperativaId: "other-coop", valor: 900});
assert.equal(valoresAvulsosPendentesMes(foreign, member, month, coop).some(d => d.id === "foreign"), false);
assert.equal(getResumoValorAPagarRelatorio(foreign, member, month, coop).valorLiquido, 270);
const snapshot = JSON.stringify(data);
getResumoValorAPagarRelatorio(data, member, month, coop);
assert.equal(JSON.stringify(data), snapshot, "Leitura não deve alterar valores nem marcar lançamentos pagos");
const stale = structuredClone(data);
stale.valoresAvulsosReceber.push({...stale.valoresAvulsosReceber[0], id: "already-in-payment", valor: 99});
stale.pagamentosCooperado[0].descontosExtras.push({tipo: "manual", origem: "debito_avulso", referenciaId: "already-in-payment", valor: 99, motivo: "Acerto anterior"});
assert.equal(getResumoValorAPagarRelatorio(stale, member, month, coop).valorLiquido, 270, "Avulso já identificado no pagamento anterior não pode ser descontado novamente");
assert.equal(resumoComplementaresPosPagamento(stale, member, month, coop)!.valorLiquido, 270);
assert.equal(getConsolidadoFinanceiroCooperadoMotorLegado(stale, member, coop).valorLiquido, 270, "Motor do cooperado deve coincidir com o relatório do responsável");
assert.equal(totalDebitosAvulsosPendentes(stale, member, month, coop), 50);
assert.equal(saldoValoresAvulsosPendentes(stale, member, month, coop), -30);
stale.pagamentosCooperado[0].status = "aguardando_confirmacao";
assert.equal(getResumoValorAPagarRelatorio(stale, member, month, coop).valorLiquido, 270, "PIX registrado aguardando assinatura também preserva o acerto anterior");
const otherPayment = structuredClone(data);
otherPayment.pagamentosCooperado.push({...otherPayment.pagamentosCooperado[0], id: "foreign-payment", cooperativaId: "other-coop", descontosExtras: [{tipo: "manual", origem: "debito_avulso", referenciaId: "debit", valor: 50, motivo: "Outra cooperativa"}]});
assert.equal(totalDebitosAvulsosPendentes(otherPayment, member, month, coop), 50, "Pagamento de outra cooperativa não pode quitar débito local");
const orphan = structuredClone(data);
orphan.valoresAvulsosReceber.push({...orphan.valoresAvulsosReceber[0], id: "orphan", mesReferencia: "2026-11", valor: 40});
assert.equal(getResumoValorAPagarRelatorio(orphan, member, month, coop).valorLiquido, 230, "Avulso lançado no mês atual continua no último mês com entregas a pagar");
console.log("PASS: entrega complementar aplica avulsos pendentes uma vez, preserva acertados, isola cooperativas e não altera registros.");
