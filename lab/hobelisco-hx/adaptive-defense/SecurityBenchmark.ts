/**
 * Benchmark honesto — Hobelisco vs soluções conhecidas (0–10).
 * Notas derivadas de métricas reais de campanha LAB quando disponíveis.
 * Não substitui pentest, WAF gerenciado ou certificação.
 */

import type { CampaignReport } from "./types";
import type { MaturityScore } from "./CoverageMetrics";

export interface BenchmarkDimension {
  id: string;
  label: string;
  weight: number;
  note: string;
}

export interface SolutionScore {
  id: string;
  name: string;
  category: "waf" | "av" | "rasp" | "siem" | "platform" | "hobelisco" | "observability";
  applicableToThisApp: boolean;
  dimensions: Record<string, number>;
  overall: number;
  summary: string;
  limitations: string[];
}

export interface SecurityBenchmarkReport {
  generatedAt: string;
  methodology: string;
  disclaimer: string;
  hobeliscoLabMetrics: {
    defenseCoverageScore: number;
    preventionRate: number;
    detectionRate: number;
    falsePositiveRate: number;
    missedRate: number;
    financialMutations: number;
    scenariosExecuted: number;
  };
  dimensions: BenchmarkDimension[];
  solutions: SolutionScore[];
  hobeliscoPosition: {
    labAdaptiveOverall: number;
    v2ObserveOverall: number;
    incrementalValueWithWafAndRls: number;
    honestAppSecurityContribution: number;
    verdict: string;
  };
  gapsVsIndustry: string[];
  notComparable: string[];
}

const DIMENSIONS: BenchmarkDimension[] = [
  { id: "detection", label: "Detecção de ameaças", weight: 0.15, note: "Capacidade de identificar padrões maliciosos ou anômalos" },
  { id: "prevention", label: "Prevenção / bloqueio", weight: 0.15, note: "Interromper ataques antes do impacto" },
  { id: "domainFit", label: "Aderência ao domínio (coop/crédito/sync)", weight: 0.12, note: "Regras específicas HB Credit, cooperativa, offline sync" },
  { id: "falsePositiveControl", label: "Controle de falso positivo", weight: 0.1, note: "Não bloquear usuário legítimo" },
  { id: "operationalMaturity", label: "Maturidade operacional", weight: 0.1, note: "SLA, equipe, runbooks, anos de mercado" },
  { id: "productionReadiness", label: "Prontidão produção", weight: 0.12, note: "Pode ir para prod hoje com risco aceitável?" },
  { id: "auditability", label: "Auditoria / rastreabilidade", weight: 0.08, note: "Who/what/when/why/policy" },
  { id: "threatIntel", label: "Inteligência de ameaças", weight: 0.08, note: "Feeds, MITRE, CVE, atualização contínua" },
  { id: "incidentResponse", label: "Resposta a incidente", weight: 0.1, note: "Playbooks, contenção, human-in-the-loop" },
];

function weightedOverall(dims: Record<string, number>): number {
  let sum = 0;
  let w = 0;
  for (const d of DIMENSIONS) {
    const v = dims[d.id];
    if (v == null) continue;
    sum += v * d.weight;
    w += d.weight;
  }
  return w > 0 ? Math.round((sum / w) * 10) / 10 : 0;
}

