#!/usr/bin/env npx tsx
/**
 * Roda auditoria sync/atualização — lab isolado.
 * Uso: npm run lab:sync-audit
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { formatReportText, runSyncAudit } from "../../lab/sync-update/scoreAudit";

const report = runSyncAudit();
const text = formatReportText(report);

console.log(text);

const outDir = join(process.cwd(), "lab", "sync-update", "reports");
mkdirSync(outDir, { recursive: true });
const stamp = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
const jsonPath = join(outDir, `audit-${stamp}.json`);
const txtPath = join(outDir, `audit-${stamp}.txt`);

writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
writeFileSync(txtPath, text, "utf8");

console.log("");
console.log(`Relatório JSON: ${jsonPath}`);
console.log(`Relatório TXT:  ${txtPath}`);

process.exit(0);
