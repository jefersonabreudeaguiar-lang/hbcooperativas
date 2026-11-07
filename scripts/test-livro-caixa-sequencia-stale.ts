import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import { alocarSequenciaEvento, lancarPagamentoCooperadoNoCaixa } from "../src/services/livroCaixaService";
import type { AppData, LivroCaixaLancamento, PagamentoCooperadoRegistro } from "../src/types";

const year = new Date().getFullYear();
const date = `${year}-08-20`;
const oldLine = { id: "old", cooperativaId: "coop-a", origem: "pagamento_cooperado", origemId: "pg_caixa_old",
  tipo: "debito", valor: 100, data: date, mesReferencia: `${year}-08`, createdAt: `${date}T12:00:00Z`,
  numeroSequencia: 1, anoSequencia: year, grupoEventoId: "evt_pg_old", historico: "Old payment" } as LivroCaixaLancamento;
const stale: AppData = { ...emptyInitialData, livroCaixa: [oldLine],
  livroCaixaControleAnual: [{ cooperativaId: "coop-a", anoLivro: year, proximoSequencia: 1,
    historicoEncerramentos: [], updatedAt: `${date}T12:00:00Z` }] };
const payment = { id: "new", cooperativaId: "coop-a", cooperadoId: "member", status: "confirmado",
  fichaIds: [], notaPedidoIds: [], mesReferencia: `${year}-08`, valorBruto: 100, valorLiquido: 95,
  descontoCooperativa: 5, pagoEm: `${date}T13:00:00Z`, createdAt: `${date}T13:00:00Z`, pagoPor: "Fixture" } as PagamentoCooperadoRegistro;
const before = JSON.stringify(stale);
const result = lancarPagamentoCooperadoNoCaixa(stale, payment);
const lines = result.livroCaixa!.filter(l => l.grupoEventoId === "evt_pg_new");
assert.equal(lines.length, 2, "Debit and retention must share the payment event");
assert.ok(lines.every(l => l.numeroSequencia === 2), "Stale counter cannot reuse the previous payment number");
assert.equal(result.livroCaixa![0], oldLine, "Never renumber an existing historical entry");
assert.equal(JSON.stringify(stale), before, "Do not mutate the source snapshot");
assert.equal(lancarPagamentoCooperadoNoCaixa(result, payment).livroCaixa!.length, result.livroCaixa!.length);

const recovered = { ...result, livroCaixaControleAnual: [] };
assert.equal(alocarSequenciaEvento(recovered, "coop-a", date).ctx.numeroSequencia, 3, "Lost counter recovers from existing rows");
const scoped = { ...stale, livroCaixa: [...stale.livroCaixa!, { ...oldLine, id: "other-coop", cooperativaId: "coop-b", numeroSequencia: 900 },
  { ...oldLine, id: "previous-year", anoSequencia: year - 1, numeroSequencia: 800 }] };
assert.equal(alocarSequenciaEvento(scoped, "coop-a", date).ctx.numeroSequencia, 2);
const ahead = { ...stale, livroCaixaControleAnual: [{ ...stale.livroCaixaControleAnual![0], proximoSequencia: 50 }] };
assert.equal(alocarSequenciaEvento(ahead, "coop-a", date).ctx.numeroSequencia, 50, "Do not reuse reserved or deleted numbers");
console.log("PASS: stale/lost counter cannot reuse payment sequence; retention stays grouped, history and tenant/year boundaries preserved.");
