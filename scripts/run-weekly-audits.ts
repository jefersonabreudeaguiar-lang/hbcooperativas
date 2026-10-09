/**
 * Onda 1.5 — pacote de auditorias read-only (nuvem). Grava relatório em scripts/reports/.
 *
 * Uso:
 *   npx tsx scripts/run-weekly-audits.ts [cnpj]
 *   npm run audit:weekly
 *
 * Requer .env.local (Supabase service role). Não altera dados.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");
const cnpj = (process.argv[2] ?? "62351750000165").replace(/\D/g, "");
const reportsDir = resolve(root, "scripts", "reports");
mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const summaryPath = resolve(reportsDir, `weekly-audit-${cnpj}-${stamp}.md`);

type Audit = { name: string; script: string; args: string[]; critical: boolean };

const audits: Audit[] = [
  { name: "Contadores × relatório (a pagar)", script: "audit-contadores-alinhamento-once.ts", args: [cnpj], critical: true },
  { name: "A receber × ficha", script: "audit-a-receber-vs-ficha-once.ts", args: [cnpj], critical: true },
  { name: "Fila conferência (notas)", script: "audit-fila-conferencia-cooperativa-once.ts", args: [cnpj], critical: false },
  { name: "HB limites fantasma", script: "audit-hb-limites-ghost.ts", args: [], critical: true },
];

const lines: string[] = [
  `# Auditoria semanal HB Coop`,
  ``,
  `- CNPJ: ${cnpj}`,
  `- Gerado: ${new Date().toISOString()}`,
  ``,
];

let failedCritical = 0;

for (const a of audits) {
  const scriptPath = resolve(root, "scripts", a.script);
  const r = spawnSync("npx", ["tsx", scriptPath, ...a.args], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const ok = r.status === 0;
  const logPath = resolve(reportsDir, `${stamp}-${a.script.replace(/\.ts$/, "")}.log`);
  writeFileSync(logPath, out + "\n", "utf8");

  lines.push(`## ${a.name}`);
  lines.push(``);
  lines.push(`- Script: \`${a.script}\``);
  lines.push(`- Status: ${ok ? "OK" : "FALHOU"}`);
  lines.push(`- Log: \`${logPath.replace(/\\/g, "/")}\``);
  lines.push(``);
  if (!ok && a.critical) failedCritical++;
  if (!ok && out) {
    lines.push("```");
    lines.push(out.split("\n").slice(-25).join("\n"));
    lines.push("```");
    lines.push(``);
  }
}

writeFileSync(summaryPath, lines.join("\n"), "utf8");
console.log(`Relatório: ${summaryPath}`);

if (failedCritical > 0) {
  console.error(`✗ ${failedCritical} auditoria(s) crítica(s) falharam`);
  process.exit(1);
}
console.log("✓ Auditorias semanais concluídas (críticas OK)");
