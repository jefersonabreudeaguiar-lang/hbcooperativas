/**
 * H8.9.36 — integração local do pipeline operacional (sem rede/Supabase/Storage).
 * Espelha:
 *   route POST operacional → sanitizar → H8.9.21 → uploadOperacionalSync (skip pagamento) → H8.9.35
 * Uso: npm run test:ficha-corrida-upload-integracao-h8936
 */
import assert from "node:assert/strict";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { sanitizarOperacionalSyncPayload } from "../src/services/pagamentoIntegridadeService.ts";
import { aplicarPreservacaoPagamentosConfirmadosNoOperacional } from "../src/services/pagamentoRegistroMerge.ts";
import { aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional } from "../src/services/fichaCorridaPagamentoGuard.ts";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService.ts";
import type { FichaCorrida, PagamentoCooperadoRegistro } from "../src/types/index.ts";

const PG_ID = "pg_1790011810612";
const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const COOPERADO = "c_1781981564381_w67gg";

function ficha(id: string, patch?: Partial<FichaCorrida>): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: `np_${id}`,
    descricao: `Ficha ${id}`,
    valorBruto: 100,
    descontos: 0,
    valorLiquido: 100,
    saldoAcumulado: 100,
    mesReferencia: "2026-08",
    status: "pendente",
    dataLancamento: "2026-08-01",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

function pagamentoPg179(fichaIds: string[], status: PagamentoCooperadoRegistro["status"] = "aguardando_confirmacao") {
  return {
    id: PG_ID,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: "2026-08",
    valorBruto: fichaIds.length * 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    valorLiquido: fichaIds.length * 100,
    fichaIds,
    notaPedidoIds: fichaIds.map((x) => `np_${x}`),
    status,
    pagoPor: "responsavel",
    pagoEm: "2026-08-15T12:00:00.000Z",
    createdAt: "2026-08-15T12:00:00.000Z",
  } satisfies PagamentoCooperadoRegistro;
}

function operacionalBase(
  fichaCorrida: FichaCorrida[],
  pagamentos: PagamentoCooperadoRegistro[],
  extra?: Partial<OperacionalSyncPayload>
): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    arquivosMensais: [],
    pagamentosCooperado: pagamentos,
    comunicados: [],
    mensalidades: [],
    descontos: [],
    fichaCorrida,
    config: { descontoPadraoCooperativa: 0 },
    ...extra,
  };
}

function ids(list: FichaCorrida[] | undefined): string[] {
  return (list ?? []).map((x) => x.id);
}

/**
 * Objeto final que uploadOperacionalSync enviaria ao Storage (uploadJson omitido).
 * Ordem idêntica à rota + uploadOperacionalSync(..., { skipPagamentoConfirmadoProtection: true }).
 */
function pipelineApiOperacionalUploadFinal(
  existing: OperacionalSyncPayload | null,
  rawIncoming: OperacionalSyncPayload
) {
  let payload = sanitizarOperacionalSyncPayload(rawIncoming, reconciliarFichaFromNotasConferidas);
  const pagPreserv = aplicarPreservacaoPagamentosConfirmadosNoOperacional(existing, payload);
  payload = pagPreserv.payload;

  let toUpload = payload;
  let conflitos: ReturnType<
    typeof aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional
  >["conflitos"] = [];
  let fichasRestauradasDaCloud: string[] = [];

  if (existing) {
    const fichaPreserv = aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional(
      existing,
      toUpload
    );
    toUpload = fichaPreserv.payload;
    conflitos = fichaPreserv.conflitos;
    fichasRestauradasDaCloud = fichaPreserv.fichasRestauradasDaCloud;
  }

  return {
    toUpload,
    blockedDowngrades: pagPreserv.blockedDowngrades,
    conflitos,
    fichasRestauradasDaCloud,
  };
}

/** Caminho direto uploadOperacionalSync (ex.: scripts com proteção pagamento inline). */
function pipelineUploadOperacionalSyncInMemory(
  existing: OperacionalSyncPayload | null,
  payload: OperacionalSyncPayload,
  skipPagamentoConfirmadoProtection: boolean
) {
  let toUpload = payload;
  if (!skipPagamentoConfirmadoProtection && existing) {
    const preserved = aplicarPreservacaoPagamentosConfirmadosNoOperacional(existing, payload);
    toUpload = preserved.payload;
  }
  if (existing) {
    const fichaPreserved = aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional(
      existing,
      toUpload
    );
    toUpload = fichaPreserved.payload;
  }
  return toUpload;
}

function fixturePg17936Cloud(): {
  cloud: OperacionalSyncPayload;
  fichaIds46: string[];
  materialized36: FichaCorrida[];
} {
  const fichaIds46 = Array.from({ length: 46 }, (_, i) => `fc_pg179_${String(i + 1).padStart(2, "0")}`);
  const materialized36 = fichaIds46.slice(0, 36).map((id) => ficha(id));
  const cloud = operacionalBase(materialized36, [pagamentoPg179(fichaIds46)]);
  return { cloud, fichaIds46, materialized36 };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`PASS — ${name}`);
}

test("A — pg_1790011810612 cloud 36 incoming vazio → 36 no payload final (API pipeline)", () => {
  const { cloud, fichaIds46 } = fixturePg17936Cloud();
  const incoming = operacionalBase([], [pagamentoPg179(fichaIds46)]);
  const { toUpload } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(toUpload.fichaCorrida!.length, 36);
  for (const id of fichaIds46.slice(0, 36)) {
    assert.ok(toUpload.fichaCorrida!.some((f) => f.id === id));
  }
});

