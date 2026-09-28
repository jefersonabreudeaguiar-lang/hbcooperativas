/**
 * LAB B4 — UI cooperado não importa motores legados de valor a receber diretamente.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(process.cwd(), "src/app/(app)");
const FORBIDDEN = [
  /\bgetValorQuantoVouReceber\b/,
  /\bgetInicioCooperadoParaExibicao\b/,
  /\bgetQuantoVouReceberCooperadoParaExibicao\b/,
  /\bgetPainelQuantoVouReceberCooperadoParaExibicao\b/,
  /\bgetMesPrincipalQuantoVouReceber\b/,
  /\blistarMesesPendentesQuantoVouReceber\b/,
];

function walk(dir: string, acc: string[] = []): string[] {
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
  for (const file of walk(ROOT)) {
    const rel = path.relative(process.cwd(), file);
    const src = fs.readFileSync(file, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(src)) {
        hits.push(`${rel} → ${re.source}`);
      }
    }
  }
  assert.equal(hits.length, 0, `B4 LAB wiring: imports legados na UI:\n${hits.join("\n")}`);
  console.log("B4 LAB UI wiring: OK (valor a receber via bicLeituraCentralCooperado)");
}

main();
