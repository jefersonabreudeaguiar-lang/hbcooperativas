/**
 * BIC Etapa 2 — paridade cliente (sync + posProcessar + BIC) × servidor (buildMinimal autoritativo).
 * npx tsx scripts/test-bic-client-server-parity.ts
 */
import assert from "node:assert/strict";
import type {
  AppData,
  ArquivoMensalCooperado,
  Cooperado,
  Desconto,
  FichaCorrida,
  NotaPedido,
  PagamentoCooperadoRegistro,
} from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import {
  buildMinimalAppDataForCreditBase,
  buildCreditosBaseAuthoritativeFromCloud,
} from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import {
  buildCreditosBaseMap,
  getCreditoBaseContaCoopReais,
  resetCreditosBaseMapCache,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { posProcessarFinanceiroLocal } from "../src/services/operacionalLocalPostProcess.ts";
import { projetarAppDataFinanceiroParaCreditoBase } from "../src/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase.ts";
import {
  avaliarFullResetOperacionalPullSeguro,
  aplicarOperacionalPullLocalForTests,
  syncOperacionalPullPipelineForTests,
} from "../src/services/cooperativaSyncCloudService.ts";
import { mergeCloudNotasIntoData } from "../src/services/notaPedidoCloudService.ts";
import {
  clearCloudResetAppliedVersionForTests,
  clearOperacionalPullMergedWatermarkForTests,
  setCloudResetAppliedVersionForTests,
  setOperacionalCloudAuthoritativeForTests,
} from "../src/services/operationalReset.ts";
import { mergeContaCoopDescontosFieldSync } from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import { operacionalDominioFornecidoNoPayload } from "../src/services/operacionalMergeSemantics.ts";

const COOP = "coop-par";
const COOPERADO = "c_par";
const MES = "2026-09";
const CNPJ = "62351750000165";
const VER = 20;

type ParityRow = {
  id: string;
  sameFacts: boolean;
  clientFacts: string;
  serverFacts: string;
  clientCents: number;
  serverCents: number;
  clientM6: number;
  serverM6: number;
  equal: boolean;
  divergenceReason: string;
};

const rows: ParityRow[] = [];

function factsCliente(local: AppData, cloud: OperacionalSyncPayload): string {
  const pagN = local.pagamentosCooperado?.length ?? 0;
  const pagC = cloud.pagamentosCooperado?.length ?? 0;
  const descL = local.descontos?.length ?? 0;
  const descC = operacionalDominioFornecidoNoPayload(cloud, "descontos")
    ? String(cloud.descontos?.length ?? 0)
    : "ausente";
  return `fichaL=${local.fichaCorrida?.length ?? 0} pagL=${pagN} descL=${descL} cloudPag=${pagC} cloudDesc=${descC} fullReset=${Boolean(cloud.fullReset)}`;
}

function factsServidor(cloud: OperacionalSyncPayload, notas: NotaPedido[]): string {
  const descC = operacionalDominioFornecidoNoPayload(cloud, "descontos")
    ? String(cloud.descontos?.length ?? 0)
    : "ausente";
  return `notas=${notas.length} fichaC=${cloud.fichaCorrida?.length ?? 0} pagC=${cloud.pagamentosCooperado?.length ?? 0} descC=${descC} arqC=${cloud.arquivosMensais?.length ?? 0}`;
}

function divergenceReasonFor(r: Omit<ParityRow, "divergenceReason">): string {
  if (r.equal) return "—";
  if (!r.sameFacts) {
    return "o servidor não possui o mesmo fato que existe no AppData cliente";
  }
  return "INACEITÁVEL: divergência com mesmos fatos";
}

function pag(
  id: string,
  status: PagamentoCooperadoRegistro["status"],
  updatedAt: string
): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    status,
    valorBruto: 500,
    valorLiquido: 500,
    descontoCooperativa: 0,
    descontosExtras: [],
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
    pagoEm: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

function mkNota(id = "n1", valor = 500): NotaPedido {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    instituicaoId: "i1",
    numeroNota: id,
    mesReferencia: MES,
    status: "conferida",
    valorBruto: valor,
    valorLiquido: valor,
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: valor, valorBruto: valor }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  } as NotaPedido;
}