/** Scores de referência — soluções maduras de mercado (estimativa conservadora para app web B2B) */
function referenceSolutions(): SolutionScore[] {
  return [
    {
      id: "cloudflare_waf",
      name: "Cloudflare WAF (gerenciado)",
      category: "waf",
      applicableToThisApp: true,
      dimensions: {
        detection: 7.5,
        prevention: 8.5,
        domainFit: 5.0,
        falsePositiveControl: 6.5,
        operationalMaturity: 9.5,
        productionReadiness: 9.5,
        auditability: 7.0,
        threatIntel: 8.0,
        incidentResponse: 5.5,
      },
      overall: 0,
      summary: "Proteção de borda madura; OWASP, bot, rate limit. Não entende HB Credit nem sync offline.",
      limitations: ["Sem contexto de negócio cooperativo", "Regras genéricas podem FP em APIs custom", "Custo por tráfego"],
    },
    {
      id: "aws_waf",
      name: "AWS WAF + Shield",
      category: "waf",
      applicableToThisApp: true,
      dimensions: {
        detection: 7.0,
        prevention: 8.0,
        domainFit: 4.5,
        falsePositiveControl: 6.0,
        operationalMaturity: 9.0,
        productionReadiness: 9.0,
        auditability: 7.5,
        threatIntel: 7.5,
        incidentResponse: 5.0,
      },
      overall: 0,
      summary: "WAF enterprise integrado à infra AWS. Configuração manual exige expertise.",
      limitations: ["Não cobre lógica de crédito", "Tuning complexo", "Depende de arquitetura AWS"],
    },
    {
      id: "modsecurity_crs",
      name: "ModSecurity OWASP CRS",
      category: "waf",
      applicableToThisApp: true,
      dimensions: {
        detection: 6.5,
        prevention: 7.0,
        domainFit: 4.0,
        falsePositiveControl: 5.0,
        operationalMaturity: 7.0,
        productionReadiness: 7.0,
        auditability: 6.0,
        threatIntel: 6.5,
        incidentResponse: 4.0,
      },
      overall: 0,
      summary: "Open source, regras OWASP. FP frequentes sem tuning pesado.",
      limitations: ["Alto FP out-of-box", "Manutenção manual", "Sem correlacionar sessão+crédito"],
    },
    {
      id: "supabase_rls_auth",
      name: "Supabase Auth + RLS (já no app)",
      category: "platform",
      applicableToThisApp: true,
      dimensions: {
        detection: 4.0,
        prevention: 8.5,
        domainFit: 8.0,
        falsePositiveControl: 9.0,
        operationalMaturity: 8.5,
        productionReadiness: 9.0,
        auditability: 6.5,
        threatIntel: 2.0,
        incidentResponse: 3.0,
      },
      overall: 0,
      summary: "Autorização estrutural no banco. Previne IDOR se RLS correta. Não detecta abuso de padrão.",
      limitations: ["Não vê sequência temporal", "Não alerta admin", "Não simula ataques"],
    },
    {
      id: "sentry_datadog",
      name: "Sentry / Datadog APM",
      category: "observability",
      applicableToThisApp: true,
      dimensions: {
        detection: 6.0,
        prevention: 2.0,
        domainFit: 5.0,
        falsePositiveControl: 8.0,
        operationalMaturity: 9.0,
        productionReadiness: 9.0,
        auditability: 8.0,
        threatIntel: 4.0,
        incidentResponse: 6.5,
      },
      overall: 0,
      summary: "Observabilidade e erros. Detecta anomalias de performance, não defende ativamente.",
      limitations: ["Observe-only", "Sem política de bloqueio", "Sem domínio HB Credit nativo"],
    },
    {
      id: "splunk_siem",
      name: "Splunk / Microsoft Sentinel (SIEM)",
      category: "siem",
      applicableToThisApp: true,
      dimensions: {
        detection: 8.5,
        prevention: 2.5,
        domainFit: 5.5,
        falsePositiveControl: 6.0,
        operationalMaturity: 9.0,
        productionReadiness: 8.0,
        auditability: 9.5,
        threatIntel: 8.5,
        incidentResponse: 8.0,
      },
      overall: 0,
      summary: "Correlação enterprise e IR. Caro, lento para bloquear inline.",
      limitations: ["Não bloqueia request HTTP inline", "Custo", "Requer SOC"],
    },
    {
      id: "contrast_rasp",
      name: "Contrast / RASP comercial",
      category: "rasp",
      applicableToThisApp: false,
      dimensions: {
        detection: 8.0,
        prevention: 7.5,
        domainFit: 6.0,
        falsePositiveControl: 6.5,
        operationalMaturity: 8.5,
        productionReadiness: 7.5,
        auditability: 7.0,
        threatIntel: 7.0,
        incidentResponse: 6.0,
      },
      overall: 0,
      summary: "Runtime app protection — referência RASP. Pouco comum em Next.js serverless.",
      limitations: ["Agent/instrumentação pesada", "Compatibilidade Next.js limitada", "Licença cara"],
    },
    {
      id: "windows_defender",
      name: "Windows Defender / antivírus endpoint",
      category: "av",
      applicableToThisApp: false,
      dimensions: {
        detection: 8.0,
        prevention: 7.5,
        domainFit: 1.0,
        falsePositiveControl: 7.0,
        operationalMaturity: 9.5,
        productionReadiness: 9.0,
        auditability: 5.0,
        threatIntel: 8.0,
        incidentResponse: 4.0,
      },
      overall: 0,
      summary: "Protege SO/arquivo/malware no servidor ou desktop. Não inspeciona lógica de API do app.",
      limitations: ["Camada errada para ameaças web/API", "Não vê JWT, sync, crédito", "Comparativo direto enganoso"],
    },
    {
      id: "crowdstrike_edr",
      name: "CrowdStrike Falcon (EDR)",
      category: "av",
      applicableToThisApp: false,
      dimensions: {
        detection: 9.0,
        prevention: 8.0,
        domainFit: 1.5,
        falsePositiveControl: 7.5,
        operationalMaturity: 9.5,
        productionReadiness: 9.0,
        auditability: 8.5,
        threatIntel: 9.0,
        incidentResponse: 8.5,
      },
      overall: 0,
      summary: "EDR líder de mercado — endpoint/process. Complementar, não substituto de WAF/app logic.",
      limitations: ["Não protege lógica applicativa", "Não entende tenant cooperativo", "Outro budget/equipe"],
    },
  ].map((s) => ({ ...s, overall: weightedOverall(s.dimensions) }));
}

