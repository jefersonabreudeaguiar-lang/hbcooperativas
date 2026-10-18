/**
 * Em aberto: quem já tem PIX/pagamento vira pago e entra no Livro Caixa.
 * npx tsx scripts/test-em-aberto-pagos-entram-livro-caixa.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import { listarFichasEmAbertoPagamento } from "../src/services/notaPedidoService.ts";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService.ts";
import { posProcessarFinanceiroLocal } from "../src/services/operacionalLocalPostProcess.ts";
import { calcularResumoPorCooperadoLivroCaixaCompleto } from "../src/services/livroCaixaResumoCooperado.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";

const COOP = "coop-1";

function emptyData(): AppData {
  return {
    users: [],
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "12345678000199", active: true }],
    cooperados: [],
    notasPedido: [],
    pagamentosCooperado: [],
    fichaCorrida: [],
    mensalidades: [],
    arquivosMensais: [],
    descontos: [],
    livroCaixa: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function fixtureTresEmAbertoDoisPagos(): AppData {
  const data = emptyData();
  for (let i = 1; i <= 3; i++) {
    const cid = `c-${i}`;
    data.cooperados.push({
      id: cid,
      nomeCompleto: `Cooperado ${i}`,
      cooperativaId: COOP,
      status: "ativo",
      chavePix: `pix${i}@test`,
    } as AppData["cooperados"][0]);
    data.notasPedido.push({
      id: `n-${i}`,
      cooperadoId: cid,
      cooperativaId: COOP,
      mesReferencia: "2026-10",
      status: "conferida",
      valorLiquido: 82,
      valorBruto: 100,
      itens: [],
      createdAt: "2026-10-02T00:00:00.000Z",
      dataEntrega: "2026-10-02",
      dataConferencia: "2026-10-02T00:00:00.000Z",
    } as NotaPedido);
    data.fichaCorrida.push({
      id: `f-${i}`,
      cooperadoId: cid,
      cooperativaId: COOP,
      notaPedidoId: `n-${i}`,
      mesReferencia: "2026-10",
      status: "pendente",
      descricao: `Nota ${i}`,
      valorBruto: 100,
      valorLiquido: 82,
      descontos: 18,
      descontosDetalhe: [
        { tipo: "cooperativa", motivo: "Taxa", valor: 10 },
        { tipo: "mensalidade", motivo: "Outubro", valor: 5 },
        { tipo: "conta_coop", motivo: "HB", valor: 3 },
      ],
      dataLancamento: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-02T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    } as FichaCorrida);
    if (i <= 2) {
      data.pagamentosCooperado.push({
        id: `pg-${i}`,
        cooperativaId: COOP,
        cooperadoId: cid,
        mesReferencia: "2026-10",
        status: "confirmado",
        valorLiquido: 82,
        valorBruto: 0,
        descontoCooperativa: 0,
        descontosExtras: [],
        fichaIds: [`f-${i}`],
        notaPedidoIds: [`n-${i}`],
        pagoPor: "resp",
        pagoEm: "2026-10-20T12:00:00.000Z",
        createdAt: "2026-10-20T12:00:00.000Z",
      } as PagamentoCooperadoRegistro);
    }
  }
  return data;
}

const data = fixtureTresEmAbertoDoisPagos();
resetResponsavelPainelIndexCache();
assert.equal(getRelatorioLancamentosEmAbertoResponsavel(data, COOP).length, 1, "só o sem PIX fica em aberto");
assert.equal(listarFichasEmAbertoPagamento(data, "c-1", "2026-10", COOP).length, 0);
assert.equal(listarFichasEmAbertoPagamento(data, "c-3", "2026-10", COOP).length, 1);

const soProjecao = posProcessarFinanceiroLocal(data);
assert.equal((soProjecao.livroCaixa ?? []).length, 0, "projeção HB não lança caixa");

const next = posProcessarIntegridadePagamentosCooperativa(soProjecao);
assert.equal(next.fichaCorrida.find((f) => f.id === "f-1")?.status, "pago");
assert.equal(next.fichaCorrida.find((f) => f.id === "f-2")?.status, "pago");
assert.equal(next.fichaCorrida.find((f) => f.id === "f-3")?.status, "pendente");
assert.equal(next.notasPedido.find((n) => n.id === "n-1")?.status, "pago");
assert.equal(next.notasPedido.find((n) => n.id === "n-2")?.status, "pago");
assert.equal(next.notasPedido.find((n) => n.id === "n-3")?.status, "conferida");

const trava = posProcessarIntegridadePagamentosCooperativa({
  ...next,
  fichaCorrida: next.fichaCorrida.map((f) =>
    f.id === "f-1" ? { ...f, status: "pendente" as const } : f
  ),
  notasPedido: next.notasPedido.map((n) =>
    n.id === "n-1" ? { ...n, status: "conferida" as const } : n
  ),
});
assert.equal(trava.fichaCorrida.find((f) => f.id === "f-1")?.status, "pago", "PIX confirmado não volta a receber");
assert.equal(trava.notasPedido.find((n) => n.id === "n-1")?.status, "pago", "nota coberta pelo PIX fica paga");

const livro = next.livroCaixa ?? [];
assert.ok(livro.some((l) => l.origemId === "pg_caixa_pg-1" && l.tipo === "debito" && l.valor === 100));
assert.ok(livro.some((l) => l.origemId === "pg_caixa_pg-2" && l.tipo === "debito" && l.valor === 100));
assert.ok(livro.some((l) => l.origemId === "pg_taxa_pg-1" && l.tipo === "credito" && l.valor === 10));
assert.ok(livro.some((l) => l.origem === "mensalidade_ficha" && l.valor === 5));
assert.ok(!livro.some((l) => String(l.origemId ?? "").includes("pg-3")));

const resumo = calcularResumoPorCooperadoLivroCaixaCompleto(next, livro, COOP);
assert.equal(resumo.find((r) => r.cooperadoId === "c-1")?.totalBruto, 100);
assert.equal(resumo.find((r) => r.cooperadoId === "c-2")?.debitoPagamento, 100);
assert.equal(resumo.find((r) => r.cooperadoId === "c-3"), undefined);

resetResponsavelPainelIndexCache();
assert.equal(getRelatorioLancamentosEmAbertoResponsavel(next, COOP).length, 1);
assert.equal(getRelatorioLancamentosEmAbertoResponsavel(next, COOP)[0]?.cooperadoId, "c-3");

const finalizeSrc = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/services/cooperativaSyncCloudService.ts"),
  "utf8"
);
assert.ok(
  finalizeSrc.includes("posProcessarIntegridadePagamentosCooperativa(base)"),
  "pull operacional aplica pagos no livro"
);

console.log("ok: pagos saem do Em aberto e entram no Livro Caixa");
