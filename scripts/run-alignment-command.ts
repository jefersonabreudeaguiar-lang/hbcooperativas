/**
 * Ordem única de alinhamento profissional (local + nuvem opcional).
 *
 * Uso:
 *   npm run alignment:command              # testes locais
 *   npm run alignment:command -- --cloud   # + auditoria produção (.env.local)
 *   npm run alignment:command -- --cloud --repair  # + reparo nota×ficha + HB limites
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const withCloud = args.includes("--cloud");
const withRepair = args.includes("--repair");
const root = process.cwd();

type Step = { title: string; cmd: string; args: string[]; optional?: boolean };

const localSteps: Step[] = [
  { title: "Invariantes E2E (cooperado ↔ responsável ↔ HB)", cmd: "npx", args: ["tsx", "scripts/test-e2e-alignment-invariants.ts"] },
  { title: "Guard financeiro cooperado", cmd: "npm", args: ["run", "test:cooperado-financeiro"] },
  { title: "HB base × valor a receber", cmd: "npx", args: ["tsx", "scripts/test-hb-credit-base-alignment.ts"] },
  { title: "Fluxo entregas", cmd: "npm", args: ["run", "test:entregas"] },
  { title: "Fluxos de sync", cmd: "npm", args: ["run", "test:sync-flows"] },
  { title: "HB valor receber híbrido", cmd: "npm", args: ["run", "test:hb-valor-receber"] },
];

const cloudSteps: Step[] = [
  { title: "Auditoria alinhamento completo (nuvem)", cmd: "npx", args: ["tsx", "scripts/audit-alinhamento-completo.ts"] },
  { title: "Auditoria limites HB fantasma", cmd: "npx", args: ["tsx", "scripts/audit-hb-limites-ghost.ts"] },
  { title: "HB base vs valor a receber (nuvem)", cmd: "npx", args: ["tsx", "scripts/audit-hb-base-vs-valor-receber.ts"], optional: true },
];

const repairSteps: Step[] = [
  { title: "Reconciliar ficha no operacional.json (nuvem)", cmd: "npx", args: ["tsx", "scripts/reconciliar-ficha-operacional-cloud.ts"] },
  { title: "Reparo centavos nota × ficha (nuvem)", cmd: "npx", args: ["tsx", "scripts/repair-notas-totais-ficha-cloud.ts"] },
  { title: "Sync limites HB alinhados à ficha", cmd: "npx", args: ["tsx", "scripts/sync-hb-credit-limites-cooperativa.ts"] },
];

function runStep(step: Step): boolean {
  console.log(`\n${"─".repeat(60)}\n▶ ${step.title}\n`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status === 0) return true;
  if (step.optional) {
    console.warn(`⚠ Opcional falhou (continuando): ${step.title}`);
    return true;
  }
  console.error(`✗ Falhou: ${step.title}`);
  return false;
}

console.log("HB Cooperativas — COMANDO DE ALINHAMENTO E2E");
console.log(`Modo: ${withCloud ? "local + nuvem" : "local"}${withRepair ? " + reparo" : ""}`);

let ok = true;
for (const step of localSteps) {
  if (!runStep(step)) {
    ok = false;
    break;
  }
}

if (ok && withCloud) {
  for (const step of cloudSteps) {
    if (!runStep(step)) {
      ok = false;
      break;
    }
  }
}

if (ok && withRepair) {
  for (const step of repairSteps) {
    if (!runStep(step)) {
      ok = false;
      break;
    }
  }
  if (ok && withCloud) {
    ok = runStep({
      title: "Re-auditoria pós-reparo",
      cmd: "npx",
      args: ["tsx", "scripts/audit-alinhamento-completo.ts"],
    });
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(ok ? "✓ COMANDO DE ALINHAMENTO concluído com sucesso." : "✗ COMANDO interrompido — corrija falhas acima.");
process.exit(ok ? 0 : 1);