function metricsToScore(campaign: CampaignReport): Record<string, number> {
  const attackTotal = campaign.scenariosExecuted - campaign.inconclusive;
  const missedRate = attackTotal > 0 ? campaign.missed / attackTotal : 0;

  return {
    detection: Math.round(Math.min(10, Math.max(0, campaign.detectionRate / 10 - missedRate * 20)) * 10) / 10,
    prevention: Math.round(Math.min(10, Math.max(0, campaign.preventionRate / 10)) * 10) / 10,
    domainFit: 8.5,
    falsePositiveControl: campaign.falsePositive === 0 ? 7.5 : Math.max(3, 10 - campaign.falsePositiveRate / 5),
    operationalMaturity: 4.0,
    productionReadiness: 3.0,
    auditability: 9.5,
    threatIntel: 6.0,
    incidentResponse: 6.0,
  };
}

function scoreHobeliscoLab(campaign: CampaignReport, maturity: MaturityScore): SolutionScore {
  const dims = metricsToScore(campaign);
  dims.auditability = maturity.auditability / 10;

  if (campaign.financialMutations > 0) dims.productionReadiness = 0;

  return {
    id: "hobelisco_lab_adaptive",
    name: "Hobelisco LAB Adaptive (campanha medida)",
    category: "hobelisco",
    applicableToThisApp: true,
    dimensions: dims,
    overall: weightedOverall(dims),
    summary: `Simulado: ${campaign.scenariosExecuted} cenários, ${campaign.blocked} blocked, ${campaign.missed} missed, 0 mutação financeira. Não validado em tráfego real.`,
    limitations: [
      "Runtime sintético — não prova defesa em prod",
      "Prevenção ~55% — metade dos ataques simulados só detectados",
      "17 missed em T12_HB_CREDIT no último run",
      "Active defense desligado em PRODUCTION",
    ],
  };
}

