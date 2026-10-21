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
  staffEmAbertoUsaFichaDoPagarNaoFotoConferir,
  staffGestaoLastroPersisteNoAparelho,
} from "../src/lib/responsavel/responsavelConferirEntregasContrato.ts";
import {
  deveRecuperarFilaConferirVazia,
  getRelatorioLancamentosEmAbertoResponsavel,
  listNotasFilaConferenciaResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import type { FichaCorrida } from "../src/types/index.ts";
import {
  buildPendentesEstaveisConferencia,
  fundirFilaConferirComLastro,
} from "../src/utils/filaConferenciaSticky.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

assert.equal(RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION, 2);
assert.equal(RESPONSAVEL_CONFERIR_ENTREGAS_TITULO, "Conferir entregas");
assert.equal(RESPONSAVEL_CONFERIR_EM_ABERTO_TITULO, "Em aberto");
assert.equal(staffConferirPintaLastroNaHora(), true);
assert.equal(staffConferirFilaNaoSomeSemLancamento(), true);
assert.equal(staffEmAbertoNaoResetaCacheAoAbrir(), true);
assert.equal(staffGestaoLastroPersisteNoAparelho(), true);
assert.equal(staffEmAbertoUsaFichaDoPagarNaoFotoConferir(), true);

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

const evidenciaLancada = {
  notasPedido: [lancada],
  fichaCorrida: [{ notaPedidoId: "n-pendente" }],
};
const naoVolta = fundirFilaConferirComLastro([], [nota], evidenciaLancada);
assert.equal(naoVolta.length, 0, "F5/lastro não devolve foto já lançada na ficha");

const stickyF5 = { ids: new Set(["n-pendente"]), snapshot: new Map([["n-pendente", nota]]) };
const aposF5ComFicha = buildPendentesEstaveisConferencia(
  {
    ...dataCheia,
    notasPedido: [{ ...nota, status: "aguardando_conferencia" }],
    fichaCorrida: [{ notaPedidoId: "n-pendente" } as never],
  } as AppData,
  [nota],
  new Set(),
  COOP,
  stickyF5
);
assert.equal(aposF5ComFicha.length, 0, "status velho + ficha existente some do Conferir");

const leituraLastro = {
  ...dataCheia,
  notasPedido: [{ ...nota, valorLiquido: 180, status: "aguardando_conferencia" as const }],
} as AppData;
const liveComFichaEValor = {
  ...dataCheia,
  notasPedido: [{ ...lancada, valorLiquido: 180 }],
  fichaCorrida: [{ notaPedidoId: "n-pendente" } as never],
} as AppData;
resetResponsavelPainelIndexCache();
const filaAposLancamento = listNotasFilaConferenciaResponsavel(liveComFichaEValor, COOP);
assert.equal(filaAposLancamento.length, 0, "valor já na ficha some da lista do Conferir");
assert.equal(
  deveRecuperarFilaConferirVazia(leituraLastro, liveComFichaEValor, COOP),
  false,
  "fila vazia depois do lançamento não dispara recuperação da nuvem"
);
assert.equal(
  deveRecuperarFilaConferirVazia(leituraLastro, dataVazio, COOP),
  true,
  "lastro com foto sem ficha ainda pode recuperar a fila"
);

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
assert.match(handler, /setFiltroCooperadoId\(""\)/, "Em aberto abre com todos os cooperados");
assert.match(
  staff,
  /isAppDataWarm\(\) \? getData\(\)/,
  "Em aberto lê o lastro real, não só a foto do Conferir"
);
assert.match(staff, /scheduleStaffConferirFilaPrimeiroPull/, "primeiro pull pinta e busca no primeiro frame");
assert.match(
  staff,
  /deveRecuperarFilaConferirVazia/,
  "fila vazia após lançar não puxa de volta o valor da nuvem"
);
assert.match(staff, /LancamentosEmAbertoPainelView/, "Em aberto pinta a View do lastro na hora");
assert.match(
  staff,
  /listNotasFilaConferenciaDeDados\(d, coopId\)\.length > 0/,
  "fila quente lê o snapshot, não o cache da revisão vazia"
);

const stickySrc = read("src/utils/filaConferenciaSticky.ts");
assert.match(stickySrc, /fonte = atual \?\? sticky\.snapshot\.get/, "sticky guarda o card se a nota sumiu");
assert.match(stickySrc, /notaLancadaNaFichaCorrida/, "lastro não reabre nota já na ficha");

const painel = read("src/services/responsavelPainelIndex.ts");
assert.match(painel, /notaLancadaNaFichaCorrida\(data\.fichaCorrida/, "fila some quando a ficha já tem a nota");

const guard = read("src/lib/staff/staffGestaoSnapshotGuard.ts");
assert.match(guard, /localStorage\.setItem\(key, json\)/, "lastro sobrevive fechar o PWA");
assert.match(guard, /localStorage\.getItem\(key\)/, "reabre o lastro do aparelho");

const poll = read("src/lib/performance/staffFilaNotasLivePoll.ts");
assert.match(poll, /export function scheduleStaffConferirFilaPrimeiroPull/);

const regra = read(".cursor/rules/responsavel-conferir-entregas.mdc");
assert.match(regra, /RESPONSAVEL_CONFERIR_ENTREGAS_CONTRATO_VERSION/);
assert.match(regra, /appDataParaConferirLeitura/, "contrato trava não usar só a foto do Conferir");

const fichaAberta = {
  id: "f-aberto",
  cooperadoId: "c-1",
  cooperativaId: COOP,
  mesReferencia: "2026-10",
  notaPedidoId: "n-pendente",
  status: "pendente",
  valorBruto: 110,
  valorLiquido: 100,
  descontos: 10,
  descricao: "aberto",
  dataLancamento: "2026-10-02T00:00:00.000Z",
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
} as FichaCorrida;
const dataComFicha = {
  ...dataCheia,
  cooperados: [
    {
      id: "c-1",
      nomeCompleto: "Maria Entrega",
      cooperativaId: COOP,
      status: "ativo",
      chavePix: "maria@pix",
    },
  ],
  notasPedido: [
    {
      ...nota,
      cooperadoId: "c-1",
      mesReferencia: "2026-10",
      status: "conferida",
      valorLiquido: 100,
      valorBruto: 110,
    } as NotaPedido,
  ],
  fichaCorrida: [fichaAberta],
} as AppData;
const fotoConferirMarcouPago = {
  ...dataComFicha,
  notasPedido: dataComFicha.notasPedido.map((n) => ({ ...n, status: "pago" as const })),
  fichaCorrida: dataComFicha.fichaCorrida.map((f) => ({ ...f, status: "pago" as const })),
} as AppData;
resetResponsavelPainelIndexCache();
const emAbertoAposFoto = getRelatorioLancamentosEmAbertoResponsavel(fotoConferirMarcouPago, COOP);
assert.equal(emAbertoAposFoto.length, 1, "Em aberto lista o cooperado mesmo se o Conferir marcou pago");
assert.equal(emAbertoAposFoto[0]?.cooperado, "Maria Entrega");
assert.equal(emAbertoAposFoto[0]?.total, 100, "Em aberto mostra o valor da ficha sem PIX");

console.log("ok: contrato Conferir entregas + Em aberto — lastro na hora, nota só sai no lançamento");