function mkFicha(status: FichaCorrida["status"] = "pendente", id = "f1"): FichaCorrida {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: "n1",
    mesReferencia: MES,
    status,
    valorBruto: 500,
    descontos: 0,
    valorLiquido: 500,
    descricao: "n1",
    dataLancamento: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
  } as FichaCorrida;
}

function desconto(id: string, valor = 10): Desconto {
  return {
    id,
    cooperadoId: COOPERADO,
    tipo: "manual",
    motivo: "M",
    data: "2026-09-01",
    responsavel: "a",
    valorBruto: valor,
    valorDescontado: valor,
    valorLiquido: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function cooperados(): Cooperado[] {
  return [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "P", status: "ativo", createdAt: "" }];
}

function shell(local: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: cooperados(),
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    descontos: [],
    mensalidades: [],
    arquivosMensais: [],
    comunicados: [],
    instituicoes: [{ id: "i1", cooperativaId: COOP, nome: "I", createdAt: "" }],
    produtosInstituicao: [],
    cotas: [],
    pagamentos: [],
    config: { descontoPadraoCooperativa: 5 },
    ...local,
  } as AppData;
}

function clientView(local: AppData, cloud: OperacionalSyncPayload, notas: NotaPedido[]): AppData {
  let data = mergeCloudNotasIntoData(local, notas, CNPJ);
  data = syncOperacionalPullPipelineForTests(data, cloud, COOP, CNPJ).data;
  return data;
}

/** Pull operacional sem restore legado (evita reapply stale apagar notas conferidas antes do merge). */
function clientViewPullMergeOnly(
  local: AppData,
  cloud: OperacionalSyncPayload,
  notas: NotaPedido[]
): AppData {
  const data = mergeCloudNotasIntoData(local, notas, CNPJ);
  return aplicarOperacionalPullLocalForTests(data, cloud, COOP, CNPJ).data;
}

function serverView(cloud: OperacionalSyncPayload, notas: NotaPedido[]): {
  cents: Record<string, number>;
  data: AppData;
} {
  resetCreditosBaseMapCache();
  const cents = buildCreditosBaseAuthoritativeFromCloud(
    cloud,
    COOP,
    CNPJ,
    [COOPERADO],
    cooperados(),
    notas
  );
  const data = buildMinimalAppDataForCreditBase({
    operacional: cloud,
    cooperativaId: COOP,
    cnpj: CNPJ,
    cooperados: cooperados(),
    notasPedido: notas,
  });
  return { cents, data };
}

function compareCase(
  id: string,
  sameFacts: boolean,
  local: AppData,
  cloud: OperacionalSyncPayload,
  notas: NotaPedido[],
  opts?: { pullMergeOnly?: boolean }
): void {
  setOperacionalCloudAuthoritativeForTests(null);
  resetCreditosBaseMapCache();
  const clientData = opts?.pullMergeOnly
    ? clientViewPullMergeOnly(local, cloud, notas)
    : clientView(local, cloud, notas);
  const clientCents = buildCreditosBaseMap(clientData, [COOPERADO], COOP)[COOPERADO] ?? 0;
  const clientM6 = getCreditoBaseContaCoopReais(clientData, COOPERADO, COOP);

  const { cents: serverMap, data: serverData } = serverView(cloud, notas);
  const serverCents = serverMap[COOPERADO] ?? 0;
  const serverM6 = getCreditoBaseContaCoopReais(serverData, COOPERADO, COOP);

  const equal = clientCents === serverCents && Math.round(clientM6 * 100) === Math.round(serverM6 * 100);
  const base = {
    id,
    sameFacts,
    clientFacts: factsCliente(local, cloud),
    serverFacts: factsServidor(cloud, notas),
    clientCents,
    serverCents,
    clientM6,
    serverM6,
    equal,
  };
  rows.push({ ...base, divergenceReason: divergenceReasonFor(base) });
}

function pushRowManual(
  id: string,
  sameFacts: boolean,
  clientFacts: string,
  serverFacts: string,
  clientCents: number,
  serverCents: number,
  clientM6: number,
  serverM6: number
): void {
  const equal = clientCents === serverCents && Math.round(clientM6 * 100) === Math.round(serverM6 * 100);
  const base = {
    id,
    sameFacts,
    clientFacts,
    serverFacts,
    clientCents,
    serverCents,
    clientM6,
    serverM6,
    equal,
  };
  rows.push({ ...base, divergenceReason: divergenceReasonFor(base) });
}

