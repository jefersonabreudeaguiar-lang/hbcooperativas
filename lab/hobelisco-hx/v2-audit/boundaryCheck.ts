/** Boundary V2 — lab não importa prod financeiro */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const FORBIDDEN = [
  /\.from\s*\(\s*["']hb_credit_/,
  /applyMigration\s*\(/,
  /ALTER\s+TABLE\s+hb_credit/i,
];

const ROOT = join(process.cwd(), "lab", "hobelisco-hx");

export function checkV2Boundary(): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "reports" || name === "node_modules") continue;
        walk(p);
      } else if (/\.ts$/.test(name) && !name.endsWith("boundaryCheck.ts")) {
        const content = readFileSync(p, "utf8");
        for (const pat of FORBIDDEN) {
          if (pat.test(content)) violations.push(p.replace(process.cwd(), ""));
        }
      }
    }
  }
  walk(ROOT);
  return { ok: violations.length === 0, violations };
}
