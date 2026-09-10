#!/usr/bin/env npx tsx
/** Simula impacto de promover lab → produção. Não altera src/. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runProductionImpactAudit } from "../../lab/production-impact-audit/impactSimulator";
import { formatProductionImpactReport } from "../../lab/production-impact-audit/reportFormatter";

const report = runProductionImpactAudit();
const text = formatProductionImpactReport(report);
console.log(text);

const outDir = join(process.cwd(), "lab", "production-impact-audit", "reports");
mkdirSync(outDir, { recursive: true });
const stamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(join(outDir, `impact-${stamp}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(outDir, `impact-${stamp}.txt`), text, "utf8");

console.log(`\nRelatório lab: lab/production-impact-audit/reports/impact-${stamp}.txt`);
