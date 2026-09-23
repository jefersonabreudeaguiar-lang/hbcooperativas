/**
 * Diagnóstico ponta a ponta: backup storage → API (simulada) → merge cliente → badge Pagar.
 * node --import tsx scripts/diag-restore-pipeline-e2e.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { fetchNotasFromTable } from "../src/lib/supabase/notasStorage";
import { fetchCooperadosFromCloud, listCooperadosDaCooperativa } from "../src/services/cooperadoCloudService";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { posProcessarFinanceiroLocal } from "../src/services/operacionalLocalPostProcess";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";
import { clearOperacionalFinanceiroForCooperativa, clearOperationalDataForCooperativa } from "../src/services/operationalReset";
import { cooperadoPendentePagamentoResponsavel } from "../src/services/cooperadoEntregasService";
import {
  listarPagamentosAguardandoAssinatura,
  listarPagamentosReciboAguardandoVerificacao,
} from "../src/services/filaDoDiaService";
import { emptyInitialData } from "../src/mock/data";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const CNPJ = "62351750000165";
const COOP_ID = "06342dae-8191-4193-94b6-d0be3a82e10b";

function badge(data: AppData, coopId: string, restoreAtivo = false) {
  const aguard = listarPagamentosAguardandoAssinatura(data, coopId);
  const verif = listarPagamentosReciboAguardandoVerificacao(data, coopId);
  const paraPagar = listCooperadosDaCooperativa(data, coopId).filter((c) =>
    cooperadoPendentePagamentoResponsavel(data, c.id, undefined, coopId)
  );
  if (restoreAtivo) {
    const idsAguardando = new Set(aguard.map((p) => p.cooperadoId));
    const paraSemDup = paraPagar.filter((c) => !idsAguardando.has(c.id)).length;
    return {
      aguard: aguard.length,
      paraPagar: paraSemDup,
      verif: verif.length,
      total: paraSemDup + aguard.length + verif.length,
      paraPagarIds: paraPagar.filter((c) => !idsAguardando.has(c.id)).map((c) => c.id),
    };
  }
  return {
    aguard: aguard.length,
    paraPagar: paraPagar.length,
    verif: verif.length,
    total: aguard.length + paraPagar.length + verif.length,
    paraPagarIds: paraPagar.map((c) => c.id),
  };
}

function pagStats(data: AppData, coopId: string) {
  const p = data.pagamentosCooperado.filter((x) => x.cooperativaId === coopId);
  return {
    n: p.length,
    aguard: p.filter((x) => x.status === "aguardando_confirmacao").length,
  };
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  const { data: blob } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
  const rawOp = JSON.parse(await blob!.text());

  const apiOpNew = rawOp.fullReset === true ? rawOp : rawOp;

  const { notas } = await fetchNotasFromTable(sb, CNPJ);
  const { cooperados } = await fetchCooperadosFromCloud(CNPJ);

  const baseShell = (extra: Partial<AppData>): AppData => ({
    ...emptyInitialData,
    cooperativas: [
      {
        id: COOP_ID,
        cnpj: CNPJ,
        nome: "CoopeagriPla",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ],
    cooperados: cooperados.map((c) => ({ ...c, cooperativaId: COOP_ID })),
    notasPedido: notas.map((n) => ({ ...n, cooperativaId: COOP_ID })),
    ...extra,
  });

  // Cenário A: aparelho “ideal” pós-restore (só nuvem, sem reconciliar notas)
  let ideal = baseShell({});
  ideal = mergeOperacionalIntoData(ideal, apiOpNew, COOP_ID, cooperados);
  ideal = posProcessarFinanceiroLocal(ideal, CNPJ);

  // Cenário B: bug antigo — merge + reconciliar notas (infla fila)
  let bugReconciliar = baseShell({});
  bugReconciliar = mergeOperacionalIntoData(bugReconciliar, apiOpNew, COOP_ID, cooperados);
  bugReconciliar = posProcessarIntegridadeLegacy(bugReconciliar);

  // Cenário C: local stale (22 pagamentos fictícios) + merge SEM limpar antes
  const stalePag: PagamentoCooperadoRegistro[] = [
    ...(rawOp.pagamentosCooperado ?? []),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `stale_local_${i}`,
      cooperadoId: cooperados[i]?.id ?? `c_stale_${i}`,
      cooperativaId: COOP_ID,
      status: "aguardando_confirmacao" as const,
      mesReferencia: "2025-09",
      mesesReferencia: ["2025-09"],
      valorLiquido: 100,
      valorBruto: 100,
      pagoEm: "2025-09-01T12:00:00.000Z",
      createdAt: "2025-09-01T12:00:00.000Z",
      updatedAt: "2025-09-01T12:00:00.000Z",
    })),
  ];
  let staleMerge = baseShell({
    pagamentosCooperado: stalePag.map((p) => ({ ...p, cooperativaId: COOP_ID })),
    fichaCorrida: (rawOp.fichaCorrida ?? []).slice(0, 50).map((f: { cooperativaId?: string }) => ({
      ...f,
      cooperativaId: COOP_ID,
    })),
  });
  staleMerge = mergeOperacionalIntoData(staleMerge, apiOpNew, COOP_ID, cooperados);
  staleMerge = posProcessarFinanceiroLocal(staleMerge, CNPJ);

  // Cenário D: restore correto — limpar financeiro + merge
  let fixed = baseShell({
    pagamentosCooperado: stalePag.map((p) => ({ ...p, cooperativaId: COOP_ID })),
  });
  fixed = clearOperacionalFinanceiroForCooperativa(fixed, COOP_ID);
  fixed = mergeOperacionalIntoData(fixed, apiOpNew, COOP_ID, cooperados);
  fixed = posProcessarFinanceiroLocal(fixed, CNPJ);

  // Cenário E: coopId errado / cooperativa ausente no local
  let noCoop = emptyInitialData;
  noCoop = mergeOperacionalIntoData(noCoop, apiOpNew, COOP_ID, cooperados);

  // Cenário F: merge com notas (pós-fix: sem reconciliar no merge fullReset)
  let mergeComNotas = baseShell({});
  mergeComNotas = mergeOperacionalIntoData(mergeComNotas, apiOpNew, COOP_ID, cooperados);
  mergeComNotas = posProcessarFinanceiroLocal(mergeComNotas, CNPJ);

  console.log(
    JSON.stringify(
      {
        storage: {
          resetVer: rawOp.operationalResetVersion,
          fullReset: rawOp.fullReset,
          pag: rawOp.pagamentosCooperado?.length,
          aguard: rawOp.pagamentosCooperado?.filter(
            (p: { status: string }) => p.status === "aguardando_confirmacao"
          ).length,
          fichas: rawOp.fichaCorrida?.length,
        },
        apiGet: {
          fullResetPassthrough: apiOpNew === rawOp,
          pagLen: apiOpNew.pagamentosCooperado?.length,
        },
        notasNuvem: notas.length,
        cooperadosNuvem: cooperados.length,
        cenarios: {
          A_idealPosRestore: { pag: pagStats(ideal, COOP_ID), badge: badge(ideal, COOP_ID) },
          B_mergePlusReconciliarNotas: { pag: pagStats(bugReconciliar, COOP_ID), badge: badge(bugReconciliar, COOP_ID) },
          C_staleLocalMergeSemLimpar: { pag: pagStats(staleMerge, COOP_ID), badge: badge(staleMerge, COOP_ID) },
          D_limparFinanceiroMerge: { pag: pagStats(fixed, COOP_ID), badge: badge(fixed, COOP_ID) },
          F_mergeComNotasPosFix: {
            pag: pagStats(mergeComNotas, COOP_ID),
            badgeSemRestoreFlag: badge(mergeComNotas, COOP_ID, false),
            badgeComDedupRestore: badge(mergeComNotas, COOP_ID, true),
          },
          E_semCooperativaLocal: {
            cooperativas: noCoop.cooperativas.length,
            pagGlobal: noCoop.pagamentosCooperado.length,
          },
        },
        causaRaizProvavel:
          "Backup está no Supabase (payload idêntico). Badge 22 = 18 aguardando + 4 cooperados extras por NOTAS (listarMesesPendentesQuantoVouReceber). mergeOperacionalIntoData reconciliava ficha após fullReset e desfazia o backup no aparelho.",
      },
      null,
      2
    )
  );
}

function posProcessarIntegridadeLegacy(data: AppData): AppData {
  const { posProcessarIntegridadePagamentosCooperativa } = require("../src/services/pagamentoIntegridadeService") as typeof import("../src/services/pagamentoIntegridadeService");
  return posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));
}

void main();
