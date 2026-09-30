/**
 * LAB FULL — UI app/cooperado não importa motores legados de leitura financeira diretamente.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOTS = [
  path.resolve(process.cwd(), "src/app/(app)"),
  path.resolve(process.cwd(), "src/components/cooperado"),
];

const FORBIDDEN_IMPORTS: { re: RegExp; label: string }[] = [
  { re: /from\s+["']@\/services\/dashboardService["']/, label: "dashboardService" },
  { re: /from\s+["']@\/services\/relatorioService["']/, label: "relatorioService" },
  {
    re: /import\s*\{[^}]*\bgetResumoPagamentoExibicao\b[^}]*\}\s*from\s+["']@\/services\/notaPedidoService["']/,
    label: "getResumoPagamentoExibicao@notaPedidoService",
  },
  {
    re: /import\s*\{[^}]*\bgetValorExibicaoCooperado\b[^}]*\}\s*from\s+["']@\/services\/notaPedidoService["']/,
    label: "getValorExibicaoCooperado@notaPedidoService",
  },
  {
    re: /import\s*\{[^}]*\bbuildValorExibicaoCooperadoOpts\b[^}]*\}\s*from\s+["']@\/services\/notaPedidoService["']/,
    label: "buildValorExibicaoCooperadoOpts@notaPedidoService",
  },
  {
    re: /import\s*\{[^}]*\bgetResumoMensalidadesCooperado\b[^}]*\}\s*from\s+["']@\/services\/mensalidadeService["']/,
    label: "getResumoMensalidadesCooperado@mensalidadeService",
  },
  {
    re: /import\s*\{[^}]*\btotalValoresAvulsosPendentes\b[^}]*\}\s*from\s+["']@\/services\/valoresAvulsosReceberService["']/,
    label: "totalValoresAvulsosPendentes@valoresAvulsosReceberService",
  },
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

function main() {
  const hits: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = path.relative(process.cwd(), file);
      const src = fs.readFileSync(file, "utf8");
      for (const { re, label } of FORBIDDEN_IMPORTS) {
        if (re.test(src)) hits.push(`${rel} → ${label}`);
      }
    }
  }
  assert.equal(hits.length, 0, `BIC LAB FULL wiring:\n${hits.join("\n")}`);
  console.log("BIC LAB FULL UI wiring: OK (leitura via bicLeituraCentral*)");
}

main();
