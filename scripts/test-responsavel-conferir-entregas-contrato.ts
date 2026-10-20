/**
 * Contrato Conferir entregas + Em aberto — lastro na hora, nota só sai no lançamento.
 * npx tsx scripts/test-responsavel-conferir-entregas-contrato.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import type { AppData, NotaPedido } from "../src/types/index.ts";
import {
  RESPONSAVEL_CONFERIR_EM_ABERTO_TITULO,
  RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION,
  RESPONSAVEL_CONFERIR_ENTREGAS_TITULO,
  staffConferirFilaNaoSomeSemLancamento,
  staffConferirPintaLastroNaHora,
  staffEmAbertoNaoResetaCacheAoAbrir,
  staffGestaoLastroPersisteNoAparelho,
} from "../src/lib/responsavel/responsavelConferirEntregasContrato.ts";
import {
  buildPendentesEstaveisConferencia,
  fundirFilaConferirComLastro,
} from "../src/utils/filaConferenciaSticky.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert.equal(RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION, 1);
assert.equal(RESPONSAVEL_CONFERIR_ENTREGAS_TITULO, "Conferir entregas");
assert.equal(RESPONSAVEL_CONFERIR_EM_ABERTO_TITULO, "Em aberto");
assert.equal(staffConferirPintaLastroNaHora(), true);
assert.equal(staffConferirFilaNaoSomeSemLancamento(), true);
assert.equal(staffEmAbertoNaoResetaCacheAoAbrir(), true);
assert.equal(staffGestaoLastroPersisteNoAparelho(), true);

const COOP = "coop-conferir-lock";
const nota: NotaPedido = {
  id: "n-pendente",
  cooperativaId: COOP,
  cooperadoId: "c-1",
  instituicaoId: "i-1",
  numeroNota: "001",
  dataEntrega: "2026-10-19",
  localEntrega: "",
  itens: [],
  valorBruto: 0,
  percentualDescontoCooperativa: 0,
  valorDesconto: 0,
  valorLiquido: 0,
  status: "aguardando_conferencia",
  createdAt: "2026-10-19T12:00:00.000Z",
  updatedAt: "2026-10-19T12:00:00.000Z",
} as NotaPedido;

const dataCheia = {
  ...emptyInitialData,
  cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" } as never],
  notasPedido: [nota],
} as AppData;

const dataVazio = {
  ...emptyInitialData,
  cooperativas: [{ id: COOP, nome: "Coop", cnpj: "00000000000191", status: "ativa" } as never],
  notasPedido: [],
} as AppData;

const sticky = { ids: new Set(["n-pendente"]), snapshot: new Map([["n-pendente", nota]]) };
const visiveis = buildPendentesEstaveisConferencia(dataVazio, [], new Set(), COOP, sticky);
assert.equal(visiveis.length, 1, "nota some do snapshot e continua na fila");
assert.equal(visiveis[0].id, "n-pendente");

const lancada: NotaPedido = { ...nota, status: "conferida", dataConferencia: "2026-10-20T12:00:00.000Z" };
const dataLancada = { ...dataCheia, notasPedido: [lancada] } as AppData;
const sticky2 = { ids: new Set(["n-pendente"]), snapshot: new Map([["n-pendente", nota]]) };
const aposLancamento = buildPendentesEstaveisConferencia(
  dataLancada,
  [],
  new Set(),
  COOP,
  sticky2
);
assert.equal(aposLancamento.length, 0, "nota lançada na ficha sai da fila");

const fundido = fundirFilaConferirComLastro([], [nota]);
assert.equal(fundido.length, 1, "lastro devolve a nota que o live esvaziou");

const staff = read("src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx");
const handler = staff.match(
  /const abrirLancamentosAbertoResponsavel = \(\) => \{[\s\S]*?\n  \};/
)?.[0];
assert.ok(handler, "handler de abertura Em aberto existe");
assert.doesNotMatch(
  handler,
  /resetResponsavelPainelIndexCache/,
  "abrir Em aberto não zera o lastro"
);
assert.match(staff, /scheduleStaffConferirFilaPrimeiroPull/, "primeiro pull pinta e busca no primeiro frame");
assert.match(staff, /LancamentosEmAbertoPainelView/, "Em aberto pinta a View do lastro na hora");
assert.match(
  staff,
  /listNotasFilaConferenciaDeDados\(d, coopId\)\.length > 0/,
  "fila quente lê o snapshot, não o cache da revisão vazia"
);

const stickySrc = read("src/utils/filaConferenciaSticky.ts");
assert.match(stickySrc, /fonte = atual \?\? sticky\.snapshot\.get/, "sticky guarda o card se a nota sumiu");

const guard = read("src/lib/staff/staffGestaoSnapshotGuard.ts");
assert.match(guard, /localStorage\.setItem\(key, json\)/, "lastro sobrevive fechar o PWA");
assert.match(guard, /localStorage\.getItem\(key\)/, "reabre o lastro do aparelho");

const poll = read("src/lib/performance/staffFilaNotasLivePoll.ts");
assert.match(poll, /export function scheduleStaffConferirFilaPrimeiroPull/);

const regra = read(".cursor/rules/responsavel-conferir-entregas.mdc");
assert.match(regra, /RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION/);

console.log("ok: contrato Conferir entregas + Em aberto — lastro na hora, nota só sai no lançamento");
