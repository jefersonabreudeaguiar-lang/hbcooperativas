/**
 * HXHÍBRIDO Fase 3 — sonda homolog (ocyfzramxvxqbtkorubn) com código local WIP.
 * Usa .env.homolog.local + flags HB ON (não altera arquivos .env).
 *
 * npx tsx scripts/homolog-hxhibrido-fase3-probe.ts
 * FASE3_SET_LIMIT=50000 npx tsx scripts/homolog-hxhibrido-fase3-probe.ts
 */
import { loadBicLabEnv } from "./lab/loadBicLabEnv";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import type { AppData } from "@/types";
import { evaluateProductionGuard } from "./lib/assertNotProductionTarget.mjs";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "@/lib/supabase/notasStorage";
import { fetchCooperadosFromStorage } from "@/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import { cooperativaFromCloudRow } from "@/utils/cooperativaCadastro";
import { mergeOperacionalIntoData } from "@/services/cooperativaSyncCloudService";
import { projetarCooperadoFluxoFinanceiroGlobal } from "@/lib/cooperadoFluxoFinanceiroGlobal";
import { hbCreditCreditoBaseReais } from "@/lib/hb-credit/hbCreditLeituraBic";
import {
  getDashboardResumo,
  getLimiteCooperado,
  getLimiteCooperadoAlinhadoAEntregas,
  listLimitesCooperadosAlinhadosAEntregas,
  setLimiteCooperado,
} from "@/lib/supabase/contaCoopStorage";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { computeAmountUsedCentsFromPayments } from "@/lib/supabase/creditAmountUsedReconcile";
import { isHbCreditEnabledServer, isHbCreditOperationsEnabled } from "@/modules/hb-credit/config";
import { isHbCreditStaffNavEligible } from "@/permissions";

const CNPJ = "62351750000165";
const JEFERSON = "c_1781981564381_w67gg";
const TARGET_LIMIT = Number(process.env.FASE3_SET_LIMIT ?? "50000");

function loadHomologEnv() {
  loadBicLabEnv();
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
  if (ref !== "ocyfzramxvxqbtkorubn") {
    throw new Error(`Supabase ref esperado ocyfzramxvxqbtkorubn, obtido ${ref ?? "?"}`);
  }
  process.env.APP_ENV = "homolog";
  process.env.HB_CREDIT_ENABLED = "true";
  process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED = "true";
  process.env.HB_CREDIT_OPERATIONS_ENABLED = "true";
  process.env.HB_CREDIT_LAB_ENABLED = "true";
  process.env.NEXT_PUBLIC_HB_CREDIT_LAB_ENABLED = "true";
}

function fmt(cents: number) {
  return `R$${(cents / 100).toFixed(2)}`;
}

async function buildAppData(sb: ReturnType<typeof createClient>) {
  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) throw new Error("Cooperativa homolog ausente");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);
  const [storageNotas, tableResult, cloudCooperados, operacional] = await Promise.all([
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));
  let data: AppData = {
    cooperativas: [coop],
    cooperados: cloudCooperados.map((c) => ({ ...c.cooperado, cooperativaId: coop.id })),
    users: [],
    notasPedido: notas,
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    descontos: [],
    instituicoes: [],
    produtosInstituicao: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
  } as AppData;
  if (operacional) {
    data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
  }
  return { data, coop, operacional: Boolean(operacional) };
}