clearCloudResetAppliedVersionForTests(CNPJ);
clearOperacionalPullMergedWatermarkForTests(CNPJ);
setCloudResetAppliedVersionForTests(CNPJ, VER);

const notas1 = [mkNota()];
const cloudBase = (): OperacionalSyncPayload =>
  ({
    updatedAt: "2026-09-20T12:00:00.000Z",
    fullReset: true,
    operationalResetVersion: VER,
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [],
    config: { descontoPadraoCooperativa: 5 },
  }) as OperacionalSyncPayload;

// T1 / C1 — pendente, mesmos fatos só na nuvem (local vazio pós-notas)
compareCase(
  "T1_pendente_cloud_only",
  true,
  shell({ notasPedido: notas1 }),
  cloudBase(),
  notas1
);

// T10 — snapshot completo + descontos [] legítimo (mesmos fatos; sem stale local)
compareCase(
  "T10_snapshot_completo_vazio_legitimo",
  true,
  shell({ notasPedido: notas1, fichaCorrida: [mkFicha()] }),
  {
    ...cloudBase(),
    operacionalSnapshotComplete: true,
    descontos: [],
  } as OperacionalSyncPayload,
  notas1
);

// T11/T12 — domínio ausente vs [] (mesmos fatos no servidor; cliente preserva local — fatos DIFERENTES)
{
  const cloudAbsent = cloudBase();
  delete (cloudAbsent as { descontos?: Desconto[] }).descontos;
  assert.ok(!operacionalDominioFornecidoNoPayload(cloudAbsent, "descontos"));
  compareCase(
    "T11_dominio_ausente_cliente_tem_desconto",
    false,
    shell({ notasPedido: notas1, fichaCorrida: [mkFicha()], descontos: [desconto("d1")] }),
    cloudAbsent,
    notas1
  );
  compareCase(
    "T12_dominio_vazio_sem_complete",
    false,
    shell({ notasPedido: notas1, fichaCorrida: [mkFicha()], descontos: [desconto("d1")] }),
    { ...cloudBase(), descontos: [] } as OperacionalSyncPayload,
    notas1
  );
}

// Mesmos fatos: desconto autoritativo no operacional
compareCase(
  "T8_desconto_no_operacional",
  true,
  shell({ notasPedido: notas1, fichaCorrida: [mkFicha()] }),
  { ...cloudBase(), descontos: [desconto("d_cloud")] } as OperacionalSyncPayload,
  notas1
);

// T3 — fullReset autorizado (merge pull, sem restore legado que apagaria notas conferidas)
{
  clearCloudResetAppliedVersionForTests(CNPJ);
  const local = shell({
    notasPedido: notas1,
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [pag("p_stale", "aguardando_confirmacao", "2026-08-01T10:00:00.000Z")],
    descontos: [desconto("d_stale")],
  });
  const cloudT3 = {
    ...cloudBase(),
    fullReset: true,
    operationalResetVersion: VER,
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [],
    descontos: [],
    operacionalSnapshotComplete: true,
  } as OperacionalSyncPayload;
  assert.ok(
    avaliarFullResetOperacionalPullSeguro(local, cloudT3, COOP, CNPJ).permitirMergeAutoritativo,
    "T3 H814E allow"
  );
  compareCase("T3_fullReset_completo", true, local, cloudT3, notas1, { pullMergeOnly: true });
  setCloudResetAppliedVersionForTests(CNPJ, VER);
}

// T3 legado — pós-sync confirmado local × cloud aguardando (mesmos fatos pós-merge)
compareCase(
  "T3_pos_sync_confirmado_local_cloud_aguardando",
  true,
  shell({
    notasPedido: notas1,
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  }),
  {
    ...cloudBase(),
    pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
  } as OperacionalSyncPayload,
  notas1
);

