/**
 * Teste integrado isolado v479.1
 * AppData sintético em memória → transformação pura → View real via react-dom/server.
 * Não passa fixture por getData(), useAppDataSelector, localStorage, API ou persistência.
 * Não valida a tela autenticada real.
 * npx tsx scripts/test-conferir-em-aberto-integrado-v479.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppData, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  SITUACAO_ENTREGA_POS_PIX,
  SITUACAO_SEM_PIX_MES,
} from "../src/components/notas/conferirEmAbertoSituacao.ts";
import { LancamentosEmAbertoPainelView } from "../src/components/notas/LancamentosEmAbertoPainelView.tsx";
import {
  montarRelatorioEmAbertoConferir,
  origemLinhaEmAbertoConferir,
} from "../src/components/notas/montarRelatorioEmAbertoConferir.ts";
import { resetResponsavelPainelIndexCache } from "../src/services/responsavelPainelIndex.ts";
import { formatCurrency } from "../src/utils/format.ts";
import { getData, getDataOperationalTruth, isAppDataWarm } from "../src/services/dataStore.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const WRITE_SYMBOL =
  /requestAppSyncImmediate|saveDataSafe|pushOperacional|localStorage\.setItem|uploadOperacional/;
const IDS_SINTETICOS = [
  "c-syn-sem",
  "c-syn-pos",
  "c-syn-misto",
  "abc",
  "abc-def",
  "n-syn-sem",
  "f-syn-sem",
];

const networkCalls: string[] = [];
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  networkCalls.push(String(typeof input === "object" && "url" in input ? input.url : input));
  throw new Error(`teste isolado bloqueou fetch: ${String(input)}`);
}) as typeof fetch;

assert.equal(typeof globalThis.window, "undefined", "Node: sem window");
assert.equal(typeof globalThis.localStorage, "undefined", "Node: sem localStorage");

const COOP = "coop-syn-v479-int";

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
    cooperativas: [{ id: COOP, nome: "C syn int", cnpj: "1", active: true }],
    cooperados: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    ...partial,
  };
}

function assertLastroIntocado() {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.localStorage, "undefined");
  assert.equal(isAppDataWarm(), false, "lastro em memória não aqueceu");
  const live = getData();
  const truth = getDataOperationalTruth();
  for (const id of IDS_SINTETICOS) {
    assert.ok(
      !live.cooperados.some((c) => c.id === id) &&
        !live.notasPedido.some((n) => n.id === id) &&
        !live.fichaCorrida.some((f) => f.id === id),
      `getData() não recebeu fixture ${id}`
    );
    assert.ok(
      !truth.cooperados.some((c) => c.id === id) &&
        !truth.notasPedido.some((n) => n.id === id) &&
        !truth.fichaCorrida.some((f) => f.id === id),
      `getDataOperationalTruth() não recebeu fixture ${id}`
    );
  }
  assert.equal(networkCalls.length, 0, "nenhum fetch durante o teste");
}

function resolveFirstParty(fromFile: string, spec: string): string | null {
  if (spec.startsWith("node:") || spec.startsWith("react") || spec.startsWith("next")) return null;
  let abs: string;
  if (spec.startsWith("@/")) abs = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) abs = join(dirname(fromFile), spec);
  else return null;
  abs = normalize(abs);
  const candidates = [
    abs,
    `${abs}.ts`,
    `${abs}.tsx`,
    join(abs, "index.ts"),
    join(abs, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function walkFirstParty(entryFiles: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [...entryFiles];
  const importRe = /from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    if (!file.startsWith(normalize(join(ROOT, "src"))) && !file.startsWith(normalize(join(ROOT, "scripts")))) {
      continue;
    }
    const src = readFileSync(file, "utf8");
    seen.set(file, src);
    importRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      const next = resolveFirstParty(file, spec);
      if (next) queue.push(next);
    }
  }
  return seen;
}

function renderView(
  linhasTabela: ReturnType<typeof montarRelatorioEmAbertoConferir>["linhasTabela"],
  totalGeral: number,
  detalharPorMes: boolean,
  cooperadosCount: number
) {
  const html = renderToStaticMarkup(
    createElement(LancamentosEmAbertoPainelView, {
      linhasTabela,
      totalGeral,
      detalharPorMes,
      cooperadosCount,
    })
  );
  assert.match(html, /<table/, "DataTable real emitiu <table>");
  assert.match(html, /Situação/, "cabeçalho Situação");
  assert.match(html, /Valor pendente/, "cabeçalho Valor pendente");
  assert.match(html, /Total pendente a pagar/, "cartão de total");
  return html;
}

function encadear(data: AppData) {
  resetResponsavelPainelIndexCache();
  const relatorio = montarRelatorioEmAbertoConferir(data, COOP);
  const html = renderView(
    relatorio.linhasTabela,
    relatorio.totalGeral,
    relatorio.detalharPorMes,
    relatorio.porCooperado.length
  );
  assertLastroIntocado();
  return { ...relatorio, html };
}

{
  const entries = [
    join(ROOT, "scripts/test-conferir-em-aberto-integrado-v479.ts"),
    join(ROOT, "src/components/notas/montarRelatorioEmAbertoConferir.ts"),
    join(ROOT, "src/components/notas/LancamentosEmAbertoPainelView.tsx"),
  ];
  const graph = walkFirstParty(entries);
  const relPath = (file: string) =>
    file.replace(normalize(ROOT) + "\\", "").replace(normalize(ROOT) + "/", "").replace(/\\/g, "/");
  const writeFiles = [...graph.entries()]
    .filter(([file, src]) => WRITE_SYMBOL.test(src) && !file.endsWith("test-conferir-em-aberto-integrado-v479.ts"))
    .map(([file]) => relPath(file));
  const cadeiaPura = [
    "src/components/notas/montarRelatorioEmAbertoConferir.ts",
    "src/components/notas/LancamentosEmAbertoPainelView.tsx",
    "src/components/notas/conferirEmAbertoSituacao.ts",
    "src/services/relatorioService.ts",
  ];
  const puraComEscrita = writeFiles.filter((f) => cadeiaPura.includes(f));
  assert.equal(puraComEscrita.length, 0, `cadeia pura não pode ter escrita: ${puraComEscrita.join(", ")}`);
  const montarSrc = graph.get(normalize(join(ROOT, "src/components/notas/montarRelatorioEmAbertoConferir.ts"))) ?? "";
  const viewSrc = graph.get(normalize(join(ROOT, "src/components/notas/LancamentosEmAbertoPainelView.tsx"))) ?? "";
  const testSrc = readFileSync(entries[0], "utf8");
  assert.doesNotMatch(montarSrc, WRITE_SYMBOL, "transformação pura sem APIs de escrita");
  assert.doesNotMatch(viewSrc, WRITE_SYMBOL, "view sem APIs de escrita");
  assert.doesNotMatch(testSrc, /from\s+["'][^"']*useAppData["']/, "script não importa o hook do lastro");
  assert.match(testSrc, /dataMemoria/, "fixture só em memória");
  assert.ok(graph.size > 8, `grafo transitivo percorrido (${graph.size} arquivos first-party)`);
  assert.ok(
    writeFiles.some((f) => f.endsWith("src/services/dataStore.ts")),
    "motor puxa dataStore (getDataRevision/getDataOperationalTruth); escrita existe no módulo, não na cadeia chamada"
  );
  console.log(
    `ok: grafo ${graph.size} arquivos; escrita textual em ${writeFiles.length} módulos carregados (dataStore e dependentes); cadeia pura limpa`
  );
}

{
  const data = dataMemoria({
    cooperados: [cooperadoSyn("c-syn-sem", "Syn Sem Pix")],
    notasPedido: [notaSyn({ id: "n-syn-sem", cooperadoId: "c-syn-sem" })],
    fichaCorrida: [fichaSyn({ id: "f-syn-sem", cooperadoId: "c-syn-sem", notaPedidoId: "n-syn-sem" })],
  });
  const { linhasTabela, totalGeral, html } = encadear(data);
  assert.equal(linhasTabela.length, 1);
  assert.equal(linhasTabela[0]?.situacao, SITUACAO_SEM_PIX_MES);
  assert.equal(totalGeral, 100);
  assert.ok(html.includes(SITUACAO_SEM_PIX_MES), "rótulo sem PIX no HTML");
  assert.ok(html.includes(formatCurrency(100)), "total 100 no HTML");
  assert.ok(!html.includes(SITUACAO_ENTREGA_POS_PIX));
  console.log(`ok: integrado sem PIX — rótulo + total 100`);
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
      fichaSyn({ id: "f-syn-coberta", cooperadoId: "c-syn-pos", notaPedidoId: "n-syn-coberta" }),
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
  const { linhasTabela, totalGeral, html } = encadear(data);
  assert.equal(linhasTabela.length, 1);
  assert.equal(linhasTabela[0]?.situacao, SITUACAO_ENTREGA_POS_PIX);
  assert.equal(totalGeral, 40);
  assert.ok(html.includes(SITUACAO_ENTREGA_POS_PIX), "rótulo pos PIX no HTML");
  assert.ok(html.includes(formatCurrency(40)), "total 40 no HTML");
  assert.ok(!html.includes(formatCurrency(100)), "não duplica o PIX de 100");
  assert.ok(!html.includes(formatCurrency(110)), "não soma leftover com PIX");
  console.log(`ok: integrado pos PIX — leftover 40`);
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
  const { linhasTabela, totalGeral, detalharPorMes, html } = encadear(data);
  assert.ok(detalharPorMes, "dois meses: flatten detalha por mês");
  assert.equal(linhasTabela.length, 2, "uma linha por mês");
  const set = linhasTabela.find((l) => l.mesesLabel.toLowerCase().includes("setembro"));
  const out = linhasTabela.find((l) => l.mesesLabel.toLowerCase().includes("outubro"));
  assert.equal(set?.situacao, SITUACAO_SEM_PIX_MES);
  assert.equal(set?.total, 70);
  assert.equal(out?.situacao, SITUACAO_ENTREGA_POS_PIX);
  assert.equal(out?.total, 40);
  assert.equal(totalGeral, 110, "setembro 70 + leftover outubro 40");
  assert.ok(html.includes(SITUACAO_SEM_PIX_MES));
  assert.ok(html.includes(SITUACAO_ENTREGA_POS_PIX));
  assert.ok(html.includes(formatCurrency(70)));
  assert.ok(html.includes(formatCurrency(40)));
  assert.ok(html.includes(formatCurrency(110)), "total 110 no HTML");
  const htmlTraco = renderView(
    [{ ...linhasTabela[0]!, id: "misto-conjunto", situacao: "", total: 110, mesesLabel: "setembro e outubro 2026" }],
    110,
    false,
    1
  );
  assert.match(htmlTraco, />—</, "situacao vazia na View vira —");
  console.log(`ok: integrado misto — linhas 70/40 rotuladas; View — no conjunto; total 110`);
}

{
  const prefixo = [
    { cooperadoId: "abc", porMes: [{ mes: "2026-09" }, { mes: "2026-10" }] },
    { cooperadoId: "abc-def", porMes: [{ mes: "2026-10" }] },
  ];
  const hit = origemLinhaEmAbertoConferir("abc-def-2026-10", prefixo, true);
  assert.equal(hit.origem?.cooperadoId, "abc-def");
  assert.notEqual(hit.origem?.cooperadoId, "abc");

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
      notaSyn({ id: "n-abc-out", cooperadoId: "abc", dataEntrega: "2026-10-02", createdAt: "2026-10-02T00:00:00.000Z" }),
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
  const { linhasTabela, totalGeral, html } = encadear(data);
  const linhaDef = linhasTabela.find((l) => l.id === "abc-def-2026-10");
  assert.ok(linhaDef, "linha flatten de abc-def existe");
  assert.equal(linhaDef?.situacao, SITUACAO_ENTREGA_POS_PIX);
  assert.ok(!linhasTabela.some((l) => l.id === "abc-def-2026-10" && l.cooperado === "Curto"));
  const origemDef = origemLinhaEmAbertoConferir(
    "abc-def-2026-10",
    [
      { cooperadoId: "abc", porMes: [{ mes: "2026-09" }, { mes: "2026-10" }] },
      { cooperadoId: "abc-def", porMes: [{ mes: "2026-10" }] },
    ],
    true
  );
  assert.equal(origemDef.origem?.cooperadoId, "abc-def");
  assert.ok(html.includes("Longo") || html.includes("abc-def") || html.includes(SITUACAO_ENTREGA_POS_PIX));
  assert.equal(totalGeral, linhasTabela.reduce((s, r) => s + r.total, 0));
  console.log(
    `ok: integrado abc/abc-def — id=${linhaDef?.id} situacao="${linhaDef?.situacao}" total=${totalGeral}`
  );
}

assertLastroIntocado();
if (origFetch) globalThis.fetch = origFetch;

const srcFiles = readdirSync(join(ROOT, "src/components/notas")).filter((f) =>
  /montarRelatorioEmAbertoConferir|LancamentosEmAbertoPainelView|conferirEmAbertoSituacao/.test(f)
);
assert.ok(srcFiles.length >= 3);

console.log("ok: integrado v479.1 — sintético → montar → View SSR; lastro intocado");
console.log("LIMITAÇÃO: este teste não valida a tela autenticada Conferir → Em aberto.");
