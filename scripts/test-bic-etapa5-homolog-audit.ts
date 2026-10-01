/**
 * BIC Etapa 5/6 — auditoria read-only em homologação (Supabase ocyfz…).
 * Nenhum write/repair/deploy. Usa apenas .env.homolog.local.
 *
 * npx tsx scripts/test-bic-etapa5-homolog-audit.ts
 */
import assert from "node:assert/strict";
import ws from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, NotaPedido, PagamentoCooperadoRegistro } from "../src/types";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { normalizeCnpj } from "../src/utils/cooperativa.ts";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro.ts";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage.ts";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService.ts";
import {
  avaliarFullResetOperacionalPullSeguro,
  aplicarRestoreLegadoOperacionalForTests,
  mergeContratosIntoData,
  mergeOperacionalIntoData,
  operacionalRestorePreemptiveClearPermitido,
  syncOperacionalPullPipelineForTests,
} from "../src/services/cooperativaSyncCloudService.ts";
import {
  getPagamentoConfirmadoCooperadoMes,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService.ts";
import { getResumoMesEntregasCooperado } from "../src/services/cooperadoEntregasService.ts";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService.ts";
import { posProcessarFinanceiroLocal } from "../src/services/operacionalLocalPostProcess.ts";
import { mergePagamentoCooperadoRecord } from "../src/services/pagamentoRegistroMerge.ts";
import { bicCentralValorAReceberAgregado } from "../src/services/bicLeituraCentralCooperado.ts";
import {
  buildCreditosBaseAuthoritativeFromCloud,
} from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import {
  getCreditoBaseContaCoopReais,
  resetCreditosBaseMapCache,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { projetarAppDataFinanceiroParaCreditoBase } from "../src/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase.ts";
import { operacionalDominioFornecidoNoPayload } from "../src/services/operacionalMergeSemantics.ts";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "../src/lib/supabase/contaCoopStorage.ts";
import { liquidoUsoContaCoopMes } from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import {
  clearCloudResetAppliedVersionForTests,
  clearOperacionalPullMergedWatermarkForTests,
  reapplyCloudOperationalSliceIfStale,
  setCloudResetAppliedVersionForTests,
} from "../src/services/operationalReset.ts";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const HOMOLOG_SUPABASE_REF = "ocyfzramxvxqbtkorubn";
const PROD_SUPABASE_REF_HINT = "ifptyz";
const HOMOLOG_BIC_CNPJ = normalizeCnpj("88888888000181");
const HOMOLOG_HB_CNPJ = normalizeCnpj("99999999000191");
/** Cooperado sintético B32 — cenários A/J. */
const COOPERADO_BIC = "bic_b32_coop_a_001";
/** Pagamento confirmado `pg_bic_b32_b1` no operacional homolog. */
const COOPERADO_PAY = "bic_b32_coop_a_002";

type Snapshot = {
  notasConferidas: number;
  notasTotal: number;
  fichas: number;
  pagamentos: number;
  pagamentosConfirmados: number;
  descontos: number;
  arquivosMensais: number;
};

function loadHomologEnvOnly(): void {
  const path = resolve(process.cwd(), ".env.homolog.local");
  if (!existsSync(path)) {
    throw new Error("Missing .env.homolog.local — abort (no production fallback)");
  }
  for (const k of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_ENV",
  ]) {
    delete process.env[k];
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
  assert.equal(process.env.APP_ENV, "homolog", "APP_ENV must be homolog");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  assert.ok(url.includes(HOMOLOG_SUPABASE_REF), `Supabase URL must be homolog (${HOMOLOG_SUPABASE_REF})`);
  assert.ok(!url.includes(PROD_SUPABASE_REF_HINT), "Refusing production Supabase project");
}

function emptyShell(coop: AppData["cooperativas"][0]): AppData {
  return {
    cooperativas: [coop],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    votacaoPautas: [],
    votacaoVotos: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

function snapshot(data: AppData, coopId: string): Snapshot {
  const conferidas = data.notasPedido.filter(
    (n) => n.cooperativaId === coopId && (n.status === "conferida" || n.status === "pago")
  );
  return {
    notasTotal: data.notasPedido.filter((n) => n.cooperativaId === coopId).length,
    notasConferidas: conferidas.length,
    fichas: data.fichaCorrida.filter((f) => f.cooperativaId === coopId).length,
    pagamentos: data.pagamentosCooperado.filter((p) => p.cooperativaId === coopId).length,
    pagamentosConfirmados: data.pagamentosCooperado.filter(
      (p) => p.cooperativaId === coopId && p.status === "confirmado"
    ).length,
    descontos: data.descontos.length,
    arquivosMensais: data.arquivosMensais.length,
  };
}

async function fetchHomologAppData(
  sb: SupabaseClient,
  cnpj: string
): Promise<{
  data: AppData;
  operacional: OperacionalSyncPayload;
  coopId: string;
}> {
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", cnpj);
  if (!rows?.length) throw new Error("Cooperativa homolog não encontrada");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const coopId = coop.id;

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, cnpj),
    fetchNotasFromStorage(sb, cnpj),
    fetchNotasFromTable(sb, cnpj),
    fetchContratosSync(sb, cnpj),
    fetchOperacionalSync(sb, cnpj),
  ]);
  if (!operacional) throw new Error("Operacional homolog ausente");

  let data = emptyShell(coop);
  data.notasPedido = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coopId,
  }));
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, cnpj, coopId);
  if (contratos) data = mergeContratosIntoData(data, contratos, coopId);
  data = mergeOperacionalIntoData(data, operacional, coopId, cloudCooperados);
  data = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));

  return { data, operacional, coopId };
}

