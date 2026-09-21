/**
 * npx tsx scripts/verify-orlando-a-receber-producao.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types/index.ts";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import {
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";

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

const CNPJ = "62351750000165";
const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const ORLANDO = "c_1782263929381_ncp55";
const MES = "2026-09";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  const op = await fetchOperacionalSync(sb, CNPJ);
  if (!op) throw new Error("sem operacional");

  const data = posProcessarIntegridadePagamentosCooperativa(
    reconciliarFichaFromNotasConferidas({
      ...(op as unknown as AppData),
      cooperados: [],
      notasPedido: [],
      cooperativas: [{ id: COOP, nome: "CoopeagriPla", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    } as AppData)
  );

  const base = getResumoPagamentoCooperado(data, ORLANDO, MES, COOP);
  const rel = getResumoValorAPagarRelatorio(data, ORLANDO, MES, COOP);
  const rel2 = getResumoValorAPagarRelatorio(data, ORLANDO, MES, COOP);

  const arq = (data.arquivosMensais ?? []).find(
    (a) => a.cooperadoId === ORLANDO && a.mesReferencia === MES
  );
  console.log("Arquivo contaCoopDescontos:", arq?.contaCoopDescontos ?? []);
  console.log("valorEntregas:", base.valorEntregas);
  console.log("getResumoPagamentoCooperado.valorLiquido:", base.valorLiquido);
  console.log("getResumoValorAPagarRelatorio.valorLiquido:", rel.valorLiquido);
  console.log("idempotente 2ª chamada:", rel2.valorLiquido);

  const compra = 79.9;
  const estornos = 250;
  const temCompraHb = rel.descontosExtras.some((d) => d.tipo === "conta_coop" && d.valor === compra);
  const semCompraSeria = Math.round((base.valorEntregas + estornos - (arq?.mensalidadeFixa ?? 0)) * 100) / 100;
  const abateCompra = temCompraHb && base.valorLiquido < semCompraSeria;
  const alinhado = rel.valorLiquido === base.valorLiquido;
  const idempotente = rel.valorLiquido === rel2.valorLiquido;

  console.log("\n=== CRITÉRIO Orlando ===");
  console.log("Compra abate a receber:", abateCompra ? "PASS" : "FAIL");
  console.log("Relatório = base cálculo:", alinhado ? "PASS" : "FAIL");
  console.log("Idempotência:", idempotente ? "PASS" : "FAIL");
  console.log("Esperado aprox. (entregas - compra + estornos - mensalidade):", base.valorLiquido);

  process.exit(abateCompra && alinhado && idempotente ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
