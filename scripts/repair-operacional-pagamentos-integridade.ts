/**
 * Repara operacional.json na nuvem: ficha paga sem pagamento → pendente (Cleber/Ivan etc.).
 *
 * npx tsx scripts/repair-operacional-pagamentos-integridade.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types/index.ts";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { fetchOperacionalSync, uploadOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { repararIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure .env.local");
  process.exit(1);
}

const CNPJ = normalizeCnpj(process.argv.find((a) => /^\d{14}$/.test(a)) ?? "62351750000165");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

function countOrfaos(op: { fichaCorrida?: { status: string }[] }) {
  return (op.fichaCorrida ?? []).filter((f) => f.status === "pago").length;
}

async function main() {
  const before = await fetchOperacionalSync(supabase, CNPJ);
  if (!before) {
    console.error("operacional.json não encontrado");
    process.exit(1);
  }

  const asApp = before as unknown as AppData;
  let next = repararIntegridadePagamentosCooperativa(asApp);

  const pagoAntes = countOrfaos(before);
  const pagoDepois = countOrfaos(next);
  const payload = {
    ...before,
    fichaCorrida: next.fichaCorrida,
    notasPedido: next.notasPedido?.length ? next.notasPedido : before.notasPedido,
    updatedAt: new Date().toISOString(),
  };

  console.log(`CNPJ ${CNPJ}`);
  console.log(`Fichas pago: ${pagoAntes} → ${pagoDepois}`);
  console.log(`Pagamentos: ${(before.pagamentosCooperado ?? []).length} (inalterados)`);

  if (JSON.stringify(before.fichaCorrida) === JSON.stringify(next.fichaCorrida)) {
    console.log("✓ Nenhuma ficha orphan — nuvem já ok");
    return;
  }

  await uploadOperacionalSync(supabase, CNPJ, payload);
  console.log("✓ operacional.json atualizado — cooperados sem pagamento voltam à fila Pagar");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
