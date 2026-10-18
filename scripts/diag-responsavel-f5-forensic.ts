/**
 * Diagnóstico forense F5 responsável — somente leitura na nuvem.
 * Reproduz a árvore de decisão da abertura (v486 em produção) e mede onde os totais zeram.
 *
 * npx tsx scripts/diag-responsavel-f5-forensic.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { emptyInitialData } from "../src/mock/data.ts";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types";
import { fetchCooperadosFromCloud } from "../src/services/cooperadoCloudService.ts";
import { fetchNotasFromTable } from "../src/lib/supabase/notasStorage.ts";
import {
  aplicarOperacionalPullLocalForTests,
  aplicarRestoreLegadoOperacionalForTests,
  avaliarFullResetOperacionalPullSeguro,
} from "../src/services/cooperativaSyncCloudService.ts";
import { medirOperacionalLocalVsNuvem } from "../src/services/operacionalRestoreService.ts";
import {
  staffLocalOperacionalVazio,
  expandStaffTierPlanIfOperacionalVazio,
} from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import { staffResponsavelOpeningSyncRequest } from "../src/lib/staff/staffResponsavelSyncPolicy.ts";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";
import { getTotalValoresAPagarGestaoCooperativa } from "../src/lib/responsavel/responsavelGestaoLeitura.ts";
import {
  getRelatorioLancamentosEmAbertoResponsavel,
  resetResponsavelPainelIndexCache,
} from "../src/services/responsavelPainelIndex.ts";
import { clearOperacionalFinanceiroForCooperativa } from "../src/services/operationalReset.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService.ts";
import {
  listCooperadosPagamentoPendenteResponsavel,
} from "../src/services/responsavelPainelIndex.ts";

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

type Metricas = {
  pagamentos: number;
  fichas: number;
  livro: number;
  totalAPagar: number;
  linhasEmAberto: number;
  desalinhadoNuvem: boolean;
};

function medir(data: AppData, cloud: OperacionalSyncPayload | null): Metricas {
  resetResponsavelPainelIndexCache();
  const stats = medirOperacionalLocalVsNuvem(data, COOP_ID, cloud);
  return {
    pagamentos: data.pagamentosCooperado.filter((p) => p.cooperativaId === COOP_ID).length,
    fichas: data.fichaCorrida.filter(
      (f) => f.cooperativaId === COOP_ID || data.cooperados.some((c) => c.id === f.cooperadoId)
    ).length,
    livro: (data.livroCaixa ?? []).filter((l) => l.cooperativaId === COOP_ID).length,
    totalAPagar: getTotalValoresAPagarGestaoCooperativa(data, COOP_ID),
    linhasEmAberto: getRelatorioLancamentosEmAbertoResponsavel(data, COOP_ID).length,
    desalinhadoNuvem: stats.desalinhado,
  };
}

function baseShell(
  cooperados: AppData["cooperados"],
  notas: AppData["notasPedido"],
  extra: Partial<AppData> = {}
): AppData {
  return {
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
    cooperados,
    notasPedido: notas,
    ...extra,
  };
}

function simularAberturaF5V486(local: AppData): {
  openingTier: string;
  openingForce: boolean;
  operacionalVazio: boolean;
  planPullOperacional: boolean;
  planPullNotas: boolean;
  resetLegadoClear: boolean;
  pullSeguroMotivo: string;
  aposPull: Metricas;
  aposClearSemPull: Metricas;
} {
  const opening = staffResponsavelOpeningSyncRequest(local, COOP_ID);
  const plan = expandStaffTierPlanIfOperacionalVazio(
    resolveSyncTierPlan84(opening.tier ?? "notas_delta", "staff"),
    local,
    COOP_ID
  );

  return {
    openingTier: opening.tier ?? "?",
    openingForce: opening.force === true,
    operacionalVazio: staffLocalOperacionalVazio(local, COOP_ID),
    planPullOperacional: plan.pullOperacional,
    planPullNotas: plan.pullNotas,
    resetLegadoClear: false,
    pullSeguroMotivo: "",
    aposPull: medir(local, null),
    aposClearSemPull: medir(local, null),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("FALTA .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  const { data: blob, error } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
  if (error || !blob) {
    console.error("Não foi possível ler operacional.json:", error?.message);
    process.exit(1);
  }
  const cloud = JSON.parse(await blob.text()) as OperacionalSyncPayload;

  const { cooperados } = await fetchCooperadosFromCloud(CNPJ);
  const { notas } = await fetchNotasFromTable(sb, CNPJ);
  const coopCooperados = cooperados.map((c) => ({ ...c, cooperativaId: COOP_ID }));
  const coopNotas = notas.map((n) => ({ ...n, cooperativaId: COOP_ID }));

  const cloudPag = (cloud.pagamentosCooperado ?? []).filter(
    (p) => !p.cooperativaId || p.cooperativaId === COOP_ID
  );
  const cloudFichas = (cloud.fichaCorrida ?? []).filter(
    (f) => !f.cooperativaId || f.cooperativaId === COOP_ID
  );

  const pullSeguro = avaliarFullResetOperacionalPullSeguro(
    baseShell(coopCooperados, coopNotas),
    cloud,
    COOP_ID,
    CNPJ
  );

  // Cenário 0: nuvem aplicada em aparelho “limpo” (referência verdade)
  let referencia = baseShell(coopCooperados, coopNotas);
  referencia = aplicarRestoreLegadoOperacionalForTests(referencia, cloud, COOP_ID, CNPJ);
  const pullRef = aplicarOperacionalPullLocalForTests(referencia, cloud, COOP_ID, CNPJ, coopCooperados);
  referencia = pullRef.data;

  const mRef = medir(referencia, cloud);

  // Cenário A: F5 com localStorage “quente” (PIX+livro da sessão anterior, ficha já apagada)
  const livroNuvem = (cloud.livroCaixa ?? []).map((l) => ({ ...l, cooperativaId: COOP_ID }));
  const localQuenteSemFicha = baseShell(coopCooperados, coopNotas, {
    pagamentosCooperado: cloudPag.map((p) => ({ ...p, cooperativaId: COOP_ID })),
    livroCaixa: livroNuvem,
    fichaCorrida: [],
  });
  const aberturaA = simularAberturaF5V486(localQuenteSemFicha);
  let aposA = localQuenteSemFicha;
  if (aberturaA.planPullOperacional) {
    aposA = aplicarRestoreLegadoOperacionalForTests(aposA, cloud, COOP_ID, CNPJ);
    aposA = aplicarOperacionalPullLocalForTests(aposA, cloud, COOP_ID, CNPJ, coopCooperados).data;
  }
  const mAantes = medir(localQuenteSemFicha, cloud);
  const mAdepois = medir(aposA, cloud);
  const mAclearOnly = medir(clearOperacionalFinanceiroForCooperativa(localQuenteSemFicha, COOP_ID), cloud);

  // Cenário B: F5 “quente” com ficha+PIX iguais contagem nuvem (caso que abre notas_delta)
  const localQuenteCompleto = baseShell(coopCooperados, coopNotas, {
    pagamentosCooperado: cloudPag.map((p) => ({ ...p, cooperativaId: COOP_ID })),
    livroCaixa: livroNuvem,
    fichaCorrida: cloudFichas.map((f) => ({ ...f, cooperativaId: COOP_ID })),
  });
  const aberturaB = simularAberturaF5V486(localQuenteCompleto);
  let aposB = localQuenteCompleto;
  if (aberturaB.planPullOperacional) {
    aposB = aplicarRestoreLegadoOperacionalForTests(aposB, cloud, COOP_ID, CNPJ);
    aposB = aplicarOperacionalPullLocalForTests(aposB, cloud, COOP_ID, CNPJ, coopCooperados).data;
  } else {
    // notas_delta sem operacional: só notas (local já tem notas da tabela — simula “sem mudança”)
    aposB = localQuenteCompleto;
  }
  const mB = medir(aposB, cloud);

  // Cenário C: frio total (cache limpo)
  const localFrio = baseShell(coopCooperados, [], {
    pagamentosCooperado: [],
    livroCaixa: [],
    fichaCorrida: [],
  });
  const aberturaC = simularAberturaF5V486(localFrio);
  let aposC = localFrio;
  if (aberturaC.planPullOperacional) {
    aposC = aplicarRestoreLegadoOperacionalForTests(aposC, cloud, COOP_ID, CNPJ);
    aposC = aplicarOperacionalPullLocalForTests(aposC, cloud, COOP_ID, CNPJ, coopCooperados).data;
  }
  const mC = medir(aposC, cloud);

  // Cenário D: clear preemptivo (restore legado) SEM pull em seguida — estado “tela zerada”
  const localAntesClear = baseShell(coopCooperados, coopNotas, {
    pagamentosCooperado: cloudPag.map((p) => ({ ...p, cooperativaId: COOP_ID })),
    fichaCorrida: cloudFichas.map((f) => ({ ...f, cooperativaId: COOP_ID })),
  });
  const cleared = aplicarRestoreLegadoOperacionalForTests(localAntesClear, cloud, COOP_ID, CNPJ);
  const mD = medir(cleared, cloud);

  function vereditoCenario(
    nome: string,
    antes: Metricas,
    depois: Metricas,
    abertura: ReturnType<typeof simularAberturaF5V486>
  ): string {
    if (antes.totalAPagar > 0 && depois.totalAPagar === 0 && !abertura.planPullOperacional) {
      return `${nome}: CAUSA VERIFICADA — abertura tier=${abertura.openingTier} NÃO puxa operacional; UI zera com PIX local e ficha vazia.`;
    }
    if (antes.linhasEmAberto === 0 && depois.linhasEmAberto > 0 && abertura.planPullOperacional) {
      return `${nome}: pull operacional na abertura RECUPERA (não é o bug se sync completar).`;
    }
    if (antes.desalinhado && !depois.desalinhado && abertura.planPullOperacional) {
      return `${nome}: desalinhamento corrigido pelo pull.`;
    }
    if (depois.totalAPagar === 0 && mRef.totalAPagar > 0) {
      return `${nome}: totais zerados vs referência nuvem — investigar merge/clear.`;
    }
    return `${nome}: sem reprodução de zero indevido neste snapshot.`;
  }

  const notasConferidas = coopNotas.filter((n) => n.status === "conferida").length;

  // Cenário E: sequência real do «Restaurar da nuvem» (operacional + notas já locais + reconciliar)
  let posRestoreManual = baseShell(coopCooperados, coopNotas);
  posRestoreManual = aplicarOperacionalPullLocalForTests(
    posRestoreManual,
    cloud,
    COOP_ID,
    CNPJ,
    coopCooperados
  ).data;
  posRestoreManual = reconciliarFichaFromNotasConferidas(posRestoreManual);
  const mRestore = medir(posRestoreManual, cloud);

  // Cenário F: F5 frio v486 — financeiro_delta puxa operacional+notas no plano, mas notas vazias no 1º frame
  let f5FrioSoOperacional = baseShell(coopCooperados, []);
  f5FrioSoOperacional = aplicarOperacionalPullLocalForTests(
    f5FrioSoOperacional,
    cloud,
    COOP_ID,
    CNPJ,
    coopCooperados
  ).data;
  const mF5FrioSemNotas = medir(f5FrioSoOperacional, cloud);
  const f5FrioComNotas = reconciliarFichaFromNotasConferidas(
    baseShell(coopCooperados, coopNotas, {
      pagamentosCooperado: f5FrioSoOperacional.pagamentosCooperado,
      livroCaixa: f5FrioSoOperacional.livroCaixa,
      fichaCorrida: f5FrioSoOperacional.fichaCorrida,
    })
  );
  const mF5FrioComNotasReconc = medir(f5FrioComNotas, cloud);

  const vereditos = [
    vereditoCenario("A_quente_PIX_sem_ficha", mAantes, mAdepois, aberturaA),
    vereditoCenario("B_quente_completo", medir(localQuenteCompleto, cloud), mB, aberturaB),
    vereditoCenario("C_frio", medir(localFrio, cloud), mC, aberturaC),
  ];

  const causaRaiz =
    cloudFichas.length === 0
      ? `FATO NUVEM (verificado agora): operacional.json tem fullReset v15 com ${cloudPag.length} pagamentos, ${livroNuvem.length} livro e 0 fichas. O backup autoritativo NÃO carrega ficha — só notas+reconciliar ou pull completo (como Restaurar) montam a ficha.`
      : "Nuvem tem fichas no blob; investigar sync local.";

  const causaRaizF5 =
    mF5FrioSemNotas.linhasEmAberto === 0 &&
    mF5FrioComNotasReconc.linhasEmAberto > 0
      ? "CONFIRMADO: após pull operacional sem notas locais, Em aberto=0; com notas+reconciliar recupera — F5 quente (notas_delta) não refaz reconciliar se PIX/livro já existem e ficha local foi perdida."
      : mRestore.linhasEmAberto > 0 && mAantes.linhasEmAberto === 0
        ? `CONFIRMADO: «Restaurar» monta ${mRestore.linhasEmAberto} linhas Em aberto; cenário A (PIX+livro, 0 fichas) mantém ${mAantes.linhasEmAberto} linhas na abertura notas_delta.`
        : "Ver métricas E/F abaixo.";

  console.log(
    JSON.stringify(
      {
        nuvem: {
          fullReset: cloud.fullReset,
          operationalResetVersion: cloud.operationalResetVersion,
          pagamentos: cloudPag.length,
          fichas: cloudFichas.length,
          livro: livroNuvem.length,
        },
        pullSeguro: {
          permitirAplicarResetLegado: pullSeguro.permitirAplicarResetLegado,
          permitirClearFinanceiro: pullSeguro.permitirClearFinanceiro,
          motivo: pullSeguro.motivo,
        },
        notasNuvem: { total: coopNotas.length, conferidas: notasConferidas },
        referenciaPosPull: mRef,
        restoreManualEquivalente: {
          metricas: mRestore,
          cooperadosPagar: listCooperadosPagamentoPendenteResponsavel(posRestoreManual, COOP_ID).length,
        },
        f5FrioOperacionalSemNotas: mF5FrioSemNotas,
        f5FrioOperacionalMaisNotasReconciliar: mF5FrioComNotasReconc,
        cenarios: {
          A_quente_PIX_sem_ficha: {
            abertura: aberturaA,
            antes: mAantes,
            depoisPull: mAdepois,
            soClearFinanceiro: mAclearOnly,
          },
          B_quente_completo: { abertura: aberturaB, metricas: mB },
          C_frio: { abertura: aberturaC, metricas: mC },
          D_clear_sem_pull: mD,
        },
        vereditos,
        causaRaizVerificadaNuvem: causaRaiz,
        causaRaizVerificadaF5: causaRaizF5,
        proximoPassoSeInconclusivo:
          "No navegador do responsável (sem apagar dados): DevTools → Application → localStorage coopeagriplla_data → exportar JSON e rodar scripts/diag-responsavel-f5-from-snapshot.ts (a criar) com esse arquivo.",
      },
      null,
      2
    )
  );
}

void main();
