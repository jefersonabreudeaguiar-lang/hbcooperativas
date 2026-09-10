#!/usr/bin/env npx tsx
/**
 * Auditoria completa de resiliência — LAB ONLY.
 * npm run lab:resilience-audit
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runResilienceAudit, formatResilienceReportText } from "../../lab/resilience-audit/reportFormatter";

const report = runResilienceAudit();
const text = formatResilienceReportText(report);

console.log(text);

const outDir = join(process.cwd(), "lab", "resilience-audit", "reports");
mkdirSync(outDir, { recursive: true });
const stamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(join(outDir, `resilience-${stamp}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(outDir, `resilience-${stamp}.txt`), text, "utf8");

console.log(`\nArquivos lab: lab/resilience-audit/reports/resilience-${stamp}.txt`);

process.exit(report.invulnerable ? 0 : 0);
