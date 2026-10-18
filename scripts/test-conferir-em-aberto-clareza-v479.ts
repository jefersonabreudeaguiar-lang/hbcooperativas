/**
 * Conferir: rotulo de apresentação — não muda valor, PIX nem caixa.
 * Encadeamento do painel só em memória (sem lastro, nuvem ou operacional.json).
 * npx tsx scripts/test-conferir-em-aberto-clareza-v479.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  classificarSituacaoEmAbertoConferir,
  SITUACAO_ENTREGA_POS_PIX,
  SITUACAO_SEM_PIX_MES,
} from "../src/components/notas/conferirEmAbertoSituacao.ts";
import { flattenLinhasPagarCooperadoEmAberto } from "../src/services/relatorioService.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { origemLinhaEmAbertoConferir } from "../src/components/notas/LancamentosEmAbertoPainel.tsx";

const COOP = "coop-syn-v479";
const ROOT = join(import.meta.dirname ?? __dirname, "..");

function dataBase(): AppData {
  return {
    ...emptyInitialData,
    cooperativas: [{ id: COOP, nome: "C", cnpj: "1", active: true }],
    cooperados: [
      { id: "c-sem", nomeCompleto: "Sem Pix", cooperativaId: COOP, status: "ativo" },
      { id: "c-pos", nomeCompleto: "Pos Pix", cooperativaId: COOP, status: "ativo" },
    ] as AppData["cooperados"],
    pagamentosCooperado: [
      {
        id: "pg-pos",
        cooperadoId: "c-pos",
        cooperativaId: COOP,
        mesReferencia: "2026-10",
        status: "confirmado",
        valorBruto: 100,
        valorLiquido: 82,
        descontoCooperativa: 18,
        pagoEm: "2026-10-09T12:00:00.000Z",
        createdAt: "2026-10-09T12:00:00.000Z",
        updatedAt: "2026-10-09T12:00:00.000Z",
      } as PagamentoCooperadoRegistro,
    ],
  };
}

function cooperadoSyn(id: string, nome: string): AppData["cooperados"][number] {
  return {
    id,
    nomeCompleto: nome,
    cooperativaId: COOP,
    status: "ativo",
    chavePix: `${id}@syn`,
  } as AppData["cooperados"][number];
}

function notaSyn(partial: Partial<NotaPedido> & { id: string; cooperadoId: string }): NotaPedido {
  return {
    cooperativaId: COOP,
    mesReferencia: "2026-10",
    status: "conferida",
    valorBruto: 110,
    valorLiquido: 100,
    itens: [],
    createdAt: "2026-10-02T00:00:00.000Z",
    dataEntrega: "2026-10-02",
    dataConferencia: "2026-10-02T12:00:00.000Z",
    ...partial,
  } as NotaPedido;
}

function fichaSyn(
  partial: Partial<FichaCorrida> & { id: string; cooperadoId: string; notaPedidoId: string }
): FichaCorrida {
  return {
    cooperativaId: COOP,
    mesReferencia: "2026-10",
    status: "pendente",
    descricao: partial.id,
    valorBruto: 110,
    valorLiquido: 100,
    descontos: 10,
    dataLancamento: "2026-10-02T12:00:00.000Z",
    createdAt: "2026-10-02T12:00:00.000Z",
    updatedAt: "2026-10-02T12:00:00.000Z",
    ...partial,
  } as FichaCorrida;
}

function pixConfirmadoSyn(
  partial: Partial<PagamentoCooperadoRegistro> & { id: string; cooperadoId: string }
): PagamentoCooperadoRegistro {
  return {
    cooperativaId: COOP,
    mesReferencia: "2026-10",
    status: "confirmado",
    valorBruto: 110,
    valorLiquido: 100,
    descontoCooperativa: 10,
    descontosExtras: [],
    fichaIds: [],
    notaPedidoIds: [],
    pagoPor: "resp-syn",
    pagoEm: "2026-10-09T12:00:00.000Z",
    createdAt: "2026-10-09T12:00:00.000Z",
    updatedAt: "2026-10-09T12:00:00.000Z",
    ...partial,
  } as PagamentoCooperadoRegistro;
}

function dataMemoria(partial: Partial<AppData>): AppData {
  return {
    ...emptyInitialData,
    cooperativas: [{ id: COOP, nome: "C syn", cnpj: "1", active: true }],
    cooperados: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    ...partial,
  };
}

/** Mesmo encadeamento do painel Conferir → Em aberto. Só memória. */
function encadearConferirEmAberto(data: AppData) {
  resetResponsavelPainelIndexCache();
  const porCooperado = getRelatorioLancamentosEmAbertoResponsavel(data, COOP);
  const detalharPorMes = porCooperado.some((r) => r.porMes.length > 1);
  const linhasTabela = flattenLinhasPagarCooperadoEmAberto(porCooperado).map((row) => {
    const { origem, meses } = origemLinhaEmAbertoConferir(row.id, porCooperado, detalharPorMes);
    const situacao = classificarSituacaoEmAbertoConferir(
      data,
      COOP,
      origem?.cooperadoId ?? "",
      meses
    );
    return {
      ...row,
      situacao,
      apresentacao: situacao || "—",
      origemId: origem?.cooperadoId ?? null,
      meses,
    };
  });
  const totalGeral = porCooperado.reduce((s, r) => s + r.total, 0);
  const somaLinhas = linhasTabela.reduce((s, r) => s + r.total, 0);
  return { porCooperado, linhasTabela, totalGeral, somaLinhas };
}