// T3b — confirmado local × cloud aguardando: mesma projeção M6 (integridade monotônica)
{
  setOperacionalCloudAuthoritativeForTests(null);
  resetCreditosBaseMapCache();
  const localOnly = projetarAppDataFinanceiroParaCreditoBase(
    shell({
      notasPedido: notas1,
      fichaCorrida: [mkFicha("pendente")],
      pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
    }),
    CNPJ
  );
  const clientCents = buildCreditosBaseMap(localOnly, [COOPERADO], COOP)[COOPERADO] ?? 0;
  const clientM6 = getCreditoBaseContaCoopReais(localOnly, COOPERADO, COOP);
  const cloudAguardando = {
    updatedAt: "2026-09-20T12:00:00.000Z",
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
    config: { descontoPadraoCooperativa: 5 },
  } as OperacionalSyncPayload;
  const { cents: serverMap, data: serverData } = serverView(cloudAguardando, notas1);
  const serverCents = serverMap[COOPERADO] ?? 0;
  const serverM6 = getCreditoBaseContaCoopReais(serverData, COOPERADO, COOP);
  const equal = clientCents === serverCents && Math.round(clientM6 * 100) === Math.round(serverM6 * 100);
  pushRowManual(
    "T3b_confirmado_somente_local",
    true,
    factsCliente(
      shell({
        notasPedido: notas1,
        fichaCorrida: [mkFicha("pendente")],
        pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
      }),
      cloudAguardando
    ),
    factsServidor(cloudAguardando, notas1),
    clientCents,
    serverCents,
    clientM6,
    serverM6
  );
  assert.ok(equal, "T3b paridade M6");
}

// T4 — pagamento confirmado não regride após pull (status + M6)
{
  const local = shell({
    notasPedido: notas1,
    fichaCorrida: [mkFicha("pendente")],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  });
  const cloud = {
    ...cloudBase(),
    pagamentosCooperado: [pag("p1", "aguardando_confirmacao", "2026-09-20T12:00:00.000Z")],
  } as OperacionalSyncPayload;
  const after = clientView(local, cloud, notas1);
  const p = after.pagamentosCooperado?.find((x) => x.id === "p1");
  assert.equal(p?.status, "confirmado", "T4 status confirmado preservado");
  compareCase("T4_confirmado_nao_regride", true, local, cloud, notas1);
}

// Mesmos fatos: pagamento confirmado na nuvem + ficha paga
compareCase(
  "T2_ficha_paga_cloud_confirmado",
  true,
  shell({
    notasPedido: notas1,
    fichaCorrida: [mkFicha("pago")],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  }),
  {
    ...cloudBase(),
    fichaCorrida: [mkFicha("pago")],
    pagamentosCooperado: [pag("p1", "confirmado", "2026-09-01T10:00:00.000Z")],
  } as OperacionalSyncPayload,
  notas1
);

// T5 — HB no operacional (compra única)
{
  const arq: ArquivoMensalCooperado = {
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: MES,
    notaPedidoIds: ["n1"],
    pagamentoIds: [],
    updatedAt: "2026-09-01T10:00:00.000Z",
    contaCoopDescontos: [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "hb1",
      },
    ],
  };
  compareCase(
    "T5_hb_operacional_compra",
    true,
    shell({ notasPedido: notas1, fichaCorrida: [mkFicha()], arquivosMensais: [arq] }),
    { ...cloudBase(), arquivosMensais: [arq] } as OperacionalSyncPayload,
    notas1
  );

  // T6 — compra + estorno (mesmos fatos cliente/servidor)
  const arqEstorno: ArquivoMensalCooperado = {
    ...arq,
    contaCoopDescontos: [
      ...(arq.contaCoopDescontos ?? []),
      {
        motivo: "Estorno HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-06T00:00:00.000Z",
        hbTransactionId: "hb1_refund",
      },
    ],
  };
  compareCase(
    "T6_hb_compra_estorno",
    true,
    shell({ notasPedido: notas1, fichaCorrida: [mkFicha()], arquivosMensais: [arqEstorno] }),
    { ...cloudBase(), arquivosMensais: [arqEstorno] } as OperacionalSyncPayload,
    notas1
  );

  // T7 — múltiplas incidências HB distintas
  const arqMulti: ArquivoMensalCooperado = {
    ...arq,
    contaCoopDescontos: [
      {
        motivo: "Compra HB",
        valorReais: 25,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "hb_a",
      },
      {
        motivo: "Compra HB",
        valorReais: 15,
        tipo: "conta_coop",
        createdAt: "2026-09-07T00:00:00.000Z",
        hbTransactionId: "hb_b",
      },
    ],
  };
  compareCase(
    "T7_hb_multiplas_incidencias",
    true,
    shell({ notasPedido: notas1, fichaCorrida: [mkFicha()], arquivosMensais: [arqMulti] }),
    { ...cloudBase(), arquivosMensais: [arqMulti] } as OperacionalSyncPayload,
    notas1
  );
}

