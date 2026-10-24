/**
 * Gate lançamento — responsável / staff (contratos + paridade + sync).
 *   npm run responsavel:verify:lancamento
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");

const steps: { title: string; cmd: string; args: string[] }[] = [
  { title: "Preservar app (staff + responsável)", cmd: "npm", args: ["run", "gate:preservar-app"] },
  { title: "Painel abertura", cmd: "npx", args: ["tsx", "scripts/test-responsavel-panel-access-etapa622.ts"] },
  { title: "Primeiro dia / Contratos", cmd: "npx", args: ["tsx", "scripts/test-staff-primeiro-dia-contratos.ts"] },
  { title: "Troca abas rápida", cmd: "npx", args: ["tsx", "scripts/test-responsavel-troca-abas-rapida.ts"] },
  { title: "Em aberto × Pagar paridade", cmd: "npx", args: ["tsx", "scripts/test-responsavel-em-aberto-pagar-paridade.ts"] },
  { title: "Valores reais paridade v500", cmd: "npx", args: ["tsx", "scripts/test-staff-valores-reais-paridade-v500.ts"] },
  { title: "Atualizar não zera v497", cmd: "npx", args: ["tsx", "scripts/test-staff-gestao-atualizar-nao-zera-v497.ts"] },
  { title: "Conferir fila não zera v498", cmd: "npx", args: ["tsx", "scripts/test-staff-conferir-fila-nao-zera-v498.ts"] },
  { title: "Cold hydrate operacional pull", cmd: "npx", args: ["tsx", "scripts/test-staff-cold-hydrate-operacional-pull.ts"] },
  { title: "Live sync leve", cmd: "npx", args: ["tsx", "scripts/test-staff-gestao-live-sync.ts"] },
  { title: "Gestão F5 instantâneo v505", cmd: "npx", args: ["tsx", "scripts/test-staff-gestao-f5-instantaneo-v505.ts"] },
];

console.log("Responsável — verify lançamento\n");
const t0 = Date.now();
for (const step of steps) {
  console.log(`\n── ${step.title}`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`\n✗ responsavel:verify:lancamento FALHOU em: ${step.title}`);
    process.exit(1);
  }
}
console.log(`\n✓ responsavel:verify:lancamento OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