assert.equal(
  classificarSituacaoEmAbertoConferir(dataBase(), COOP, "c-sem", ["2026-10"]),
  SITUACAO_SEM_PIX_MES
);
assert.equal(
  classificarSituacaoEmAbertoConferir(dataBase(), COOP, "c-pos", ["2026-10"]),
  SITUACAO_ENTREGA_POS_PIX
);
assert.equal(
  classificarSituacaoEmAbertoConferir(dataBase(), COOP, "c-pos", ["2026-10", "2026-09"]),
  "",
  "meses mistos: não inventa rótulo"
);

const painel = readFileSync(join(ROOT, "src/components/notas/LancamentosEmAbertoPainel.tsx"), "utf8");
const montar = readFileSync(join(ROOT, "src/components/notas/montarRelatorioEmAbertoConferir.ts"), "utf8");
const view = readFileSync(join(ROOT, "src/components/notas/LancamentosEmAbertoPainelView.tsx"), "utf8");
assert.match(view, /Valor pendente/, "coluna mostra saldo pendente");
assert.match(painel, /montarRelatorioEmAbertoConferir/, "wrapper delega transformação pura");
assert.match(montar, /classificarSituacaoEmAbertoConferir/, "transformação classifica no fluxo extraído");
assert.match(painel, /useAppDataSelector/, "wrapper continua no lastro");
assert.match(view, /não é[\s\S]*cobrado de novo/, "banner separa PIX anterior do saldo");
assert.match(view, /não quita entrega posterior/, "banner: PIX anterior não quita entrega nova");
assert.doesNotMatch(painel, /updateData|saveDataSafe|pushOperacional/, "wrapper não grava financeiro");
assert.doesNotMatch(montar, /updateData|saveDataSafe|pushOperacional/, "transformação não grava financeiro");
assert.doesNotMatch(view, /updateData|saveDataSafe|pushOperacional/, "view não grava financeiro");
assert.doesNotMatch(montar, /\.startsWith\(/, "origem não usa prefixo");
assert.match(montar, /rowId === `\$\{r\.cooperadoId\}-\$\{m\.mes\}`/, "origem por igualdade do flatten");

resetResponsavelPainelIndexCache();
const vazio = getRelatorioLancamentosEmAbertoResponsavel(dataBase(), COOP);
assert.equal(vazio.length, 0, "sem ficha pendente o motor não inventa linha");

{
  const data = dataMemoria({
    cooperados: [cooperadoSyn("c-syn-sem", "Syn Sem Pix")],
    notasPedido: [
      notaSyn({ id: "n-syn-sem", cooperadoId: "c-syn-sem" }),
    ],
    fichaCorrida: [
      fichaSyn({ id: "f-syn-sem", cooperadoId: "c-syn-sem", notaPedidoId: "n-syn-sem" }),
    ],
  });
  const { porCooperado, linhasTabela, totalGeral, somaLinhas } = encadearConferirEmAberto(data);
  assert.equal(porCooperado.length, 1, "sem PIX: uma linha no motor");
  assert.equal(linhasTabela.length, 1);
  assert.equal(linhasTabela[0]?.situacao, SITUACAO_SEM_PIX_MES);
  assert.equal(totalGeral, somaLinhas, "totalGeral = soma das linhas");
  assert.equal(totalGeral, porCooperado[0]?.total);
  assert.ok(totalGeral > 0, "pendente sem PIX tem valor");
  console.log(`ok: sem PIX — situacao="${linhasTabela[0]?.situacao}" total=${totalGeral}=${somaLinhas}`);
}

{
  const data = dataMemoria({
    cooperados: [cooperadoSyn("c-syn-pos", "Syn Pos Pix")],
    notasPedido: [
      notaSyn({
        id: "n-syn-coberta",
        cooperadoId: "c-syn-pos",
        dataEntrega: "2026-10-02",
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
      notaSyn({
        id: "n-syn-pos",
        cooperadoId: "c-syn-pos",
        dataEntrega: "2026-10-25",
        createdAt: "2026-10-25T00:00:00.000Z",
        dataConferencia: "2026-10-25T12:00:00.000Z",
        valorBruto: 45,
        valorLiquido: 40,
      }),
    ],
    fichaCorrida: [
      fichaSyn({
        id: "f-syn-coberta",
        cooperadoId: "c-syn-pos",
        notaPedidoId: "n-syn-coberta",
      }),
      fichaSyn({
        id: "f-syn-pos",
        cooperadoId: "c-syn-pos",
        notaPedidoId: "n-syn-pos",
        valorBruto: 45,
        valorLiquido: 40,
        descontos: 5,
        dataLancamento: "2026-10-25T12:00:00.000Z",
        createdAt: "2026-10-25T12:00:00.000Z",
      }),
    ],
    pagamentosCooperado: [
      pixConfirmadoSyn({
        id: "pg-syn-pos",
        cooperadoId: "c-syn-pos",
        status: "confirmado",
        fichaIds: ["f-syn-coberta"],
        notaPedidoIds: ["n-syn-coberta"],
        pagoEm: "2026-10-09T12:00:00.000Z",
      }),
    ],
  });
  assert.equal(data.pagamentosCooperado[0]?.status, "confirmado");
  const { porCooperado, linhasTabela, totalGeral, somaLinhas } = encadearConferirEmAberto(data);
  assert.equal(porCooperado.length, 1, "entrega posterior: só o leftover fica no motor");
  assert.equal(linhasTabela.length, 1);
  assert.equal(linhasTabela[0]?.situacao, SITUACAO_ENTREGA_POS_PIX);
  assert.equal(totalGeral, somaLinhas, "totalGeral = soma das linhas");
  assert.equal(totalGeral, porCooperado[0]?.total);
  assert.equal(totalGeral, 40, "só o líquido da entrega fora do escopo do PIX");
  console.log(`ok: pos PIX — situacao="${linhasTabela[0]?.situacao}" total=${totalGeral}=${somaLinhas}`);
}

{
  const data = dataMemoria({
    cooperados: [cooperadoSyn("c-syn-misto", "Syn Misto")],
    notasPedido: [
      notaSyn({
        id: "n-syn-set",
        cooperadoId: "c-syn-misto",
        mesReferencia: "2026-09",
        dataEntrega: "2026-09-10",
        createdAt: "2026-09-10T00:00:00.000Z",
        dataConferencia: "2026-09-10T12:00:00.000Z",
        valorBruto: 80,
        valorLiquido: 70,
      }),
      notaSyn({
        id: "n-syn-misto-coberta",
        cooperadoId: "c-syn-misto",
        dataEntrega: "2026-10-02",
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
      notaSyn({
        id: "n-syn-misto-pos",
        cooperadoId: "c-syn-misto",
        dataEntrega: "2026-10-25",
        createdAt: "2026-10-25T00:00:00.000Z",
        dataConferencia: "2026-10-25T12:00:00.000Z",
        valorBruto: 45,
        valorLiquido: 40,
      }),
    ],
    fichaCorrida: [
      fichaSyn({
        id: "f-syn-set",
        cooperadoId: "c-syn-misto",
        notaPedidoId: "n-syn-set",
        mesReferencia: "2026-09",
        valorBruto: 80,
        valorLiquido: 70,
        descontos: 10,
        dataLancamento: "2026-09-10T12:00:00.000Z",
        createdAt: "2026-09-10T12:00:00.000Z",
      }),
      fichaSyn({
        id: "f-syn-misto-coberta",
        cooperadoId: "c-syn-misto",
        notaPedidoId: "n-syn-misto-coberta",
      }),
      fichaSyn({
        id: "f-syn-misto-pos",
        cooperadoId: "c-syn-misto",
        notaPedidoId: "n-syn-misto-pos",
        valorBruto: 45,
        valorLiquido: 40,
        descontos: 5,
        dataLancamento: "2026-10-25T12:00:00.000Z",
        createdAt: "2026-10-25T12:00:00.000Z",
      }),
    ],
    pagamentosCooperado: [
      pixConfirmadoSyn({
        id: "pg-syn-misto",
        cooperadoId: "c-syn-misto",
        status: "confirmado",
        fichaIds: ["f-syn-misto-coberta"],
        notaPedidoIds: ["n-syn-misto-coberta"],
        pagoEm: "2026-10-09T12:00:00.000Z",
      }),
    ],
  });
  const { porCooperado, linhasTabela, totalGeral, somaLinhas } = encadearConferirEmAberto(data);
  assert.equal(porCooperado.length, 1, "misto: um cooperado com dois meses pendentes");
  const mesesMotor = porCooperado[0]?.meses ?? [];
  assert.ok(mesesMotor.includes("2026-09") && mesesMotor.includes("2026-10"), "setembro e outubro no motor");
  const situacaoConjunto = classificarSituacaoEmAbertoConferir(
    data,
    COOP,
    porCooperado[0]?.cooperadoId ?? "",
    mesesMotor
  );
  assert.equal(situacaoConjunto, "", "meses mistos: classificação vazia");
  assert.equal(situacaoConjunto || "—", "—", "apresentação do vazio é —");
  assert.equal(totalGeral, somaLinhas, "totalGeral = soma das linhas flatten");
  assert.equal(totalGeral, porCooperado[0]?.total);
  assert.equal(totalGeral, 110, "setembro 70 + leftover outubro 40");
  console.log(`ok: misto — situacao="" apresentacao="—" total=${totalGeral}=${somaLinhas}`);
}

{
  const por = [
    { cooperadoId: "coop-1", porMes: [{ mes: "2026-09" }, { mes: "2026-10" }] },
    { cooperadoId: "coop-10", porMes: [{ mes: "2026-10" }] },
  ];
  assert.equal(origemLinhaEmAbertoConferir("coop-10-2026-10", por, true).origem?.cooperadoId, "coop-10");
  assert.deepEqual(origemLinhaEmAbertoConferir("coop-10-2026-10", por, true).meses, ["2026-10"]);
  const n = [
    { cooperadoId: "123", porMes: [{ mes: "2026-10" }] },
    { cooperadoId: "1234", porMes: [{ mes: "2026-10" }] },
  ];
  assert.equal(origemLinhaEmAbertoConferir("1234-2026-10", n, true).origem?.cooperadoId, "1234");
  const prefixo = [
    { cooperadoId: "abc", porMes: [{ mes: "2026-09" }, { mes: "2026-10" }] },
    { cooperadoId: "abc-def", porMes: [{ mes: "2026-10" }] },
  ];
  const hit = origemLinhaEmAbertoConferir("abc-def-2026-10", prefixo, true);
  assert.equal(hit.origem?.cooperadoId, "abc-def", "abc não é confundido com abc-def");
  assert.notEqual(hit.origem?.cooperadoId, "abc");
  assert.deepEqual(hit.meses, ["2026-10"]);
  assert.equal(origemLinhaEmAbertoConferir("ausente-2026-10", prefixo, true).origem, undefined);
  assert.deepEqual(origemLinhaEmAbertoConferir("ausente-2026-10", prefixo, true).meses, []);
  assert.equal(origemLinhaEmAbertoConferir("abc-def", prefixo, false).origem?.cooperadoId, "abc-def");
  console.log("ok: origem exata — coop-1/coop-10, 123/1234, abc/abc-def");
}

{
  const data = dataMemoria({
    cooperados: [cooperadoSyn("abc", "Curto"), cooperadoSyn("abc-def", "Longo")],
    notasPedido: [
      notaSyn({
        id: "n-abc-set",
        cooperadoId: "abc",
        mesReferencia: "2026-09",
        dataEntrega: "2026-09-10",
        createdAt: "2026-09-10T00:00:00.000Z",
        dataConferencia: "2026-09-10T12:00:00.000Z",
        valorBruto: 80,
        valorLiquido: 70,
      }),
      notaSyn({
        id: "n-abc-out",
        cooperadoId: "abc",
        dataEntrega: "2026-10-02",
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
      notaSyn({
        id: "n-def-coberta",
        cooperadoId: "abc-def",
        dataEntrega: "2026-10-02",
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
      notaSyn({
        id: "n-def-pos",
        cooperadoId: "abc-def",
        dataEntrega: "2026-10-25",
        createdAt: "2026-10-25T00:00:00.000Z",
        dataConferencia: "2026-10-25T12:00:00.000Z",
        valorBruto: 45,
        valorLiquido: 40,
      }),
    ],
    fichaCorrida: [
      fichaSyn({
        id: "f-abc-set",
        cooperadoId: "abc",
        notaPedidoId: "n-abc-set",
        mesReferencia: "2026-09",
        valorBruto: 80,
        valorLiquido: 70,
        descontos: 10,
        dataLancamento: "2026-09-10T12:00:00.000Z",
        createdAt: "2026-09-10T12:00:00.000Z",
      }),
      fichaSyn({ id: "f-abc-out", cooperadoId: "abc", notaPedidoId: "n-abc-out" }),
      fichaSyn({ id: "f-def-coberta", cooperadoId: "abc-def", notaPedidoId: "n-def-coberta" }),
      fichaSyn({
        id: "f-def-pos",
        cooperadoId: "abc-def",
        notaPedidoId: "n-def-pos",
        valorBruto: 45,
        valorLiquido: 40,
        descontos: 5,
        dataLancamento: "2026-10-25T12:00:00.000Z",
        createdAt: "2026-10-25T12:00:00.000Z",
      }),
    ],
    pagamentosCooperado: [
      pixConfirmadoSyn({
        id: "pg-def",
        cooperadoId: "abc-def",
        status: "confirmado",
        fichaIds: ["f-def-coberta"],
        notaPedidoIds: ["n-def-coberta"],
        pagoEm: "2026-10-09T12:00:00.000Z",
      }),
    ],
  });
  const { porCooperado, linhasTabela, totalGeral, somaLinhas } = encadearConferirEmAberto(data);
  const linhaDef = linhasTabela.find((l) => l.id === "abc-def-2026-10");
  assert.ok(linhaDef, "linha flatten de abc-def existe");
  assert.equal(linhaDef?.origemId, "abc-def", "origem exata, não o prefixo abc");
  assert.notEqual(linhaDef?.origemId, "abc");
  assert.deepEqual(linhaDef?.meses, ["2026-10"], "meses não ficam vazios");
  assert.equal(linhaDef?.situacao, SITUACAO_ENTREGA_POS_PIX);
  assert.equal(totalGeral, somaLinhas, "totalGeral = soma das linhas");
  assert.equal(totalGeral, porCooperado.reduce((s, r) => s + r.total, 0));
  console.log(
    `ok: prefixo abc/abc-def — origem=${linhaDef?.origemId} situacao="${linhaDef?.situacao}" total=${totalGeral}=${somaLinhas}`
  );
}

console.log("ok: clareza Conferir v479 — rótulos só apresentação");