// T9 snapshot parcial — cliente retém desconto local (fatos divergentes)
compareCase(
  "T9_parcial_desconto_so_local",
  false,
  shell({ notasPedido: notas1, fichaCorrida: [mkFicha()], descontos: [desconto("d1")] }),
  cloudBase(),
  notas1
);

// Ordem A→B idempotência cliente
{
  const local = shell({ notasPedido: notas1, fichaCorrida: [mkFicha()] });
  const cA = cloudBase();
  const cB = { ...cloudBase(), updatedAt: "2026-09-21T00:00:00.000Z" } as OperacionalSyncPayload;
  const d1 = clientView(local, cA, notas1);
  const d2 = clientView(d1, cB, notas1);
  resetCreditosBaseMapCache();
  const m1 = buildCreditosBaseMap(d2, [COOPERADO], COOP);
  resetCreditosBaseMapCache();
  const m2 = buildCreditosBaseMap(clientView(d2, cB, notas1), [COOPERADO], COOP);
  assert.deepEqual(m1, m2);
}

// posProcessar duplicado idempotente
{
  const data = clientView(shell({ notasPedido: notas1, fichaCorrida: [mkFicha()] }), cloudBase(), notas1);
  resetCreditosBaseMapCache();
  const a = buildCreditosBaseMap(data, [COOPERADO], COOP);
  const again = posProcessarFinanceiroLocal(data, CNPJ);
  resetCreditosBaseMapCache();
  const b = buildCreditosBaseMap(again, [COOPERADO], COOP);
  assert.deepEqual(a, b);
}

// HB merge SQL authority (isolado)
{
  const merged = mergeContaCoopDescontosFieldSync(
    [
      {
        motivo: "Compra HB",
        valorReais: 40,
        tipo: "conta_coop",
        createdAt: "2026-09-05T00:00:00.000Z",
        hbTransactionId: "x",
      },
    ],
    [{ motivo: "Compra HB", valorReais: 40, tipo: "conta_coop", createdAt: "2026-09-06T00:00:00.000Z" }]
  );
  assert.equal(merged.length, 1);
}

const sameFactsRows = rows.filter((r) => r.sameFacts);
const diffFactsRows = rows.filter((r) => !r.sameFacts);
const sameMatched = sameFactsRows.filter((r) => r.equal);
const sameDiverged = sameFactsRows.filter((r) => !r.equal);
const diffDiverged = diffFactsRows.filter((r) => !r.equal);

for (const r of rows.filter((x) => !x.equal)) {
  console.log(
    `DIVERGE ${r.id} sameFacts=${r.sameFacts} reason=${r.divergenceReason} client=${r.clientCents} server=${r.serverCents} m6c=${r.clientM6} m6s=${r.serverM6}`
  );
}

console.log("\nT1–T12 PARITY TABLE");
console.log("id\tsameFacts\tequal\tclientCents\tserverCents\tclientM6\tserverM6\tdivergenceReason");
for (const r of rows) {
  console.log(
    `${r.id}\t${r.sameFacts}\t${r.equal}\t${r.clientCents}\t${r.serverCents}\t${r.clientM6}\t${r.serverM6}\t${r.divergenceReason}`
  );
}

console.log(
  `PARITY_SUMMARY total=${rows.length} sameFacts=${sameFactsRows.length} sameMatched=${sameMatched.length} sameDiverged=${sameDiverged.length} diffFactsDiverged=${diffDiverged.length}`
);

for (const r of sameFactsRows) {
  assert.ok(r.equal, `paridade obrigatória (mesmos fatos): ${r.id}`);
}

for (const id of [
  "T9_parcial_desconto_so_local",
  "T11_dominio_ausente_cliente_tem_desconto",
  "T12_dominio_vazio_sem_complete",
]) {
  const r = rows.find((x) => x.id === id);
  assert.ok(r && !r.equal, `${id} deve divergir (fatos distintos)`);
}

console.log("OK — test-bic-client-server-parity");
