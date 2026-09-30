/**
 * Remove lançamentos de teste "Mercado teste" do livro caixa na nuvem.
 * Dry-run: npx tsx scripts/fix-livro-caixa-mercado-teste-once.ts
 * Aplicar:  $env:APPLY="1"; npx tsx scripts/fix-livro-caixa-mercado-teste-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LivroCaixaLancamento } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import {
  fetchOperacionalSync,
  uploadOperacionalSync,
  type OperacionalSyncPayload,
} from "../src/lib/supabase/cooperativaSyncStorage.ts";

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

loadEnvFile(resolve(process.cwd(), ".env.local"));

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

function isMercadoTesteLancamento(l: LivroCaixaLancamento): boolean {
  return /mercado\s*teste/i.test(l.historico ?? "");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const operacional = await fetchOperacionalSync(sb, CNPJ);
  if (!operacional) throw new Error("operacional.json ausente");

  const alvo = (operacional.livroCaixa ?? []).filter(isMercadoTesteLancamento);
  console.log(`=== Livro caixa — remover Mercado teste | CNPJ ${CNPJ} | APPLY=${APPLY} ===\n`);
  if (!alvo.length) {
    console.log("Nenhum lançamento Mercado teste no livro caixa.");
    return;
  }

  for (const l of alvo) {
    console.log(`  ${l.id} | ${l.tipo} R$ ${l.valor} | seq ${l.numeroSequencia} | ${l.historico}`);
  }

  const removeIds = new Set(alvo.map((l) => l.id));
  const excluidoEm = new Date().toISOString();
  const coopId = alvo[0]?.cooperativaId ?? "";

  const nextPayload: OperacionalSyncPayload = {
    ...operacional,
    livroCaixa: (operacional.livroCaixa ?? []).filter((l) => !removeIds.has(l.id)),
    livroCaixaExcluidos: [
      ...(operacional.livroCaixaExcluidos ?? []).filter((e) => !removeIds.has(e.id)),
      ...alvo.map((l) => ({
        id: l.id,
        cooperativaId: l.cooperativaId ?? coopId,
        excluidoEm,
      })),
    ],
    updatedAt: excluidoEm,
  };

  if (!APPLY) {
    console.log("\nDry-run — defina APPLY=1 para gravar na nuvem.");
    return;
  }

  const backupDir = resolve(process.cwd(), "scripts/backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `pre-fix-livro-caixa-mercado-teste-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ operacional, removed: alvo }, null, 2), "utf8");
  console.log("\nBackup:", backupPath);

  const up = await uploadOperacionalSync(sb, CNPJ, nextPayload, {
    existingOperacional: operacional,
    skipPagamentoConfirmadoProtection: true,
  });
  if (!up.ok) {
    console.error("Falha upload:", up.error);
    process.exit(1);
  }

  console.log(`OK: removidos ${alvo.length} lançamento(s) do livro caixa.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
