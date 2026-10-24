/**
 * Gate Fase 4 — homologação cooperado (contratos + paridade nuvem piloto, read-only).
 *   npm run cooperado:verify:fase4
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");

const steps: { title: string; cmd: string; args: string[] }[] = [
  { title: "Preservar app (cooperado)", cmd: "npm", args: ["run", "gate:preservar-app"] },
  { title: "Fase 2 fluidez v566", cmd: "npx", args: ["tsx", "scripts/test-cooperado-fase2-tab-fluidez-v566.ts"] },
  { title: "GA auto-sync revisão nuvem", cmd: "npx", args: ["tsx", "scripts/test-cooperado-ga-auto-revision-sync.ts"] },
  { title: "Financeiro UI snapshot", cmd: "npx", args: ["tsx", "scripts/test-cooperado-financeiro-ui-snapshot.ts"] },
  { title: "Início card BIC × recibo", cmd: "npx", args: ["tsx", "scripts/test-cooperado-inicio-card-bic-recibo-legado.ts"] },
  { title: "Início card policy", cmd: "npx", args: ["tsx", "scripts/test-cooperado-inicio-card-policy.ts"] },
  {
    title: "Homolog Jeferson operacional (nuvem read-only)",
    cmd: "npx",
    args: ["tsx", "scripts/homolog-jeferson-operacional-slice-readonly.ts"],
  },
  { title: "H203 apresentação consolidada", cmd: "npx", args: ["tsx", "scripts/test-h203-apresentacao-consolidada.ts"] },
];

console.log("Cooperado — Fase 4 verify\n");
const t0 = Date.now();
for (const step of steps) {
  console.log(`\n── ${step.title}`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`\n✗ Fase 4 verify FALHOU em: ${step.title}`);
    process.exit(1);
  }
}
console.log(`\n✓ Fase 4 verify OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
