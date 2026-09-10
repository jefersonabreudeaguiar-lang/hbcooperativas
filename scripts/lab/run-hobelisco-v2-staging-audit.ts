import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { runV2StagingAudit } from "@lab/hobelisco-hx/v2-audit/runV2StagingAudit";
import {
  formatV2AuditMarkdown,
  formatV2AuditText,
} from "@lab/hobelisco-hx/v2-audit/reportFormatter";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function bootstrapStagingEnv() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const stagingEnabled = ["true", "1", "yes"].includes(
    (process.env.HB_HOBELISCO_STAGING_ENABLED ?? "").trim().toLowerCase()
  );
  const useAppSupabase = ["true", "1", "yes"].includes(
    (process.env.HB_HOBELISCO_STAGING_USE_APP_SUPABASE ?? stagingEnabled ? "true" : "").trim().toLowerCase()
  );
  if (!process.env.HB_HOBELISCO_STAGING_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL && useAppSupabase) {
    process.env.HB_HOBELISCO_STAGING_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY =
      process.env.HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    process.env.HB_HOBELISCO_STAGING_ENABLED = "true";
  }
  if (!process.env.HB_HOBELISCO_V2_ENABLED) process.env.HB_HOBELISCO_V2_ENABLED = "true";
  if (!process.env.HB_HOBELISCO_OBSERVE_ONLY) process.env.HB_HOBELISCO_OBSERVE_ONLY = "true";
}

async function main() {
  bootstrapStagingEnv();
  const report = await runV2StagingAudit();
  const ts = report.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(process.cwd(), "lab", "hobelisco-hx", "reports");
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, `v2-staging-audit-${ts}.json`), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(process.cwd(), "docs", "HOBELISCO-V2-STAGING-AUDIT.md"), formatV2AuditMarkdown(report), "utf8");

  console.log(formatV2AuditText(report));
  console.log(`\nRelatórios:\n  lab/hobelisco-hx/reports/v2-staging-audit-${ts}.json\n  docs/HOBELISCO-V2-STAGING-AUDIT.md`);

  process.exit(report.verdict === "V2-RED" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
