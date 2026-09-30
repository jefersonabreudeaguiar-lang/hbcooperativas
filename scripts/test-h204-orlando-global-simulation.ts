/**
 * H204 — simulação massiva fluxo global cooperado (in-memory, read-only).
 * npx tsx scripts/test-h204-orlando-global-simulation.ts
 * Env: H204_SIM_COUNT=50000 (default 10000)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, Cooperado, FichaCorrida, NotaPedido, PagamentoCooperadoRegistro } from "../src/types/index.ts";
import {
  fluxoGlobalProibidoReferenciaOrlandoNoCodigo,
  projetarCooperadoFluxoFinanceiroGlobal,
  cooperadoFluxoApresentacaoPronta,
  type CooperadoFluxoReadiness,
} from "../src/lib/cooperadoFluxoFinanceiroGlobal.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";
import { getPagamentoAguardandoCooperado } from "../src/services/notaPedidoService.ts";

const ORLANDO = "c_1782263929381_ncp55";
const JEFERSON = "c_1781981564381_w67gg";
const REF_COOPS = ["coop_a", "coop_b", "coop_c", "coop_d", "coop_e"];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.H204_SIM_SEED ?? "20420260928");
const TARGET = Math.min(
  100_000,
  Math.max(10_000, Number(process.env.H204_SIM_COUNT ?? "10000") || 10_000)
);
const rand = mulberry32(SEED);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function snapFinance(data: AppData) {
  return JSON.stringify({
    p: data.pagamentosCooperado,
    f: data.fichaCorrida,
    n: data.notasPedido,
    a: data.arquivosMensais,
    d: data.descontos,
  });
}

function cooperado(id: string, cooperativaId: string): Cooperado {
  return {
    id,
    cooperativaId,
    nomeCompleto: `Coop ${id.slice(-4)}`,
    cpfCnpj: String(Math.floor(rand() * 1e11)).padStart(11, "0"),
    telefone: "",
    endereco: "",
    comunidade: "",
    chavePix: "pix@test",
    pixValido: true,
    status: "ativo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function baseData(cooperados: Cooperado[], coopIds: string[]): AppData {
  return {
    cooperativas: coopIds.map((id, i) => ({
      id,
      nome: `Cooperativa ${i}`,
      cnpj: `${String(10000000000000 + i).slice(0, 14)}`,
      status: "ativa",
      createdAt: "",
      updatedAt: "",
    })),
    cooperados,
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
  } as AppData;
}

function readinessFromFlags(hydrated: boolean, syncing: boolean): CooperadoFluxoReadiness {
  return { role: "cooperado", cooperadoPagamentosHydrated: hydrated, syncing };
}

function addNota(
  data: AppData,
  coopId: string,
  cooperadoId: string,
  mes: string,
  valor: number,
  status: NotaPedido["status"] = "conferida"
): AppData {
  const id = `np_${cooperadoId}_${mes}_${Math.floor(rand() * 1e6)}`;
  const nota: NotaPedido = {
    id,
    cooperativaId: coopId,
    cooperadoId,
    mesReferencia: mes,
    dataEntrega: `${mes}-15`,
    status,
    valorTotal: valor,
    valorLiquido: valor,
    createdAt: "",
    updatedAt: "",
  } as NotaPedido;
  const ficha: FichaCorrida = {
    id: `fc_${id}`,
    cooperativaId: coopId,
    cooperadoId,
    notaPedidoId: id,
    mesReferencia: mes,
    valor,
    descricao: `Entrega sim ${mes}`,
    status: status === "pago" ? "pago" : "pendente",
    createdAt: "",
    updatedAt: "",
  } as FichaCorrida;
  return {
    ...data,
    notasPedido: [...data.notasPedido, nota],
    fichaCorrida: [...data.fichaCorrida, ficha],
  };
}

function addPagamento(
  data: AppData,
  coopId: string,
  cooperadoId: string,
  mes: string,
  status: PagamentoCooperadoRegistro["status"],
  valor: number
): AppData {
  const pg: PagamentoCooperadoRegistro = {
    id: `pg_${cooperadoId}_${mes}_${Math.floor(rand() * 1e6)}`,
    cooperativaId: coopId,
    cooperadoId,
    mesReferencia: mes,
    mesesReferencia: [mes],
    status,
    valorLiquido: valor,
    valorBruto: valor,
    createdAt: "",
    updatedAt: "",
  } as PagamentoCooperadoRegistro;
  return { ...data, pagamentosCooperado: [...data.pagamentosCooperado, pg] };
}

const fluxoSrc = readFileSync(resolve(process.cwd(), "src/lib/cooperadoFluxoFinanceiroGlobal.ts"), "utf8");
assert.ok(fluxoGlobalProibidoReferenciaOrlandoNoCodigo(fluxoSrc), "fluxo global must not hardcode Orlando");

const t0 = performance.now();
let pass = 0;
let fail = 0;
let firstFail: string | null = null;

function failCase(msg: string) {
  fail++;
  if (!firstFail) firstFail = msg;
}

{
  const coop = "coop_struct";
  const ids = [ORLANDO, JEFERSON, "c_x1", "c_x2", "c_x3"];
  let d = baseData(
    ids.map((id) => cooperado(id, coop)),
    [coop]
  );
  d = addNota(d, coop, ORLANDO, "2026-09", 100);
  d = addNota(d, coop, JEFERSON, "2026-09", 50);
  const ready = readinessFromFlags(true, false);
  for (const id of ids) {
    const p1 = projetarCooperadoFluxoFinanceiroGlobal(d, id, coop, ready);
    const p2 = projetarCooperadoFluxoFinanceiroGlobal(d, id, coop, ready);
    assert.deepEqual(p1, p2, `determinism structural ${id}`);
  }
}

for (let i = 0; i < TARGET; i++) {
  const numCoops = pick([1, 5, 10, 20]);
  const coopIds = REF_COOPS.slice(0, numCoops);
  const cooperados: Cooperado[] = [];
  for (let c = 0; c < numCoops; c++) {
    const n = c === 0 && i % 97 === 0 ? 100 : Math.floor(rand() * 8) + 1;
    for (let k = 0; k < n; k++) {
      cooperados.push(cooperado(`c_${c}_${k}_${i}`, coopIds[c]!));
    }
  }
  let data = baseData(cooperados, coopIds);

  const target = pick(cooperados);
  const others = cooperados.filter((x) => x.id !== target.id);
  const other = others.length ? pick(others) : target;
  const mes = pick(["2026-07", "2026-08", "2026-09", "2026-10"]);

  if (rand() > 0.3) data = addNota(data, target.cooperativaId, target.id, mes, 50 + Math.floor(rand() * 400));
  if (rand() > 0.7 && other.id !== target.id)
    data = addNota(data, other.cooperativaId, other.id, mes, 33);
  if (rand() > 0.6)
    data = addPagamento(
      data,
      target.cooperativaId,
      target.id,
      mes,
      rand() > 0.5 ? "aguardando_confirmacao" : "confirmado",
      40
    );

  const before = snapFinance(data);

  const hydrated = rand() > 0.25;
  const syncing = rand() > 0.7;
  const readiness = readinessFromFlags(hydrated, syncing);
  const consolidated = cooperadoFluxoApresentacaoPronta(readiness);

  try {
    const snapA = projetarCooperadoFluxoFinanceiroGlobal(data, target.id, target.cooperativaId, readiness);
    const snapB = projetarCooperadoFluxoFinanceiroGlobal(data, target.id, target.cooperativaId, readiness);
    assert.deepEqual(snapA, snapB, "idempotence");

    if (other.id !== target.id) {
      const pgT = getPagamentoAguardandoCooperado(data, target.id)?.id ?? null;
      const pgO = getPagamentoAguardandoCooperado(data, other.id)?.id ?? null;
      if (pgT && pgO && pgT === pgO) failCase(`cross-cooperado pagamento id ${i}`);
    }

    if (!consolidated) {
      if (snapA.inicioValor !== 0 || snapA.m6Valor !== 0) failCase(`unmasked UI while loading ${i}`);
      if (snapA.inicioAguardando || snapA.m6Aguardando) failCase(`aguardando while loading ${i}`);
    }

    const after = snapFinance(data);
    if (before !== after) failCase(`financial mutation ${i}`);
    else pass++;
  } catch (e) {
    failCase(e instanceof Error ? e.message : String(e));
  }
}

{
  const coop = "coop_h204";
  let d = baseData([cooperado(ORLANDO, coop), cooperado(JEFERSON, coop)], [coop]);
  d = addNota(d, coop, ORLANDO, "2026-09", 80);
  d = addPagamento(d, coop, ORLANDO, "2026-08", "aguardando_confirmacao", 10);
  const ready = readinessFromFlags(true, false);
  projetarCooperadoFluxoFinanceiroGlobal(d, ORLANDO, coop, ready);
  projetarCooperadoFluxoFinanceiroGlobal(d, JEFERSON, coop, ready);
}

const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

console.log(
  JSON.stringify(
    {
      seed: SEED,
      target: TARGET,
      pass,
      fail,
      firstFail,
      elapsedSec: elapsed,
      ok: fail === 0,
    },
    null,
    2
  )
);

if (fail > 0) process.exit(1);
