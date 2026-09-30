/**
 * Simula exatamente a aba Pagar em /ficha-corrida (responsável).
 * npx tsx scripts/verify-pagar-cleber-ivan-producao.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types/index.ts";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { listCooperadosDaCooperativa } from "../src/services/cooperadoCloudService";
import { cooperadoPendentePagamentoResponsavel } from "../src/services/cooperadoEntregasService";
import { getRelatorioPagarCooperadoEmAberto } from "../src/services/relatorioService";
import {
  reconciliarFichaFromNotasConferidas,
  purgarFichasInvalidas,
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
const ALVOS = ["cleber viana", "ivan arruda"];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function loadCooperados() {
  const { data: files } = await sb.storage.from("hb-cooperados").list(CNPJ, { limit: 500 });
  const cooperados = [];
  for (const f of files ?? []) {
    if (!f.name.endsWith(".json")) continue;
    const { data: b } = await sb.storage.from("hb-cooperados").download(`${CNPJ}/${f.name}`);
    if (!b) continue;
    const c = JSON.parse(await b.text())?.cooperado;
    if (c) cooperados.push(c);
  }
  return cooperados;
}

function filaPagarComoUI(data: AppData) {
  const cooperadosParaPagar = listCooperadosDaCooperativa(data, COOP).filter((c) =>
    cooperadoPendentePagamentoResponsavel(data, c.id, undefined, COOP)
  );
  const relatorio = getRelatorioPagarCooperadoEmAberto(data, COOP);
  return { cooperadosParaPagar, relatorio };
}

function report(label: string, data: AppData) {
  const { cooperadosParaPagar, relatorio } = filaPagarComoUI(data);
  const alvosSelect = cooperadosParaPagar.filter((c) =>
    ALVOS.some((a) => c.nomeCompleto.toLowerCase().includes(a))
  );
  const alvosRel = relatorio.filter((l) => ALVOS.some((a) => l.cooperado.toLowerCase().includes(a)));
  console.log(`\n=== ${label} ===`);
  console.log(
    "cooperadosParaPagar (UI select):",
    alvosSelect.map((c) => c.nomeCompleto)
  );
  console.log(
    "getRelatorioPagarCooperadoEmAberto:",
    alvosRel.map((l) => ({ nome: l.cooperado, total: l.total }))
  );
  return alvosSelect.length >= 2 && alvosRel.every((l) => l.total > 0);
}

async function main() {
  const op = await fetchOperacionalSync(sb, CNPJ);
  if (!op) throw new Error("sem operacional");
  const cooperados = await loadCooperados();

  const raw: AppData = {
    ...(op as unknown as AppData),
    cooperados,
    notasPedido: (op as { notasPedido?: AppData["notasPedido"] }).notasPedido ?? [],
    fichaCorrida: (op as { fichaCorrida?: AppData["fichaCorrida"] }).fichaCorrida ?? [],
    pagamentosCooperado: (op as { pagamentosCooperado?: AppData["pagamentosCooperado"] }).pagamentosCooperado ?? [],
    cooperativas: [{ id: COOP, nome: "CoopeagriPla", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
  } as AppData;

  const pagoCleber = (raw.fichaCorrida ?? []).filter(
    (f) => f.cooperadoId === "c_1782257422774_9chl9" && f.status === "pago"
  ).length;
  console.log("NUVEM bruta: fichas Cleber status pago:", pagoCleber, "/ 5");

  const r1 = report("1) Dados nuvem + cooperados (sem pipeline local)", raw);

  const afterSync = posProcessarIntegridadePagamentosCooperativa(
    purgarFichasInvalidas(reconciliarFichaFromNotasConferidas(raw))
  );
  const r2 = report("2) Após reconciliar + purgar + integridade (pipeline app)", afterSync);

  const prod = await fetch("https://hbcooperativas.vercel.app/login").then((r) => r.text()).catch(() => "");
  const buildMatch = prod.match(/APP_BUILD_VERSION[^\d]*(\d+)/) ?? prod.match(/build[=](\d+)/i);
  console.log("\n=== Produção (HTML login) ===");
  console.log("build detectado no HTML:", buildMatch?.[1] ?? "NÃO ENCONTRADO (bundle pode estar em chunk)");

  console.log("\n=== CRITÉRIO Pagar ===");
  console.log("Cleber+ivan no select (raw nuvem):", r1 ? "PASS" : "FAIL");
  console.log("Cleber+ivan no select (pipeline):", r2 ? "PASS" : "FAIL");
  process.exit(r1 && r2 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
