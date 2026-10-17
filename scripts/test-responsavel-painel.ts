/**
 * Pacote regressão painel responsável (contrato + etapa 6.2.2 legado).
 * Uso: npm run test:responsavel-painel
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");

function run(script: string): void {
  const r = spawnSync("npx", ["tsx", script], { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run("scripts/test-responsavel-painel-regression.ts");
run("scripts/test-responsavel-panel-access-etapa622.ts");

console.log("test-responsavel-painel: OK");
