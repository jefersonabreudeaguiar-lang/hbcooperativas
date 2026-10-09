/**
 * Pacote Release Oficial — gate local antes de deploy (marco zero).
 *
 * Uso:
 *   npm run release:verify           # completo (inclui perf + build)
 *   npm run release:verify:fast      # sem test:perf-fluxos/build
 *   npm run release:verify -- --skip-build   # perf sem build (PERF_SUITE_SKIP_BUILD=1)
 *
 * Não altera dados; só executa testes/scripts existentes.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");
const args = process.argv.slice(2);
const fast = args.includes("--fast");
const skipBuild = args.includes("--skip-build");
const strictEnv = (process.env.RELEASE_VERIFY_STRICT ?? "").trim() === "1";

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!process.env[key]) {
      process.env[key] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

type Step = {
  phase: string;
  title: string;
  cmd: string;
  stepArgs: string[];
  optional?: boolean;
  env?: Record<string, string>;
};

const PHASE_ENV: Step[] = [
  {
    phase: "0",
    title: "Flags rollout oficial (env — use RELEASE_VERIFY_STRICT=1 no pipeline de deploy)",
    cmd: "npm",
    stepArgs: ["run", "verify:official-rollout"],
    optional: !strictEnv,
  },
];

const PHASE_BIC: Step[] = [
  {
    phase: "1",
    title: "BIC lab boundary",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-bic-lab-boundary.ts"],
  },
  {
    phase: "1",
    title: "BIC sync contract",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-bic-sync-contract.ts"],
  },
  {
    phase: "1",
    title: "Início card policy",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-cooperado-inicio-card-policy.ts"],
  },
  {
    phase: "1",
    title: "Cooperado financeiro UI snapshot (PASSO 25)",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-cooperado-financeiro-ui-snapshot.ts"],
  },
  {
    phase: "1",
    title: "Início card BIC × recibo (legado)",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-cooperado-inicio-card-bic-recibo-legado.ts"],
  },
];

const PHASE_HB: Step[] = [
  {
    phase: "2",
    title: "Invariantes E2E alinhamento",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-e2e-alignment-invariants.ts"],
  },
  {
    phase: "2",
    title: "Pagamento confirmado responsável",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-pagamento-confirmado-responsavel.ts"],
  },
  {
    phase: "2",
    title: "Ficha pagamento guard H8935",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-ficha-corrida-pagamento-guard-h8935.ts"],
  },
  {
    phase: "2",
    title: "HB Créditos P0 segurança",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-hb-credit-p0-security.ts"],
  },
  {
    phase: "2",
    title: "HB base × valor a receber",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-hb-credit-base-alignment.ts"],
  },
  {
    phase: "2",
    title: "Guard financeiro cooperado",
    cmd: "npx",
    stepArgs: ["tsx", "scripts/test-cooperado-financeiro-guard.ts"],
    optional: true,
  },
];

const PHASE_PERF: Step[] = [
  {
    phase: "3",
    title: "Perf + fluxos notas/sync + build",
    cmd: "npm",
    stepArgs: ["run", "test:perf-fluxos"],
    env: skipBuild ? { PERF_SUITE_SKIP_BUILD: "1" } : undefined,
  },
];

function runStep(step: Step): boolean {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`Fase ${step.phase} — ${step.title}`);
  console.log(`${"─".repeat(64)}`);
  const r = spawnSync(step.cmd, step.stepArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...step.env },
  });
  if (r.status === 0) return true;
  if (step.optional) {
    console.warn(`⚠ Opcional falhou (continuando): ${step.title}`);
    return true;
  }
  console.error(`✗ Falhou: ${step.title}`);
  return false;
}

const steps = [...PHASE_ENV, ...PHASE_BIC, ...PHASE_HB, ...(fast ? [] : PHASE_PERF)];

console.log("HB Cooperativas — RELEASE VERIFY (marco zero)");
console.log(`Modo: ${fast ? "rápido (sem perf/build)" : skipBuild ? "perf sem build" : "completo"}`);
console.log(`Passos: ${steps.length}\n`);

const t0 = Date.now();
let ok = true;
for (const step of steps) {
  if (!runStep(step)) {
    ok = false;
    break;
  }
}

const sec = ((Date.now() - t0) / 1000).toFixed(1);
if (!ok) {
  console.error(`\nrelease:verify FALHOU (${sec}s)`);
  process.exit(1);
}
console.log(`\n✓ release:verify OK (${sec}s)`);
