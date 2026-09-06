/**
 * Repara compra Casa do Cacau (Orlando, recibo 009AEE5F):
 * 1. Remove desconto duplicado em 2026-08 nos arquivosMensais (mantém 2026-09)
 * 2. Reconcilia hb_credit: amount_used + ledger entry da transação posted
 *
 * Dry-run: node scripts/repair-orlando-casa-cacau.mjs
 * Aplicar:  node scripts/repair-orlando-casa-cacau.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const CNPJ = "62351750000165";
const ORLANDO = "c_1782263929381_ncp55";
const TX_ID = "tx_1788290556674_3ed0c48acb39";
const RECEIPT = "009AEE5F";
const AMOUNT_CENTS = 7990;
const MES_COMPRA = "2026-09";
const MES_DUPLICADO = "2026-08";
const ACTOR = "u_creator_invisium3_gmail_com";
const MOTIVO = `Compra Conta Coop — Casa do Cacau (${RECEIPT})`;

function br(cents) {
  return "R$ " + ((Number(cents) || 0) / 100).toFixed(2);
}

function isCacauDesconto(d) {
  return /cacau|009AEE5F/i.test(d.motivo ?? "");
}

// --- 1. operacional.json ---
const opPath = `${CNPJ}/operacional.json`;
const { data: opBlob, error: opErr } = await sb.storage.from("hb-cooperativa-sync").download(opPath);
if (opErr) throw new Error(`operacional: ${opErr.message}`);

const opBefore = JSON.parse(await opBlob.text());
const op = structuredClone(opBefore);

let removedDup = 0;
for (const arq of op.arquivosMensais ?? []) {
  if (arq.cooperadoId !== ORLANDO || arq.mesReferencia !== MES_DUPLICADO) continue;
  const before = arq.contaCoopDescontos?.length ?? 0;
  arq.contaCoopDescontos = (arq.contaCoopDescontos ?? []).filter((d) => !isCacauDesconto(d));
  removedDup += before - (arq.contaCoopDescontos?.length ?? 0);
}

const arqSet = (op.arquivosMensais ?? []).find(
  (a) => a.cooperadoId === ORLANDO && a.mesReferencia === MES_COMPRA
);
const setDescontos = (arqSet?.contaCoopDescontos ?? []).filter(isCacauDesconto);

console.log("=== Ficha (operacional.json) ===");
console.log("Duplicata removida de", MES_DUPLICADO + ":", removedDup, "registro(s)");
console.log("Desconto em", MES_COMPRA + ":", setDescontos.length, "registro(s)", setDescontos);

// --- 2. hb_credit ---
const { data: tx, error: txErr } = await sb
  .from("hb_credit_transactions")
  .select("*")
  .eq("id", TX_ID)
  .maybeSingle();
if (txErr) throw new Error(txErr.message);
if (!tx || tx.status !== "posted") throw new Error("Transação Casa do Cacau não encontrada ou não posted.");

const { data: acc, error: accErr } = await sb
  .from("hb_credit_accounts")
  .select("id, limit_released_cents, amount_used_cents, available_cents")
  .eq("cooperative_cnpj", CNPJ)
  .eq("cooperado_id", ORLANDO)
  .maybeSingle();
if (accErr) throw new Error(accErr.message);
if (!acc) throw new Error("Conta hb_credit Orlando não encontrada.");

const { data: existingLedger } = await sb
  .from("hb_credit_ledger_entries")
  .select("id, entry_type, amount_cents, direction, created_at")
  .eq("transaction_id", TX_ID);

const limiteAtual = Number(acc.limit_released_cents);
const usadoAtual = Number(acc.amount_used_cents);
const usadoNovo = AMOUNT_CENTS;

function creditoBaseCentsFromOp(cooperadoId) {
  const meses = [
    ...new Set(
      (op.fichaCorrida ?? [])
        .filter((f) => f.cooperadoId === cooperadoId && f.status === "pendente")
        .map((f) => f.mesReferencia)
    ),
  ];
  let total = 0;
  for (const mes of meses) {
    const fichas = (op.fichaCorrida ?? []).filter(
      (f) => f.cooperadoId === cooperadoId && f.mesReferencia === mes && f.status === "pendente"
    );
    total += fichas.reduce((s, f) => s + (f.valorLiquido ?? 0), 0);
  }
  return Math.round(total * 100);
}

const baseOrlando = creditoBaseCentsFromOp(ORLANDO);
const limiteFromBase = Math.round(baseOrlando * 0.5);
const limiteNovo = Math.max(limiteFromBase, usadoNovo, limiteAtual);
const disponivelNovo = limiteNovo - usadoNovo;

console.log("\n=== Conta Coop (hb_credit) ===");
console.log("Antes:", { limite: br(limiteAtual), usado: br(usadoAtual), disponivel: br(acc.available_cents) });
console.log("Depois:", { limite: br(limiteNovo), usado: br(usadoNovo), disponivel: br(disponivelNovo) });
console.log("Ledger existente p/ tx:", existingLedger?.length ?? 0, existingLedger ?? []);

if (!APPLY) {
  console.log("\n[dry-run] Use --apply para gravar na nuvem.");
  process.exit(0);
}

// Backup
const backupDir = resolve(process.cwd(), "scripts/backups");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
const stamp = Date.now();
writeFileSync(
  resolve(backupDir, `pre-repair-orlando-casa-cacau-${stamp}.json`),
  JSON.stringify({ operacional: opBefore, account: acc, ledger: existingLedger, tx }, null, 2)
);
console.log("\nBackup:", `scripts/backups/pre-repair-orlando-casa-cacau-${stamp}.json`);

// Upload operacional
const { error: upOpErr } = await sb.storage
  .from("hb-cooperativa-sync")
  .upload(opPath, JSON.stringify(op), { upsert: true, contentType: "application/json" });
if (upOpErr) throw new Error(`upload operacional: ${upOpErr.message}`);
console.log("✓ operacional.json atualizado");

// Update account (limite + usado juntos — respeita constraint used <= limit)
const now = new Date().toISOString();
const { error: accUpErr } = await sb
  .from("hb_credit_accounts")
  .update({
    limit_released_cents: limiteNovo,
    amount_used_cents: usadoNovo,
    updated_at: now,
    updated_by: ACTOR,
  })
  .eq("id", acc.id);
if (accUpErr) throw new Error(`account: ${accUpErr.message}`);
console.log("✓ hb_credit_accounts:", { limite: br(limiteNovo), usado: br(usadoNovo) });

// Insert ledger if missing
if (!existingLedger?.length) {
  const ledgerId = randomUUID();
  const { error: ledErr } = await sb.from("hb_credit_ledger_entries").insert({
    id: ledgerId,
    cooperative_cnpj: CNPJ,
    account_id: acc.id,
    transaction_id: TX_ID,
    entry_type: "PAYMENT",
    amount_cents: AMOUNT_CENTS,
    direction: "debit",
    balance_reference_cents: disponivelNovo,
    metadata: { memo: MOTIVO },
    created_at: tx.created_at,
  });
  if (ledErr) throw new Error(`ledger: ${ledErr.message}`);
  console.log("✓ ledger entry criada:", ledgerId);
} else {
  console.log("• ledger já existia, mantida");
}

const { data: accFinal } = await sb
  .from("hb_credit_accounts")
  .select("limit_released_cents, amount_used_cents, available_cents")
  .eq("id", acc.id)
  .single();
const { data: ledgerAfter } = await sb
  .from("hb_credit_ledger_entries")
  .select("entry_type, amount_cents, direction, balance_reference_cents, metadata, created_at")
  .eq("account_id", acc.id)
  .order("created_at", { ascending: false });

console.log("\n=== Pós-reparo ===");
console.log("Conta:", {
  limite: br(accFinal.limit_released_cents),
  usado: br(accFinal.amount_used_cents),
  disponivel: br(accFinal.available_cents),
});
console.log("Extrato:", ledgerAfter ?? []);
console.log("\n✓ Reparo Casa do Cacau concluído.");