async function main() {
  loadHomologEnv();
  const guard = evaluateProductionGuard(process.env);
  const ref = guard.projectRef;
  console.log("=== HXHÍBRIDO FASE 3 PROBE ===");
  console.log("supabase_ref:", ref);
  console.log("guard:", guard.allowed ? "ALLOWED" : guard.message);
  console.log("HB_CREDIT_ENABLED:", process.env.HB_CREDIT_ENABLED);
  console.log("NEXT_PUBLIC_HB_CREDIT_ENABLED:", process.env.NEXT_PUBLIC_HB_CREDIT_ENABLED);
  console.log("HB_CREDIT_OPERATIONS_ENABLED:", process.env.HB_CREDIT_OPERATIONS_ENABLED);
  console.log("isHbCreditEnabledServer:", isHbCreditEnabledServer());
  console.log("isHbCreditOperationsEnabled:", isHbCreditOperationsEnabled());
  console.log(
    "staffNavEligible (HB on):",
    isHbCreditStaffNavEligible({ role: "responsavel" }, "enabled", true)
  );

  if (!guard.allowed || ref !== "ocyfzramxvxqbtkorubn") {
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: rawBefore } = await sb
    .from("hb_credit_accounts")
    .select("limit_released_cents,amount_used_cents")
    .eq("cooperative_cnpj", CNPJ)
    .eq("cooperado_id", JEFERSON)
    .maybeSingle();

  console.log("\n--- RAW hb_credit_accounts (Jeferson) ---");
  console.log(rawBefore ?? "(sem linha)");

  const auth = await resolveAuthoritativeCreditBase(sb, CNPJ, [JEFERSON]);
  console.log("\n--- credito-base autoritativo ---");
  console.log(auth.ok ? auth.creditosBaseCents[JEFERSON] : auth);

  if (process.env.FASE3_SET_LIMIT) {
    try {
      const set = await setLimiteCooperado(
        sb,
        CNPJ,
        JEFERSON,
        TARGET_LIMIT,
        "fase3-probe",
        auth.ok ? auth.creditosBaseCents : {}
      );
      console.log("\n--- setLimiteCooperado", TARGET_LIMIT, "---");
      console.log(set);
    } catch (e) {
      console.log("\n--- setLimiteCooperado FALHOU ---");
      console.log(e);
    }
  }

  const rawAfter = await sb
    .from("hb_credit_accounts")
    .select("limit_released_cents,amount_used_cents")
    .eq("cooperative_cnpj", CNPJ)
    .eq("cooperado_id", JEFERSON)
    .maybeSingle();

  const limiteDb = await getLimiteCooperado(sb, CNPJ, JEFERSON);
  const limiteEfetivo = await getLimiteCooperadoAlinhadoAEntregas(sb, CNPJ, JEFERSON, {
    resyncIfInflated: true,
    awaitResync: true,
    actorUserId: "fase3-probe",
  });
  const limitesLista = await listLimitesCooperadosAlinhadosAEntregas(sb, CNPJ, {
    resyncIfInflated: true,
    actorUserId: "fase3-probe",
  });
  const jLista = limitesLista.find((l) => l.cooperadoId === JEFERSON);

  console.log("\n--- API-equivalente (storage) ---");
  console.log("RAW limit_released:", rawAfter?.limit_released_cents);
  console.log("getLimiteCooperado:", limiteDb && {
    limite: limiteDb.limiteLiberadoCents,
    usado: limiteDb.valorUsadoCents,
    disp: limiteDb.valorDisponivelCents,
  });
  console.log("getLimiteCooperadoAlinhadoAEntregas (cooperado API):", limiteEfetivo && {
    limite: limiteEfetivo.limiteLiberadoCents,
    usado: limiteEfetivo.valorUsadoCents,
    disp: limiteEfetivo.valorDisponivelCents,
  });
  console.log("listLimites (responsável API):", jLista && {
    limite: jLista.limiteLiberadoCents,
    usado: jLista.valorUsadoCents,
    disp: jLista.valorDisponivelCents,
  });

  const matchStaffCoop =
    limiteEfetivo &&
    jLista &&
    limiteEfetivo.limiteLiberadoCents === jLista.limiteLiberadoCents &&
    limiteEfetivo.valorUsadoCents === jLista.valorUsadoCents &&
    limiteEfetivo.valorDisponivelCents === jLista.valorDisponivelCents;
  console.log("staff vs cooperado API alinhados:", matchStaffCoop ? "SIM" : "NÃO");

  const { data: appBundle, coop } = await buildAppData(sb);
  const proj = projetarCooperadoFluxoFinanceiroGlobal(appBundle, JEFERSON, coop.id, {
    role: "cooperado",
    cooperadoPagamentosHydrated: true,
    syncing: false,
  });
  const creditoBaseReais = hbCreditCreditoBaseReais(appBundle, JEFERSON, coop.id);
  console.log("\n--- A Receber / M6 (operacional homolog) ---");
  console.log("motorValor (fluxo):", proj.motorValor);
  console.log("hbCreditCreditoBaseReais:", creditoBaseReais);

  const aReceberZero = Math.abs(proj.motorValor) < 0.01;
  console.log("A Receber ~ 0:", aReceberZero ? "SIM" : "NÃO");

  if (aReceberZero && limiteEfetivo) {
    const bug =
      limiteEfetivo.limiteLiberadoCents === 0 &&
      (rawAfter?.limit_released_cents ?? 0) > 0 &&
      limiteEfetivo.valorUsadoCents === 0;
    console.log("\n--- TESTE CRÍTICO 3.5 ---");
    console.log("limit_released raw:", rawAfter?.limit_released_cents, fmt(Number(rawAfter?.limit_released_cents ?? 0)));
    console.log("limite efetivo:", limiteEfetivo.limiteLiberadoCents, fmt(limiteEfetivo.limiteLiberadoCents));
    console.log("disponível:", limiteEfetivo.valorDisponivelCents, fmt(limiteEfetivo.valorDisponivelCents));
    if (bug) {
      console.error("\nPARAR — limite efetivo zerou com A receber 0 e limit_released > 0");
      process.exit(2);
    }
    if (TARGET_LIMIT > 0 && limiteEfetivo.limiteLiberadoCents !== TARGET_LIMIT && process.env.FASE3_SET_LIMIT) {
      console.warn("AVISO: limite efetivo != alvo após set (pode ser teto crédito-base)");
    }
  } else if (!aReceberZero) {
    console.log("\nTESTE 3.5: requer A Receber = 0 — concluir pagamento na homolog e repetir.");
  }

  const dash = await getDashboardResumo(sb, CNPJ, auth.ok ? auth.creditosBaseCents : {});
  const somaLista = limitesLista.reduce((s, l) => s + l.limiteLiberadoCents, 0);
  const { data: rawSumRows } = await sb
    .from("hb_credit_accounts")
    .select("limit_released_cents")
    .eq("cooperative_cnpj", CNPJ);
  const somaRaw = (rawSumRows ?? []).reduce((s, r) => s + Number(r.limit_released_cents), 0);
  console.log("\n--- Dashboard ---");
  const limiteDash = dash.teto.limiteDistribuidoCents;
  console.log("limiteDistribuido (efetivo):", limiteDash, fmt(limiteDash));
  console.log("soma listLimites efetivos:", somaLista, fmt(somaLista));
  console.log("soma raw limit_released:", somaRaw, fmt(somaRaw));
  console.log("dashboard alinhado à lista efetiva:", limiteDash === somaLista ? "SIM" : "NÃO");

  const { data: txs } = await sb
    .from("hb_credit_transactions")
    .select("id,event_type,status,amount_cents,credit_debited_cents,created_at")
    .eq("cooperative_cnpj", CNPJ)
    .eq("cooperado_id", JEFERSON)
    .order("created_at", { ascending: false })
    .limit(8);

  const reconciled = computeAmountUsedCentsFromPayments((txs ?? []) as Parameters<typeof computeAmountUsedCentsFromPayments>[0]);
  console.log("\n--- Compra / estorno (persistido) ---");
  console.log("amount_used DB:", rawAfter?.amount_used_cents);
  console.log("reconcile payments → usado:", reconciled);
  console.log("últimas txs:", txs);

  console.log("\n=== FIM PROBE ===");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
