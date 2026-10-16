/**
 * Gera mapa de cobertura da porta BIC (read-only).
 * npx tsx scripts/generate-bic-cobertura-leitura.ts
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const SRC = join(ROOT, "src");

type Bucket = {
  id: string;
  label: string;
  pattern: RegExp;
  preferPorta: boolean;
};

const BUCKETS: Bucket[] = [
  {
    id: "porta_cooperado",
    label: "cooperadoLeituraFinanceiraExibicao / bicLeituraPorta",
    pattern: /cooperadoLeituraFinanceiraExibicao|bicLeituraPorta|leituraCooperadoFinanceira/,
    preferPorta: true,
  },
  {
    id: "bic_central_direct",
    label: "bicCentralLeitura* / bicLeituraCentralCooperado",
    pattern: /bicCentralLeitura|from ["']@\/services\/bicLeituraCentralCooperado/,
    preferPorta: false,
  },
  {
    id: "paridade_legado_direto",
    label: "leituraFinanceiraParidadeCooperado direto na UI",
    pattern: /leituraFinanceiraParidadeCooperado/,
    preferPorta: false,
  },
  {
    id: "hb_credit_bic",
    label: "hbCreditLeituraBic",
    pattern: /hbCreditLeituraBic|hbCreditValorAReceberAgregado/,
    preferPorta: false,
  },
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

function rel(p: string): string {
  return p.replace(ROOT + "\\", "").replace(ROOT + "/", "").replace(/\\/g, "/");
}

function main() {
  const files = walk(SRC);
  const hits: Record<string, string[]> = {};
  for (const b of BUCKETS) hits[b.id] = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const b of BUCKETS) {
      if (b.pattern.test(text)) hits[b.id].push(rel(file));
    }
  }

  const legadoUi = hits.paridade_legado_direto.filter(
    (f) =>
      !f.includes("cooperadoFinanceiroParidadeUniversal") &&
      !f.includes("bicLeituraCentralCooperado") &&
      !f.includes("bicLeituraPorta") &&
      !f.includes("cooperadoLeituraFinanceiraExibicao") &&
      !f.includes("cooperadoFinanceiroParidadeProbe") &&
      !f.includes("CooperadoMinhaFichaTab")
  );

  const report = {
    generatedAt: new Date().toISOString(),
    movement: "II",
    buckets: BUCKETS.map((b) => ({
      id: b.id,
      label: b.label,
      preferPorta: b.preferPorta,
      fileCount: hits[b.id].length,
      files: hits[b.id].sort(),
    })),
    gaps: {
      uiLegadoParidadeDireta: {
        fileCount: legadoUi.length,
        files: legadoUi.sort(),
      },
    },
    notes:
      "Movimento II migra gaps.uiLegadoParidadeDireta para cooperadoLeituraFinanceiraExibicao / porta.",
  };

  const outDir = join(ROOT, "docs/bic");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "cobertura-leitura.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`OK generate-bic-cobertura-leitura → ${rel(outPath)}`);
  console.log(`  porta_cooperado: ${hits.porta_cooperado.length} arquivos`);
  console.log(`  gaps UI legado: ${legadoUi.length} arquivos`);
}

main();
