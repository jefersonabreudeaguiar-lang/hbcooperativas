/**
 * Smoke estático — Início L1 (live leaf) + política DOM 361.
 * npx tsx scripts/test-cooperado-inicio-l1-gate.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const dash = read("src/app/(app)/dashboard/DashboardContent.tsx");
const leaf = read("src/components/cooperado/CooperadoInicioCooperadoLiveLeaf.tsx");
const policy = read("src/lib/performance/cooperadoMobileTabDomPolicy.ts");
const layout = read("src/components/layout/AppLayout.tsx");

assert(leaf.includes("CooperadoInicioCooperadoLiveRoot"), "leaf exporta LiveRoot");
assert(
  dash.includes("CooperadoInicioCooperadoLiveRoot") &&
    dash.includes("CooperadoInicioOláTitulo") &&
    dash.includes("CooperadoInicioAssinaturaOnboardingLive"),
  "dashboard usa folhas L1 do Início"
);
assert(
  !dash.includes("const cooperadoLive = useAppDataSelector"),
  "dashboard sem selector duplicado cooperadoLive"
);
assert(
  !dash.includes("<OnboardingChecklist") && !dash.includes("<AssinaturaStatusAviso"),
  "assinatura/onboarding só via folha live"
);
assert(policy.includes("361-inicio-live-l1"), "política DOM 361 inicio live");
assert(layout.includes("CooperadoApresentacaoFinanceiraGate"), "shell cooperado com gate financeiro");

console.log("test-cooperado-inicio-l1-gate.ts done.");
