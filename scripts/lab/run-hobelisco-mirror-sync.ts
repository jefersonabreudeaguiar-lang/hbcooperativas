#!/usr/bin/env node
/**
 * Espelho prod → LAB (Fase 1) — execução manual
 * npm run lab:hobelisco:mirror-sync
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { canRunMirrorSync, getMirrorSyncStatus, runProdMirrorSync } from "@/lib/lab/hobeliscoMirrorSync";

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

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env.hobelisco-lab"));

  console.log("=== Hobelisco — ProdMirrorSync (Fase 1) ===\n");

  const gate = canRunMirrorSync();
  if (!gate.allowed) {
    console.error(`Bloqueado: ${gate.reason}`);
    process.exit(1);
  }

  const result = await runProdMirrorSync();
  if (!result.ok || !result.snapshot) {
    console.error(`Falha: ${result.reason ?? "unknown"}`);
    process.exit(1);
  }

  const s = result.snapshot;
  console.log(`Status: ${s.status}`);
  console.log(`Sync: ${s.syncedAt}`);
  console.log(`Prod main: ${s.prodCommitSha ?? "?" } | LAB: ${s.labCommitSha ?? "?"}`);
  console.log(`Código alinhado: ${s.codeAligned ? "SIM" : "NÃO"}`);
  console.log(`Agregados: ${JSON.stringify(s.aggregates)}`);
  if (s.issues.length) {
    console.log("Avisos:");
    for (const i of s.issues) console.log(`  - ${i}`);
  }

  const status = await getMirrorSyncStatus();
  console.log(`\nEspelho stale (>24h): ${status.stale ? "SIM" : "NÃO"}`);

  process.exit(0);
}

void main();
