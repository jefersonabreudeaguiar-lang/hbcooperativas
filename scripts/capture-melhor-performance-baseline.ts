/**
 * Valida o ponto de referência "melhor-performance" (build 283+).
 * npx tsx scripts/capture-melhor-performance-baseline.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const MANIFEST = join(ROOT, "docs/baselines/melhor-performance-manifest.json");

function run(cmd: string) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", env: process.env });
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { referenceBuild: number };
  if (APP_BUILD_VERSION < manifest.referenceBuild) {
    console.error(
      `FAIL: APP_BUILD_VERSION=${APP_BUILD_VERSION} < referência ${manifest.referenceBuild}`
    );
    process.exitCode = 1;
    return;
  }

  console.log("=== melhor-performance: HX 8.0 RQL ===\n");
  run("npx tsx scripts/baseline-performance-rql-h80-readonly.ts");

  console.log("\n=== melhor-performance: recibo + assinatura ===\n");
  run("npx tsx scripts/test-cooperado-recibo-assinatura-apos-confirmado.ts");

  console.log("\n=== melhor-performance: cold-start / release ===\n");
  run("npx tsx scripts/test-cooperado-cold-start-h90.ts");

  console.log("\nOK: baseline melhor-performance validado localmente.");
  console.log(`Manifesto: docs/baselines/melhor-performance-manifest.json (build ref ${manifest.referenceBuild})`);
}

main();
