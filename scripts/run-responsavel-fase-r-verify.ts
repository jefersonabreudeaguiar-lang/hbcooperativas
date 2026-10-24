/**
 * Gate Fase R — responsável ponta a ponta (lançamento + desempenho + experiência única + homolog nuvem).
 *   npm run responsavel:verify:fase-r
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");

const steps: { title: string; cmd: string; args: string[] }[] = [
  { title: "Lançamento (núcleo)", cmd: "npm", args: ["run", "responsavel:verify:lancamento"] },
  { title: "Experiência única GA", cmd: "npx", args: ["tsx", "scripts/test-responsavel-experiencia-unica.ts"] },
  { title: "Em aberto latch pós-sync", cmd: "npx", args: ["tsx", "scripts/test-responsavel-em-aberto-latch-pos-sync.ts"] },
  { title: "Desempenho staff", cmd: "npx", args: ["tsx", "scripts/test-staff-responsavel-desempenho.ts"] },
  { title: "Keep-alive U4", cmd: "npx", args: ["tsx", "scripts/test-staff-mobile-tab-keep-alive-u4.ts"] },
  { title: "Snapshot nunca zera", cmd: "npx", args: ["tsx", "scripts/test-staff-gestao-nunca-zera-snapshot.ts"] },
  { title: "Recuperar aba (JS velho)", cmd: "npx", args: ["tsx", "scripts/test-responsavel-painel-recuperar-aba.ts"] },
  { title: "Fila notas live poll", cmd: "npx", args: ["tsx", "scripts/test-staff-fila-notas-live-poll.ts"] },
  {
    title: "Homolog operacional cooperativa (read-only)",
    cmd: "npx",
    args: ["tsx", "scripts/homolog-responsavel-operacional-slice-readonly.ts"],
  },
];

console.log("Responsável — Fase R verify\n");
const t0 = Date.now();
for (const step of steps) {
  console.log(`\n── ${step.title}`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`\n✗ Fase R verify FALHOU em: ${step.title}`);
    process.exit(1);
  }
}
console.log(`\n✓ Fase R verify OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