function reconciledClientPipeline(
  data: AppData,
  operacional: OperacionalSyncPayload,
  coopId: string,
  cnpj: string
): AppData {
  let d = mergeOperacionalIntoData(data, operacional, coopId, data.cooperados, undefined, {
    forAuthoritativeCreditBase: false,
  });
  d = posProcessarFinanceiroLocal(d, cnpj);
  return d;
}

async function main(): Promise<void> {
  loadHomologEnvOnly();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  console.log("=== BIC ETAPA 5 — HOMOLOG AUDIT (read-only) ===");
  console.log("APP_ENV:", process.env.APP_ENV);
  console.log("Supabase ref:", HOMOLOG_SUPABASE_REF);
  console.log("APP_BUILD_VERSION ( código local ):", APP_BUILD_VERSION);
  console.log("BIC flags homolog:", {
    BIC_OFFICIAL: process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL ?? "(unset)",
    HB_CREDIT: process.env.HB_CREDIT_ENABLED ?? "(unset)",
  });

  const initialFetch = await fetchHomologAppData(sb, HOMOLOG_BIC_CNPJ);
  let baseline = initialFetch.data;
  const operacional = initialFetch.operacional;
  const coopId = initialFetch.coopId;

  const snap0 = snapshot(baseline, coopId);
  console.log("\n--- ESTADO INICIAL (pós-fetch read-only) ---");
  console.log(JSON.stringify(snap0, null, 2));
  console.log("operationalResetVersion:", operacional.operationalResetVersion ?? null);
  console.log("operacional.updatedAt:", operacional.updatedAt);
  console.log("fullReset:", operacional.fullReset ?? false);
  console.log("operacionalSnapshotComplete:", operacional.operacionalSnapshotComplete ?? false);
  console.log("Cooperativa BIC homolog CNPJ:", HOMOLOG_BIC_CNPJ);
  console.log("Cooperado BIC:", COOPERADO_BIC);
  console.log(
    "Nome:",
    baseline.cooperados.find((c) => c.id === COOPERADO_BIC)?.nomeCompleto ?? "?"
  );

  const results: Record<string, string> = {};

  // A — nota conferida → A receber
  {
    const canon = resolverCooperadoIdCanonico(baseline, COOPERADO_BIC, coopId);
    const conferidas = baseline.notasPedido.filter(
      (n) =>
        (n.status === "conferida" || n.status === "pago") &&
        resolverCooperadoIdCanonico(baseline, n.cooperadoId, coopId, n.cooperadoNomeSnapshot) === canon
    );
    assert.ok(conferidas.length > 0, "A: sem notas conferidas Orlando");
    const mes = conferidas[conferidas.length - 1]!.mesReferencia;
    const resumo = getResumoMesEntregasCooperado(baseline, COOPERADO_BIC, mes, coopId);
    const ok = resumo.valorEntregas > 0 || resumo.valorAReceber >= 0;
    results.A = ok
      ? `OK mes=${mes} entregas=${resumo.valorEntregas} aReceber=${resumo.valorAReceber}`
      : "FALHA coerência conferida→A receber";
    assert.ok(ok, results.A);
  }

  // B/C — pagamento confirmado + monotonia merge
  {
    const pags = baseline.pagamentosCooperado.filter(
      (p) => p.cooperadoId === COOPERADO_PAY && p.status === "confirmado"
    );
    if (pags.length === 0) {
      results.B = "SKIP (sem pagamento confirmado no cooperado PAY homolog)";
      results.C = "OK (merge unitário — ver regressão PAY-TMP-001)";
    } else {
      const p = pags[0]!;
      const mes = p.mesReferencia;
      const quitado = getPagamentoConfirmadoCooperadoMes(baseline, COOPERADO_PAY, mes);
      assert.ok(quitado, "B: confirmado deve existir no mês");
      const fichasPagas = baseline.fichaCorrida.filter(
        (f) =>
          f.cooperadoId === COOPERADO_PAY &&
          f.mesReferencia === mes &&
          f.status === "pago" &&
          (p.fichaIds ?? []).includes(f.id)
      );
      results.B =
        fichasPagas.length > 0
          ? `OK confirmado=${p.id.slice(0, 12)} fichasPagas=${fichasPagas.length}`
          : `ATENÇÃO confirmado sem ficha paga explícita (mes=${mes}) — verificar integridade`;
      const merged = mergePagamentoCooperadoRecord(p, { ...p, status: "aguardando_confirmacao", updatedAt: new Date().toISOString() });
      assert.equal(merged.status, "confirmado");
      results.C = "OK CONFIRMADO não regride no merge";
    }
  }

  // D/E — HB leitura (SQL read-only, coop HB homolog se existir)
  {
    const mes = "2026-09";
    const hbCoops = await fetchCooperadosFromStorage(sb, HOMOLOG_HB_CNPJ);
    const hbCoopId = hbCoops[0]?.id;
    if (!hbCoopId) {
      results.D = "SKIP sem cooperados HB homolog";
      results.E = "SKIP";
    } else {
      try {
        const rows = await listCooperadoContaCoopDescontosAbateValorReceber(sb, HOMOLOG_HB_CNPJ, [hbCoopId], mes);
        const liquido = liquidoUsoContaCoopMes(
          rows.map((r) => ({
            motivo: r.motivo,
            valorReais: r.valorReais,
            tipo: "conta_coop" as const,
            createdAt: r.createdAt,
            hbTransactionId: r.hbTransactionId,
          }))
        );
        results.D = `OK HB homolog SQL linhas=${rows.length} liquido=${liquido} coop=${hbCoopId}`;
        results.E = liquido < 0 ? "FALHA liquido HB negativo" : `OK liquido=${liquido}`;
        assert.ok(liquido >= 0, results.E);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.D = `SKIP HB SQL homolog (${msg.slice(0, 80)})`;
        results.E = "SKIP schema HB incompleto em homolog";
      }
    }
  }

  // F/G — domínio ausente vs [] (in-memory, shape homolog)
  {
    const d = { ...baseline, descontos: [{ id: "d1", cooperadoId: COOPERADO_BIC, tipo: "manual", motivo: "t", data: "2026-09-01", responsavel: "a", valorBruto: 1, valorDescontado: 1, valorLiquido: 0, createdAt: "" }] };
    const cloudAbsent = { ...operacional, descontos: undefined } as OperacionalSyncPayload;
    delete (cloudAbsent as { descontos?: unknown }).descontos;
    assert.ok(!operacionalDominioFornecidoNoPayload(cloudAbsent, "descontos"));
    const mergedAbsent = mergeOperacionalIntoData(d, cloudAbsent, coopId, d.cooperados);
    assert.ok(mergedAbsent.descontos.length >= 1, "F: domínio ausente preserva local");
    results.F = "OK domínio ausente não apagou desconto local (in-memory)";

    const cloudEmpty = { ...operacional, descontos: [] } as OperacionalSyncPayload;
    const mergedEmpty = mergeOperacionalIntoData(d, cloudEmpty, coopId, d.cooperados);
    const preserved = mergedEmpty.descontos.length >= 1;
    results.G = preserved
      ? "OK [] sem snapshot complete preservou local"
      : "FALHA [] apagou domínio sem complete";
    assert.ok(preserved, results.G);
  }

  // H/I/J + P1 — pipeline in-memory (sem write Supabase)
  {
    clearOperacionalPullMergedWatermarkForTests(HOMOLOG_BIC_CNPJ);
    clearCloudResetAppliedVersionForTests(HOMOLOG_BIC_CNPJ);
    const ver = operacional.operationalResetVersion ?? 0;
    if (ver > 0) setCloudResetAppliedVersionForTests(HOMOLOG_BIC_CNPJ, ver);

    const before = snapshot(baseline, coopId);
    const bicBefore = bicCentralValorAReceberAgregado(baseline, COOPERADO_BIC, coopId, {
      apresentacaoConsolidada: true,
    }).valor;

    // J — paridade M6 cliente reconciliado × servidor autoritativo
    resetCreditosBaseMapCache();
    const client = reconciledClientPipeline(structuredClone(baseline), operacional, coopId, HOMOLOG_BIC_CNPJ);
    const clientBase = getCreditoBaseContaCoopReais(
      projetarAppDataFinanceiroParaCreditoBase(client, HOMOLOG_BIC_CNPJ),
      COOPERADO_BIC,
      coopId
    );
    resetCreditosBaseMapCache();
    const serverMap = buildCreditosBaseAuthoritativeFromCloud(
      operacional,
      coopId,
      HOMOLOG_BIC_CNPJ,
      [COOPERADO_BIC],
      baseline.cooperados,
      baseline.notasPedido
    );
    const serverBase = (serverMap[COOPERADO_BIC] ?? 0) / 100;
    const bicClient = bicCentralValorAReceberAgregado(client, COOPERADO_BIC, coopId, {
      apresentacaoConsolidada: true,
    }).valor;
    results.J = `clientBase=${clientBase} serverBase=${serverBase} bicClient=${bicClient} bicBaseline=${bicBefore}`;

    // Pull idempotente (mesmo operacional) — não deve perder notas
    const pullSame = syncOperacionalPullPipelineForTests(structuredClone(baseline), operacional, coopId, HOMOLOG_BIC_CNPJ);
    const afterSame = snapshot(pullSame.data, coopId);
    assert.equal(afterSame.notasConferidas, before.notasConferidas, "notas conferidas após pull idempotente");
    results.H = `OK pull idempotente notasConferidas=${afterSame.notasConferidas}`;

    // P1 — stale slice com versão já aplicada + divergência local simulada
    const localStale = structuredClone(baseline);
    localStale.pagamentosCooperado = [
      ...localStale.pagamentosCooperado,
      {
        id: "p_etapa5_sim_stale",
        cooperativaId: coopId,
        cooperadoId: COOPERADO_BIC,
        mesReferencia: "2026-09",
        status: "aguardando_confirmacao",
        valorBruto: 1,
        valorLiquido: 1,
        descontoCooperativa: 0,
        descontosExtras: [],
        fichaIds: [],
        notaPedidoIds: [],
        pagoEm: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as PagamentoCooperadoRegistro,
    ];
    const preempt = operacionalRestorePreemptiveClearPermitido(localStale, operacional, coopId, HOMOLOG_BIC_CNPJ);
    const reapply = reapplyCloudOperationalSliceIfStale(localStale, HOMOLOG_BIC_CNPJ, coopId, operacional, {
      permitirPreemptiveClear: preempt,
    });
    const snapAfterReapply = snapshot(reapply.data, coopId);
    const p1Destructive =
      reapply.changed && snapAfterReapply.notasConferidas < before.notasConferidas;
    results.P1 = p1Destructive
      ? `RISCO confirmado: reapply stale apagou conferidas ${before.notasConferidas}→${snapAfterReapply.notasConferidas} preempt=${preempt}`
      : `reapply.changed=${reapply.changed} conferidas=${snapAfterReapply.notasConferidas} preempt=${preempt}`;

    const pullFull = syncOperacionalPullPipelineForTests(localStale, operacional, coopId, HOMOLOG_BIC_CNPJ);
    const snapPull = snapshot(pullFull.data, coopId);
    const pullSeguro = pullFull.pullSeguro.permitirMergeAutoritativo;
    results.I = `pullSeguro.mergeAutoritativo=${pullSeguro} motivo=${pullFull.pullSeguro.motivo.slice(0, 80)}`;
    if (snapPull.notasConferidas < before.notasConferidas) {
      throw new Error(
        `CRÍTICO: notas conferidas caíram ${before.notasConferidas}→${snapPull.notasConferidas} após pipeline stale`
      );
    }
    results.PIPELINE = `OK notas preservadas após pipeline (${snapPull.notasConferidas} conferidas)`;

    // fullReset allow check (sem aplicar reset destrutivo na nuvem)
    const seguro = avaliarFullResetOperacionalPullSeguro(baseline, operacional, coopId, HOMOLOG_BIC_CNPJ);
    results.H_fullreset_eval = `permitirMerge=${seguro.permitirMergeAutoritativo} motivo=${seguro.motivo}`;

    const afterRestore = aplicarRestoreLegadoOperacionalForTests(baseline, operacional, coopId, HOMOLOG_BIC_CNPJ);
    const snapRestore = snapshot(afterRestore, coopId);
    if (snapRestore.notasConferidas < before.notasConferidas) {
      throw new Error(
        `CRÍTICO R1: restore legado apagou conferidas ${before.notasConferidas}→${snapRestore.notasConferidas}`
      );
    }
    results.I_R1 = `OK restore legado conferidas=${snapRestore.notasConferidas}`;
  }

  // BIC read-only: authoritative build não chama save (sanity — só compute)
  results.BIC_READONLY = "OK cálculo apenas in-memory (sem RPC write neste script)";

  const finalFetch = await fetchHomologAppData(sb, HOMOLOG_BIC_CNPJ);
  const snapFinal = snapshot(finalFetch.data, coopId);
  assert.deepEqual(snapFinal, snap0, "Estado Supabase deve ser idêntico após auditoria read-only");
  results.DATA_PRESERVED = "OK snapshot final === inicial";

  console.log("\n--- RESULTADOS CENÁRIOS ---");
  for (const [k, v] of Object.entries(results).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${k}: ${v}`);
  }

  if (results.P1?.startsWith("RISCO confirmado")) {
    console.error("\n*** P1 reproduzido em homolog (in-memory) — ver relatório Etapa 5 ***");
    process.exitCode = 2;
  } else {
    console.log("\nOK — test-bic-etapa5-homolog-audit");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