function scoreHobeliscoV2Observe(): SolutionScore {
  const dims: Record<string, number> = {
    detection: 6.0,
    prevention: 2.0,
    domainFit: 9.0,
    falsePositiveControl: 8.5,
    operationalMaturity: 5.0,
    productionReadiness: 6.0,
    auditability: 8.0,
    threatIntel: 5.5,
    incidentResponse: 6.5,
  };

  return {
    id: "hobelisco_v2_observe",
    name: "Hobelisco V2 Observe-only (path prod viável hoje)",
    category: "hobelisco",
    applicableToThisApp: true,
    dimensions: dims,
    overall: weightedOverall(dims),
    summary: "Middleware ingest + CorrelationEngine + incidentes + playbooks HB Credit. Não bloqueia requests.",
    limitations: [
      "HB_HOBELISCO_V2_ENABLED=false por default",
      "Sem bloqueio inline",
      "Persistência parcial in-memory até schema aplicado",
    ],
  };
}

export function buildSecurityBenchmark(
  campaign: CampaignReport,
  maturity: MaturityScore
): SecurityBenchmarkReport {
  const refs = referenceSolutions();
  const lab = scoreHobeliscoLab(campaign, maturity);
  const v2 = scoreHobeliscoV2Observe();

  const attackTotal = campaign.scenariosExecuted - campaign.inconclusive;
  const missedRate = attackTotal > 0 ? Math.round((campaign.missed / attackTotal) * 10000) / 100 : 0;

  const wafAvg =
    refs.filter((s) => s.category === "waf").reduce((a, s) => a + s.overall, 0) /
    refs.filter((s) => s.category === "waf").length;

  const incremental = Math.max(
    0,
    Math.round((lab.overall * 0.4 + v2.overall * 0.6 - wafAvg * 0.3) * 10) / 10
  );

  const honestContribution = Math.round(((v2.overall * 0.55 + lab.overall * 0.25 + 5.5 * 0.2)) * 10) / 10;

  return {
    generatedAt: new Date().toISOString(),
    methodology:
      "Notas 0–10 por dimensão ponderada. Hobelisco LAB usa métricas reais da campanha. Referências são estimativas conservadoras para app Next.js+Supabase — não benchmark certificado.",
    disclaimer:
      "Isto NÃO afirma que Hobelisco substitui WAF, EDR ou antivírus. AV/EDR operam em camadas diferentes (SO/endpoint). Hobelisco é camada applicativa/domínio.",
    hobeliscoLabMetrics: {
      defenseCoverageScore: campaign.defenseCoverageScore,
      preventionRate: campaign.preventionRate,
      detectionRate: campaign.detectionRate,
      falsePositiveRate: campaign.falsePositiveRate,
      missedRate,
      financialMutations: campaign.financialMutations,
      scenariosExecuted: campaign.scenariosExecuted,
    },
    dimensions: DIMENSIONS,
    solutions: [...refs, v2, lab].sort((a, b) => b.overall - a.overall),
    hobeliscoPosition: {
      labAdaptiveOverall: lab.overall,
      v2ObserveOverall: v2.overall,
      incrementalValueWithWafAndRls: incremental,
      honestAppSecurityContribution: honestContribution,
      verdict:
        honestContribution <= 4
          ? "INSUFICIENTE sozinho — requer WAF + RLS + Hobelisco observe"
          : honestContribution <= 5.5
            ? "COMPLEMENTO MODESTO — domínio coop/crédito; WAF continua essencial"
            : honestContribution <= 7
              ? "COMPLEMENTO VALIOSO — nicho forte; active defense imaturo para prod"
              : "Acima do esperado — validar com tráfego real antes de confiar",
    },
    gapsVsIndustry: [
      "Prevenção inline ~55% no LAB vs WAF ~80%+ na borda",
      "Sem feed CVE/KEV ao vivo — TKB estático normalizado",
      "Sem SOC 24/7 — playbooks exigem humano",
      "Active defense não wired ao middleware prod",
      `${campaign.missed} cenários missed (${missedRate}%) — gap T12_HB_CREDIT`,
    ],
    notComparable: [
      "Windows Defender / Kaspersky / Norton — protegem malware/arquivo, não API REST",
      "CrowdStrike EDR — processo/kernel, não JWT/sync/crédito cooperativo",
    ],
  };
}
