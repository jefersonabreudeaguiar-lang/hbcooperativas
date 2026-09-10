import { execSync } from "node:child_process";
import type { ImpactScenario, PlanIteration, ProductionImpactReport } from "./types";
import { PRODUCTION_MITIGATIONS } from "./mitigations";
import { buildScenarioCatalog } from "./scenarioCatalog";

const IMPLEMENTATION_PLANS: {
  iteration: number;
  label: string;
  order: string[];
  flags: string[];
  /** Mitigações ainda "ingênua" nesta iteração (resto usa refined) */
  naiveMitigations: Set<string>;
}[] = [
  {
    iteration: 1,
    label: "Big bang — tudo junto, sem testes",
    order: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"],
    flags: [],
    naiveMitigations: new Set(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"]),
  },
  {
    iteration: 2,
    label: "Só P0 isolado (M1 + M2)",
    order: ["M2", "M1"],
    flags: ["test:sync-flows gate"],
    naiveMitigations: new Set(["M1"]),
  },
  {
    iteration: 3,
    label: "P0 + M3 warn-only + M5",
    order: ["M2", "M1", "M3", "M5"],
    flags: ["M3_WARN_ONLY", "M5_LEGACY_EXEMPT"],
    naiveMitigations: new Set([]),
  },
  {
    iteration: 4,
    label: "P1 M4 flag off + M6 alerta",
    order: ["M2", "M1", "M3", "M5", "M6", "M4"],
    flags: ["M3_WARN_ONLY", "HB_SYNC_SLICES=false", "M5_LEGACY_EXEMPT"],
    naiveMitigations: new Set(["M4"]),
  },
  {
    iteration: 5,
    label: "Plano final — ordem + flags + pilot",
    order: ["M2", "M1", "M3", "M5", "M6", "M4", "M8", "M7"],
    flags: [
      "M3_WARN_ONLY→BLOCK após 7d",
      "HB_SYNC_SLICES=pilot 1 CNPJ",
      "M5_LEGACY_EXEMPT",
      "M7 opt-in",
      "M8 manual confirm",
    ],
    naiveMitigations: new Set([]),
  },
];

function scenarioPasses(s: ImpactScenario, naive: boolean): boolean {
  return naive ? s.naiveOk : s.refinedOk;
}

function runRegressionTests(): { name: string; passed: boolean; detail: string }[] {
  const tests: { name: string; cmd: string }[] = [
    { name: "test:sync-flows", cmd: "npm run test:sync-flows" },
  ];

  const results: { name: string; passed: boolean; detail: string }[] = [];

  for (const t of tests) {
    try {
      execSync(t.cmd, { cwd: process.cwd(), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      results.push({ name: t.name, passed: true, detail: "OK" });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
      const failLine = out.split("\n").find((l) => l.startsWith("FAIL:")) ?? out.slice(0, 200);
      results.push({ name: t.name, passed: false, detail: failLine || "Falhou" });
    }
  }

  return results;
}

function evaluateScenario(s: ImpactScenario, plan: (typeof IMPLEMENTATION_PLANS)[0]): boolean {
  if (s.mitigationsInvolved.length === 0) {
    return s.naiveOk;
  }

  const allPlanned = s.mitigationsInvolved.every((m) => plan.order.includes(m));
  if (!allPlanned) {
    if (s.mitigationsInvolved.includes("M2") && !plan.order.includes("M2")) return false;
    return s.naiveOk;
  }

  const rushed = s.mitigationsInvolved.some((m) => plan.naiveMitigations.has(m));
  return rushed ? s.naiveOk : s.refinedOk;
}

export function runProductionImpactAudit(): ProductionImpactReport {
  const scenarios = buildScenarioCatalog();
  const iterations: PlanIteration[] = [];

  for (const plan of IMPLEMENTATION_PLANS) {
    const blockers: string[] = [];
    let passed = 0;
    const total = scenarios.length;

    for (const s of scenarios) {
      const ok = evaluateScenario(s, plan);
      if (ok) passed += 1;
      else blockers.push(`${s.id} ${s.title}`);
    }

    iterations.push({
      iteration: plan.iteration,
      label: plan.label,
      order: plan.order,
      flags: plan.flags,
      successPct: Math.round((passed / total) * 1000) / 10,
      passed,
      total,
      blockers: blockers.slice(0, 10),
    });
  }

  const regressionTests = runRegressionTests();
  const finalIter = iterations[iterations.length - 1];
  let finalSuccessPct = finalIter.successPct;

  if (regressionTests.some((t) => !t.passed)) {
    finalSuccessPct = Math.min(finalSuccessPct, 94.3);
  }

  const readyForProduction = finalSuccessPct >= 97 && regressionTests.every((t) => t.passed);

  return {
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Simulação de impacto — NENHUMA alteração em src/ produção. Avalia o que mudaria SE as mitigações do lab fossem implementadas.",
    mitigations: PRODUCTION_MITIGATIONS,
    scenarios,
    iterations,
    regressionTests,
    finalSuccessPct,
    readyForProduction,
    goOrder: ["M2", "M1", "M3 (warn)", "M5", "M6", "M4 (flag pilot)", "M8", "M7"],
    doNotDoYet: [
      "M4 slices default ON para todos CNPJs",
      "M3 block hard sem warn-only",
      "M7 arquivamento automático sem export",
      "M8 merge automático homônimos",
      "Big bang M1–M8 num único deploy",
    ],
  };
}
