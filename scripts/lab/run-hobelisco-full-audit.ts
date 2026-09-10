#!/usr/bin/env npx tsx
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runFullOrganismAudit } from "@lab/hobelisco-hx/full-audit/runFullAudit";
import {
  formatFullAuditMarkdown,
  formatFullAuditText,
} from "@lab/hobelisco-hx/full-audit/reportFormatter";
import { compareDefenses, buildEvolutionReport } from "@lab/hobelisco-hx/evolution/EvolutionEngine";
import { computeMetrics, DefenseRegistry } from "@lab/hobelisco-hx/reincarnation/DefenseRegistry";

process.env.HOBELISCO_ENVIRONMENT = "LAB";
process.env.HB_HOBELISCO_LAB_ENABLED = "true";

const report = runFullOrganismAudit();
const ts = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
const docsDir = join(process.cwd(), "docs");
mkdirSync(dir, { recursive: true });
mkdirSync(docsDir, { recursive: true });

writeFileSync(join(dir, `final-audit-${ts}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(dir, `final-audit-${ts}.txt`), formatFullAuditText(report), "utf8");
writeFileSync(join(docsDir, "HOBELISCO-LAB-FINAL-AUDIT.md"), formatFullAuditMarkdown(report), "utf8");

const reg = new DefenseRegistry();
const a = reg.register("DEFENSE-001", "v1");
const b = reg.register("DEFENSE-002", "v2", { parentDefenseId: a.id });
a.metrics = computeMetrics({ simulations: 100, passed: 70, contained: 60, recovered: 50, falsePositives: 5, falseNegatives: 10 });
b.metrics = computeMetrics({ simulations: 100, passed: 85, contained: 75, recovered: 65, falsePositives: 3, falseNegatives: 5 });
const evoReport = buildEvolutionReport([compareDefenses(a, b)]);
writeFileSync(join(dir, `evolution-report-${ts}.json`), JSON.stringify(evoReport, null, 2), "utf8");

console.log(formatFullAuditText(report));
console.log(`\nRelatórios:\n  lab/hobelisco-hx/reports/final-audit-${ts}.json\n  docs/HOBELISCO-LAB-FINAL-AUDIT.md`);

process.exit(report.organismVerdict === "ORGANISM-RED" ? 1 : 0);
