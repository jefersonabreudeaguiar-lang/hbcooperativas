/**
 * Fase 1 — pull operacional cooperado (regressão merge pagamentos).
 * Uso: npx tsx scripts/test-cooperado-operacional-pull-phase1.ts
 */
import assert from "node:assert/strict";
import {
  detectCooperadoPagamentosNaoMaterializados,
  mergeOperacionalIntoData,
} from "../src/services/cooperativaSyncCloudService.ts";
import { getResumoQuantoVouReceberCooperado } from "../src/services/cooperadoEntregasService.ts";
import type { AppData } from "../src/types/index.ts";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage.ts";

const COOP = "coop-1";
const PG = "pg_test_phase1";

function baseLocal(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: {},
  } as AppData;
}

function cloudWithPayment(): OperacionalSyncPayload {
  return {
    updatedAt: new Date().toISOString(),
    operationalResetVersion: 15,
    pagamentosCooperado: [
      {
        id: PG,
        cooperadoId: "c1",
        cooperativaId: COOP,
        status: "aguardando_confirmacao",
        valorLiquido: 123.42,
        valorBruto: 130,
        descontoCooperativa: 6.58,
        mesReferencia: "2026-09",
        pagoEm: new Date().toISOString(),
        fichaIds: [],
        notaPedidoIds: [],
      },
    ],
    fichaCorrida: [],
    arquivosMensais: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

{
  const local = baseLocal();
  const cloud = cloudWithPayment();
  const merged = mergeOperacionalIntoData(local, cloud, COOP, []);
  const found = merged.pagamentosCooperado.some((p) => p.id === PG);
  assert.equal(found, true, "merge deve trazer pagamento da nuvem");
  assert.equal(
    detectCooperadoPagamentosNaoMaterializados(COOP, cloud, local),
    true,
    "detecta local vazio com cloud cheio"
  );
  assert.equal(
    detectCooperadoPagamentosNaoMaterializados(COOP, cloud, merged),
    false,
    "após merge local materializado"
  );
}

{
  const local = baseLocal();
  const rCarregando = getResumoQuantoVouReceberCooperado(local, "c1", COOP, {
    financeiroSincronizando: true,
  });
  assert.equal(rCarregando.estado, "carregando");
  const rVazio = getResumoQuantoVouReceberCooperado(local, "c1", COOP);
  assert.equal(rVazio.estado, "nada_pendente");
}

console.log("test-cooperado-operacional-pull-phase1: OK");
