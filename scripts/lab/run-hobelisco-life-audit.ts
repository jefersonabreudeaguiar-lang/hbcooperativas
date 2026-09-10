import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runLifeAudit } from "@lab/hobelisco-hx/life-audit/runLifeAudit";
import {
  formatLifeAuditMarkdown,
  formatLifeAuditText,
} from "@lab/hobelisco-hx/life-audit/reportFormatter";

const report = runLifeAudit();
const ts = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
const docsDir = join(process.cwd(), "docs");
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, `life-audit-${ts}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(dir, `life-audit-${ts}.txt`), formatLifeAuditText(report), "utf8");
writeFileSync(join(docsDir, "HOBELISCO-V1-LIFE-AUDIT.md"), formatLifeAuditMarkdown(report), "utf8");

console.log(formatLifeAuditText(report));
console.log(`\nRelatórios:\n  lab/hobelisco-hx/reports/life-audit-${ts}.json\n  docs/HOBELISCO-V1-LIFE-AUDIT.md`);

process.exit(report.lifeVerdict === "LIFE-RED" ? 1 : 0);