test("B — cloud 36 + incoming 36 + nova D → 37 (API pipeline)", () => {
  const { cloud, materialized36 } = fixturePg17936Cloud();
  const pg = cloud.pagamentosCooperado;
  const incoming = operacionalBase([...materialized36, ficha("D")], pg);
  const { toUpload } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(toUpload.fichaCorrida!.length, 37);
  assert.ok(toUpload.fichaCorrida!.some((f) => f.id === "D"));
});

test("C — cloud 36 incoming parcial → nenhuma removida (API pipeline)", () => {
  const { cloud, materialized36 } = fixturePg17936Cloud();
  const parcial = materialized36.slice(0, 10);
  const incoming = operacionalBase(parcial, cloud.pagamentosCooperado);
  const { toUpload } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(toUpload.fichaCorrida!.length, 36);
});

test("D — conflito ficha X: cloud autoridade + conflito registrado", () => {
  const pg = pagamentoPg179(["X"]);
  const cloud = operacionalBase([ficha("X", { valorLiquido: 100 })], [pg]);
  const incoming = operacionalBase([ficha("X", { valorLiquido: 999 })], [pg]);
  const { toUpload, conflitos } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(conflitos.length, 1);
  assert.equal(toUpload.fichaCorrida![0]!.valorLiquido, 100);
});

test("E — nova ficha no incoming entra normalmente", () => {
  const cloud = operacionalBase([], [pagamentoPg179([])]);
  const incoming = operacionalBase([ficha("NOVA_1")], [pagamentoPg179([])]);
  const { toUpload } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.deepEqual(ids(toUpload.fichaCorrida), ["NOVA_1"]);
});

test("F — pagamentosCooperado inalterados pelo guard H8.9.35 (após H8.9.21)", () => {
  const { cloud, fichaIds46 } = fixturePg17936Cloud();
  const incoming = operacionalBase([], [pagamentoPg179(fichaIds46)]);
  const afterSanitize = sanitizarOperacionalSyncPayload(incoming, reconciliarFichaFromNotasConferidas);
  const afterPag = aplicarPreservacaoPagamentosConfirmadosNoOperacional(cloud, afterSanitize);
  const beforeFichaGuard = JSON.stringify(afterPag.payload.pagamentosCooperado);
  const fichaStep = aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional(
    cloud,
    afterPag.payload
  );
  assert.equal(JSON.stringify(fichaStep.payload.pagamentosCooperado), beforeFichaGuard);
  assert.equal(fichaStep.payload.pagamentosCooperado[0]!.valorLiquido, cloud.pagamentosCooperado[0]!.valorLiquido);
});

test("G — fullReset === true desativa H8.9.35", () => {
  const { cloud, fichaIds46 } = fixturePg17936Cloud();
  const incoming = operacionalBase([], [pagamentoPg179(fichaIds46)], { fullReset: true });
  const { toUpload } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(toUpload.fichaCorrida!.length, 0);
});

test("H — incoming sem pagamentosCooperado não remove fichas protegidas", () => {
  const { cloud, materialized36 } = fixturePg17936Cloud();
  const incoming = {
    ...operacionalBase([], []),
    pagamentosCooperado: undefined as unknown as PagamentoCooperadoRegistro[],
    fichaCorrida: [],
  };
  const { toUpload } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(toUpload.fichaCorrida!.length, 36);
});

test("I — REGRESSÃO REAL 36→36; 10 ausentes NÃO inventadas", () => {
  const { cloud, fichaIds46 } = fixturePg17936Cloud();
  const incoming = operacionalBase([], [pagamentoPg179(fichaIds46)]);
  const { toUpload, fichasRestauradasDaCloud } = pipelineApiOperacionalUploadFinal(cloud, incoming);
  assert.equal(toUpload.fichaCorrida!.length, 36);
  assert.equal(fichasRestauradasDaCloud.length, 36);
  const ausentes10 = fichaIds46.slice(36);
  for (const id of ausentes10) {
    assert.ok(!toUpload.fichaCorrida!.some((f) => f.id === id), `não inventar ${id}`);
  }
});

test("INTEG — uploadOperacionalSync in-memory (skip pagamento) coincide com API pipeline", () => {
  const { cloud, fichaIds46 } = fixturePg17936Cloud();
  const raw = operacionalBase([], [pagamentoPg179(fichaIds46)]);
  let payload = sanitizarOperacionalSyncPayload(raw, reconciliarFichaFromNotasConferidas);
  const pag = aplicarPreservacaoPagamentosConfirmadosNoOperacional(cloud, payload);
  payload = pag.payload;
  const viaUpload = pipelineUploadOperacionalSyncInMemory(cloud, payload, true);
  const viaApi = pipelineApiOperacionalUploadFinal(cloud, raw).toUpload;
  assert.deepEqual(ids(viaUpload.fichaCorrida).sort(), ids(viaApi.fichaCorrida).sort());
});

test("AUDIT — após H8.9.35 nenhuma mutação adicional antes do upload (uploadJson só serializa)", () => {
  const { cloud, fichaIds46 } = fixturePg17936Cloud();
  const { toUpload } = pipelineApiOperacionalUploadFinal(
    cloud,
    operacionalBase([], [pagamentoPg179(fichaIds46)])
  );
  const serialized = JSON.parse(JSON.stringify(toUpload)) as OperacionalSyncPayload;
  assert.equal(serialized.fichaCorrida!.length, 36);
  assert.equal(JSON.stringify(serialized.fichaCorrida), JSON.stringify(toUpload.fichaCorrida));
});

console.log(`\n${passed} testes OK (H8.9.36 integração writer fichaCorrida, sem rede).`);
