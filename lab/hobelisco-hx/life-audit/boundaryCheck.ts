/** Verificação de boundary — lab não toca produção */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const FORBIDDEN_PATTERNS = [
  /from\s+["']@\/app\/\(app\)/,
  /from\s+["']@\/lib\/supabase\/contaCoopStorage/,
  /\.from\s*\(\s*["']hb_credit_/,
  /applyMigration/,
  /supabase\.rpc\s*\(\s*["']hb_credit_/,
  /ALTER\s+TABLE\s+hb_credit/i,
];

const LAB_ROOT = join(process.cwd(), "lab", "hobelisco-hx");

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "reports" || name === "node_modules") continue;
      walkTsFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

export interface BoundaryCheckResult {
  ok: boolean;
  violations: Array<{ file: string; pattern: string; line?: number }>;
}

export function checkHobeliscoLabBoundary(): BoundaryCheckResult {
  const violations: BoundaryCheckResult["violations"] = [];
  const files = walkTsFiles(LAB_ROOT);

  for (const file of files) {
    if (file.endsWith("boundaryCheck.ts")) continue;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (!pattern.test(content)) continue;
      const lineIdx = lines.findIndex((l) => pattern.test(l));
      violations.push({
        file: file.replace(process.cwd(), "").replace(/\\/g, "/"),
        pattern: pattern.source,
        line: lineIdx >= 0 ? lineIdx + 1 : undefined,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export function assertLabBoundaryOrThrow(): void {
  const result = checkHobeliscoLabBoundary();
  if (!result.ok) {
    const msg = result.violations
      .map((v) => `HOBELISCO_BOUNDARY_VIOLATION: ${v.file}:${v.line ?? "?"} (${v.pattern})`)
      .join("\n");
    throw new Error(msg);
  }
}
