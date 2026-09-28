#!/usr/bin/env npx tsx
/**
 * Sincroniza espelho BIC para coopeagriplla-gestao-lab-build (somente arquivos allowlist).
 * Não toca produção, git push, nem Vercel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BIC_MIRROR_SYNC_PATHS } from "../../src/lib/lab/bicLabMirrorManifest.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(__dirname, "../..");
const TARGET_ROOT = path.resolve(SOURCE_ROOT, "..", "coopeagriplla-gestao-lab-build");

function copyFile(rel: string): { rel: string; ok: boolean; error?: string } {
  const src = path.join(SOURCE_ROOT, rel);
  const dest = path.join(TARGET_ROOT, rel);
  if (!fs.existsSync(src)) {
    return { rel, ok: false, error: "missing source" };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return { rel, ok: true };
}

function patchLabBuildPackageJson() {
  const pkgPath = path.join(TARGET_ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  pkg.scripts = pkg.scripts ?? {};
  const add: Record<string, string> = {
    "test:bic-tenant": "npx tsx scripts/test-bic-tenant-guard.ts",
    "test:bic-facade-tenant": "npx tsx scripts/test-bic-facade-tenant.ts",
    "test:bic-fallback-observability": "npx tsx scripts/test-bic-fallback-observability.ts",
    "test:bic-shadow": "npx tsx scripts/test-bic-shadow-compare.ts",
    "test:bic-b3.1-integration": "npx tsx scripts/test-bic-b3.1-integration.ts",
    "test:bic-lab-boundary": "npx tsx scripts/test-bic-lab-boundary.ts",
    "test:h204-orlando-global": "npx tsx scripts/test-h204-orlando-global-simulation.ts",
    "lab:bic-activate": "npx tsx scripts/lab/run-bic-lab-activate.ts",
    "lab:bic-full-audit": "npx tsx scripts/lab/run-bic-lab-full-audit.ts",
    "lab:bic-mirror-sync": "npx tsx scripts/lab/sync-bic-mirror-to-lab-build.ts",
  };
  for (const [k, v] of Object.entries(add)) {
    if (!pkg.scripts![k]) pkg.scripts![k] = v;
  }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function main() {
  console.log("=== BIC LAB — sync espelho ===\n");
  console.log(`Origem:  ${SOURCE_ROOT}`);
  console.log(`Destino: ${TARGET_ROOT}\n`);

  if (!fs.existsSync(TARGET_ROOT)) {
    console.error("Destino lab-build não encontrado. Crie coopeagriplla-gestao-lab-build ao lado do repo.");
    process.exit(1);
  }

  const results = BIC_MIRROR_SYNC_PATHS.map(copyFile);
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `[OK] ${r.rel}` : `[SKIP] ${r.rel} — ${r.error}`);
  }

  patchLabBuildPackageJson();
  console.log("\n[OK] package.json lab-build — scripts BIC mesclados");

  if (failed.length) {
    console.error(`\n${failed.length} arquivo(s) ausente(s) na origem.`);
    process.exit(1);
  }

  console.log("\nVeredito: MIRROR-SYNC-GREEN");
  console.log("Próximo: cd ../coopeagriplla-gestao-lab-build && copie .env.bic-lab.example → .env.local");
}

main();
