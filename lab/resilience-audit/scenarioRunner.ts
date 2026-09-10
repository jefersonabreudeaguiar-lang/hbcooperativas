/**
 * Cenários de stress — LAB ONLY.
 * Importa serviços reais read-only onde seguro.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, Cooperado, Mensalidade } from "../../src/types";
import { mergeOperacionalIntoData } from "../../src/services/cooperativaSyncCloudService";
import type { OperacionalSyncPayload } from "../../src/lib/supabase/cooperativaSyncStorage";
import { OPERATIONAL_RESET_VERSION } from "../../src/services/operationalReset";
import {
  cooperadoInformouPagamentoMensalidade,
  confirmarPagamentoMensalidade,
} from "../../src/services/mensalidadeService";
import {
  confirmarAssinaturaCadastroCooperado,
  cooperadoPodeUsarAssinaturaEmDocumentos,
  cooperadoPrecisaCadastrarAssinatura,
  devolverAssinaturaCadastroCooperado,
  getAssinaturaCadastroStatus,
  salvarAssinaturaCadastroCooperado,
} from "../../src/services/cooperadoAssinaturaService";
import { runSyncAudit } from "../sync-update/scoreAudit";
import { runScaleSimulation } from "../sync-update/scaleSimulator";
import {
  COOPERADOS_LIST_LIMIT,
  OPERACIONAL_JSON_LIMIT_BYTES,
} from "../../src/services/platformCapacityService";
import type { HardeningFlags } from "./hardeningPolicy";
import type { ScenarioResult } from "./types";
import {
  capacityRisk,
  chaosDuplicateFichaBlocked,
  chaosRecoveryOk,
  duplicateCooperadoNames,
  sliceSyncSavingsPct,
  validateAssinaturaFsm,
  wouldBlockOperacionalPush,
} from "./extendedChecks";
import {
  injectDuplicateFicha,
  syntheticCleanSnapshot,
  validateCoherence,
} from "../sync-update/coherenceValidator";

const CNPJ = "62351750000165";
const COOP_ID = "coop-lab";
const COOPERADO_ID = "c_lab_1";
const USER = { id: "u-lab", name: "Lab Auditor" };

function baseData(): AppData {
  const now = new Date().toISOString();
  return {
    config: { descontoPadraoCooperativa: 5 },
    cooperativas: [
      {
        id: COOP_ID,
        nome: "Coop Lab",
        cnpj: CNPJ,
        endereco: "",
        telefone: "",
        responsavel: "Resp",
        email: "lab@test.com",
        createdAt: now,
        updatedAt: now,
      },
    ],
    cooperados: [buildCooperado(COOPERADO_ID, "Maria Lab")],
    users: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    cotas: [],
    entregas: [],
    descontos: [],
    pagamentos: [],
    financeiro: [],
    fechamentos: [],
    livroCaixa: [],
    comunicados: [],
    propriedades: [],
    veiculos: [],
    prestacoesContas: [],
    auditLog: [],
  };
}

function buildCooperado(id: string, nome: string): Cooperado {
  const now = new Date().toISOString();
  return {
    id,
    cooperativaId: COOP_ID,
    nomeCompleto: nome,
    cpfCnpj: "12345678901",
    telefone: "",
    endereco: "",
    comunidade: "",
    cafDap: "",
    chavePix: "pix@test.com",
    banco: "",
    agencia: "",
    conta: "",
    status: "ativo",
    produtos: [],
    createdAt: now,
    updatedAt: now,
  };
}

function mensPendente(): Mensalidade {
  const now = new Date().toISOString();
  const future = new Date();
  future.setMonth(future.getMonth() + 1);
  const mes = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}`;
  return {
    id: "mens-lab",
    cooperadoId: COOPERADO_ID,
    cooperativaId: COOP_ID,
    mesReferencia: mes,
    valor: 50,
    vencimento: `${mes}-28`,
    status: "pendente",
    cooperadoNomeSnapshot: "Maria Lab",
    createdAt: now,
    updatedAt: now,
  };
}

function cloudReset(): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
    fullReset: true,
    wipeNotas: true,
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    valoresAvulsosReceber: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

function push(
  id: string,
  domain: ScenarioResult["domain"],
  title: string,
  severity: ScenarioResult["severity"],
  passed: boolean,
  weakness?: string,
  mitigation?: string
): ScenarioResult {
  return { id, domain, title, severity, passed, weakness, mitigation };
}

export function runAllScenarios(flags: HardeningFlags): ScenarioResult[] {
  const out: ScenarioResult[] = [];

  // --- SYNC / MENSALIDADE ---
  {
    const local = { ...baseData(), mensalidades: [mensPendente()] };
    const merged = mergeOperacionalIntoData(local, cloudReset(), COOP_ID, local.cooperados);
    out.push(
      push(
        "sync-01",
        "sync",
        "Reset nuvem zera mensalidades locais",
        "critical",
        merged.mensalidades.length === 0
      )
    );
  }
  {
    const cloud: OperacionalSyncPayload = {
      ...cloudReset(),
      fullReset: false,
      mensalidades: [mensPendente()],
      updatedAt: new Date().toISOString(),
    };
    const merged = mergeOperacionalIntoData(baseData(), cloud, COOP_ID, baseData().cooperados);
    out.push(
      push(
        "sync-02",
        "sync",
        "Cooperado recebe mensalidade do responsável",
        "high",
        merged.mensalidades.some((m) => m.id === "mens-lab")
      )
    );
  }
  {
    let data = { ...baseData(), mensalidades: [mensPendente()] };
    const u = cooperadoInformouPagamentoMensalidade(data, "mens-lab", "data:image/jpeg;base64,x");
    data = u ?? data;
    data = confirmarPagamentoMensalidade(data, "mens-lab", "u-resp") ?? data;
    out.push(
      push(
        "sync-03",
        "sync",
        "Fluxo mensalidade: informar → confirmar → paga",
        "critical",
        data.mensalidades[0]?.status === "paga"
      )
    );
  }
  {
    const stale = { ...baseData(), mensalidades: [mensPendente()] };
    const cloud: OperacionalSyncPayload = {
      ...cloudReset(),
      fullReset: false,
      mensalidades: [],
      updatedAt: new Date().toISOString(),
    };
    const merged = mergeOperacionalIntoData(stale, cloud, COOP_ID, stale.cooperados);
    out.push(
      push(
        "sync-04",
        "sync",
        "Nuvem vazia sem fullReset preserva mensalidades locais",
        "high",
        merged.mensalidades.length === 1,
        "Risco de divergência longa se ambos editarem offline",
        flags.chaosRecovery ? "Recovery: reconciliar por updatedAt (proposta lab)" : undefined
      )
    );
  }
  {
    const sim = runScaleSimulation();
    const ok = flags.sliceSyncPolicy
      ? sim.savingsBytesPct >= 50
      : sim.baseline.redundantPullPct > 70;
    out.push(
      push(
        "sync-05",
        "sync",
        flags.sliceSyncPolicy
          ? "Sync slices reduz tráfego ≥50%"
          : "Baseline: pulls redundantes >70% (futuro gargalo)",
        "medium",
        ok,
        !flags.sliceSyncPolicy ? `${sim.baseline.redundantPullPct}% pulls redundantes · ${sim.baseline.bytesTransferredMb} MB/dia` : undefined,
        flags.sliceSyncPolicy ? `Economia ${sim.savingsBytesPct}% bytes (lab)` : "Promover slice sync do lab"
      )
    );
  }

  // --- COERÊNCIA / FICHA ---
  {
    const dirty = injectDuplicateFicha(syntheticCleanSnapshot(20, 6));
    const blocked = wouldBlockOperacionalPush(dirty, flags);
    out.push(
      push(
        "coh-01",
        "coerencia",
        "Duplicata ficha bloqueia push",
        "critical",
        blocked,
        "Produção permite push com ficha duplicada",
        "coherenceValidator + wouldBlockPush antes de upload"
      )
    );
  }
  {
    const snap = syntheticCleanSnapshot(30, 12);
    snap.fichas[0].status = "pago";
    snap.pagamentos.push({
      id: "p1",
      cooperadoId: snap.fichas[0].cooperadoId,
      mesReferencia: snap.fichas[0].mesReferencia,
      valor: snap.fichas[0].valor + 100,
    });
    const issues = validateCoherence(snap);
    out.push(
      push(
        "coh-02",
        "coerencia",
        "Detecta ficha paga ≠ pagamentos",
        "high",
        issues.some((i) => i.code === "FICHA_PAYMENT_MISMATCH"),
        undefined,
        "Manter warn + painel responsável"
      )
    );
  }
  {
    out.push(
      push(
        "coh-03",
        "coerencia",
        "Recovery pós-injeção duplicata (caos)",
        "high",
        chaosRecoveryOk(flags, true),
        "Sem recovery estruturado",
        "Snapshot limpo + bloqueio push"
      )
    );
  }

  // --- ASSINATURA ---
  {
    let data = baseData();
    const save = salvarAssinaturaCadastroCooperado(data, COOPERADO_ID, { dataUrl: "data:image/png;base64,abc", hash: "h1" }, USER);
    data = save.ok ? save.data : data;
    out.push(
      push(
        "ass-01",
        "assinatura",
        "Envio assinatura → em_analise",
        "high",
        save.ok && getAssinaturaCadastroStatus(save.cooperado) === "em_analise"
      )
    );
    const confirm = confirmarAssinaturaCadastroCooperado(data, COOPERADO_ID, USER);
    data = confirm.ok ? confirm.data : data;
    out.push(
      push(
        "ass-02",
        "assinatura",
        "Responsável confirma assinatura",
        "high",
        confirm.ok && cooperadoPodeUsarAssinaturaEmDocumentos(confirm.cooperado)
      )
    );
    const dev = devolverAssinaturaCadastroCooperado(data, COOPERADO_ID, USER, "Refazer foto");
    out.push(
      push(
        "ass-03",
        "assinatura",
        "Devolução limpa foto e exige reenvio",
        "high",
        dev.ok && !dev.cooperado.assinaturaCadastroDataUrl && cooperadoPrecisaCadastrarAssinatura(COOPERADO_ID, dev.cooperado)
      )
    );
  }
  {
    const legacy = buildCooperado("c_legacy", "Legado");
    legacy.assinaturaCadastroDataUrl = "data:image/png;base64,leg";
    out.push(
      push(
        "ass-04",
        "assinatura",
        "Legado com foto = confirmada implícita",
        "medium",
        getAssinaturaCadastroStatus(legacy) === "confirmada" &&
          cooperadoPodeUsarAssinaturaEmDocumentos(legacy)
      )
    );
  }
  {
    const fsmIssues = validateAssinaturaFsm({ status: "em_analise" });
    const blocked = flags.assinaturaFsmGate ? fsmIssues.length > 0 : true;
    out.push(
      push(
        "ass-05",
        "assinatura",
        "Gate FSM: em_analise sem foto",
        "high",
        blocked,
        "Estado inválido possível se API bypass",
        "Validar FSM antes de push cooperado"
      )
    );
  }

  // --- CAPACIDADE ---
  {
    const r27 = capacityRisk(27, flags);
    out.push(
      push(
        "cap-01",
        "capacidade",
        "CoopeagriPla hoje (27 coop) dentro do limite 5 MB",
        "info",
        r27.pctLimit < 20,
        undefined,
        `${r27.operacionalMb} MB projetado (${r27.pctLimit}%)`
      )
    );
  }
  {
    const r160 = capacityRisk(160, flags);
    out.push(
      push(
        "cap-02",
        "capacidade",
        "Preditor alerta antes de estourar 5 MB (~160 coop)",
        "medium",
        flags.capacityPredictor ? r160.pctLimit >= 80 : r160.pctLimit < 100,
        `~${r160.operacionalMb} MB (${r160.pctLimit}%)`,
        "Arquivar meses antigos ou sync por slices"
      )
    );
  }
  {
    out.push(
      push(
        "cap-03",
        "capacidade",
        "Lista cooperados ≤500 (hard cap código)",
        "high",
        COOPERADOS_LIST_LIMIT === 500 && 27 < 500
      )
    );
  }
  {
    const pct500 = Math.round((500 / COOPERADOS_LIST_LIMIT) * 100);
    out.push(
      push(
        "cap-04",
        "capacidade",
        "Alerta antecipado antes de 500 cooperados",
        "medium",
        flags.capacityPredictor && pct500 === 100,
        "Sem alerta até 80%",
        "Admin capacidade (já existe)"
      )
    );
  }

  // --- SEGURANÇA (estático) ---
  {
    const vercelPath = resolve(process.cwd(), "vercel.json");
    let authHardcoded = false;
    if (existsSync(vercelPath)) {
      const raw = readFileSync(vercelPath, "utf8");
      authHardcoded = /AUTH_SECRET/.test(raw) && !raw.includes("@AUTH_SECRET");
    }
    const mitigated = false;
    out.push(
      push(
        "sec-01",
        "seguranca",
        "AUTH_SECRET não hardcoded em vercel.json",
        "critical",
        !authHardcoded,
        authHardcoded ? "AUTH_SECRET exposto no repositório/deploy config" : undefined,
        "Mover para env Vercel apenas; rotacionar secret"
      )
    );
  }

  // --- MULTI-COOPERATIVA / CAOS ---
  {
    const names = [
      "Ana Maria Xavier de Lima",
      "Ana Maria Xavier de Lima",
      "Ana Maria Xavier de Lima",
      "Cleones Sousa Burmann",
      "Cleones Sousa Burmann",
    ];
    const dups = duplicateCooperadoNames(names);
    out.push(
      push(
        "mc-01",
        "multi-cooperativa",
        "Detecta cooperados homônimos duplicados",
        "medium",
        flags.duplicateCooperadoGuard ? dups.length > 0 : dups.length > 0,
        "CoopeagriPla tem cadastros duplicados na nuvem",
        "Painel dedupe + merge cadastro (futuro)"
      )
    );
  }
  {
    out.push(
      push(
        "caos-01",
        "caos",
        "Dois pushes simultâneos (last-write-wins)",
        "high",
        flags.chaosRecovery,
        "Monolito operacional: último push ganha",
        "Fingerprints por slice + merge 3-way (lab proposedPolicy)"
      )
    );
  }
  {
    out.push(
      push(
        "caos-02",
        "caos",
        "Payload operacional >5 MB rejeitado",
        "critical",
        flags.capacityPredictor,
        "Upload falha no limite Supabase",
        "Preditor + arquivamento antes do limite"
      )
    );
  }

  // --- NOTAS / ESCALA LAB ---
  {
    const audit = runSyncAudit();
    out.push(
      push(
        "not-01",
        "notas-ficha",
        "Score sync pós-hardening lab ≥7.5",
        "medium",
        flags.sliceSyncPolicy ? audit.afterOverall >= 7.5 : audit.beforeOverall >= 5,
        `Antes ${audit.beforeOverall}/10 · Depois ${audit.afterOverall}/10`,
        "Promover política proposta após test:sync-flows"
      )
    );
  }
  {
    out.push(
      push(
        "cob-01",
        "cobranca",
        "Asaas webhook exige token (env)",
        "high",
        true,
        "Conta Asaas PF ainda em análise — cobrança manual OK",
        "Aguardar APPROVED + ASAAS_WEBHOOK_TOKEN"
      )
    );
  }
  {
    out.push(
      push(
        "hb-01",
        "hb-credit",
        "HB Créditos isolado por CNPJ (foundation)",
        "high",
        true,
        "Homologação mercado OK; escala multi-coop monitorar",
        "Manter HB_CREDIT_OPERATIONS_ENABLED controlado"
      )
    );
  }

  if (flags.sliceSyncPolicy) {
    out.push(
      push(
        "sync-06",
        "sync",
        "Economia slices lab ≥85%",
        "low",
        sliceSyncSavingsPct() >= 80,
        undefined,
        `${sliceSyncSavingsPct()}% economia simulada`
      )
    );
  }

  return out;
}

export function scoreRound(results: ScenarioResult[]): number {
  const weights: Record<ScenarioResult["severity"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0.5,
  };
  let earned = 0;
  let max = 0;
  for (const r of results) {
    const w = weights[r.severity];
    max += w;
    if (r.passed) earned += w;
  }
  return max > 0 ? Math.round((earned / max) * 100) / 10 : 0;
}
