/**
 * PASSO 21 — blindagem BIC ON contra snapshot legado de recibo no card início.
 * Uso: npm run test:cooperado-inicio-card-bic-recibo-legado
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import {
  filtrarInicioCardPersistidoLeituraBic,
  persistidoDisplayCompativelBic,
  resolverCardInicioEndurecido,
  resolverInicioCardMotorFromAppData,
  sanitizeInicioCardSnapshotParaPersistenciaBic,
  type InicioCardMotorSnapshot,
} from "../src/lib/cooperadoInicioCardPolicy";
import type { InicioCardPersistido } from "../src/lib/cooperadoInicioCardPersistencia";
import { resolveCooperadoInicioValorReceberCardModos } from "../src/components/cooperado/CooperadoInicioValorReceberCard";

const COOP = "coop-p21";
const COOPERADO = "c_p21";
const MES = "2026-09";

function withBicOfficial<T>(fn: () => T): T {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
  process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
  return fn();
}

function withBicOff<T>(fn: () => T): T {
  delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL;
  delete process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL;
  delete process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK;
  delete process.env.HB_BIC_LAB_B4_AUTHORITY;
  delete process.env.HB_BIC_LAB_ENABLED;
  return fn();
}

function persistido(display: InicioCardMotorSnapshot, motorRevision = "rev-p21"): InicioCardPersistido {
  return { v: 7, motorRevision, savedAt: "2026-09-29T00:00:00.000Z", display };
}

function miniDataMotorZero(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "P21",
        cpf: "00000000000",
        status: "ativo",
        createdAt: "",
      },
    ],
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

function assertSemReciboNaUi(display: InicioCardMotorSnapshot, exibirReciboAssinatura = true): void {
  assert.equal(display.valorRecibo, 0);
  assert.equal(display.aguardandoAssinatura, false);
  const modos = resolveCooperadoInicioValorReceberCardModos(display, exibirReciboAssinatura);
  assert.equal(modos.modoRecibo, false);
  assert.equal(modos.modoAssinaturaComAberto, false);
  assert.equal(modos.acao, "Ver detalhes");
}

// CASO A — Orlando-like recibo legado, boot sem AppData
withBicOfficial(() => {
  const snap = persistido({
    mesLabel: "Setembro 2026",
    valor: 0,
    valorRecibo: 123.42,
    aguardandoAssinatura: true,
  });
  assert.equal(persistidoDisplayCompativelBic(snap.display), false);
  assert.equal(filtrarInicioCardPersistidoLeituraBic(snap), null);
  const result = resolverCardInicioEndurecido({
    data: null,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: true,
    prevLatch: null,
    persistido: snap,
  });
  assertSemReciboNaUi(result.display);
  assert.equal(sanitizeInicioCardSnapshotParaPersistenciaBic(snap.display).valorRecibo, 0);
});

// CASO B — valor cache > 0, BIC autoridade no boot
withBicOfficial(() => {
  const snap = persistido({
    mesLabel: "Set/2026",
    valor: 500,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  });
  assert.equal(persistidoDisplayCompativelBic(snap.display), true);
  const result = resolverCardInicioEndurecido({
    data: null,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido: snap,
  });
  assert.equal(result.display.valor, 0, "valor cache não é definitivo antes do BIC");
  assert.equal(result.atualizando, true);
  assertSemReciboNaUi(result.display);
});

// CASO C — valor + recibo legado misturado
withBicOfficial(() => {
  const snap = persistido({
    mesLabel: "Set/2026",
    valor: 500,
    valorRecibo: 200,
    aguardandoAssinatura: true,
  });
  assert.equal(filtrarInicioCardPersistidoLeituraBic(snap), null);
  const result = resolverCardInicioEndurecido({
    data: null,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: true,
    prevLatch: null,
    persistido: snap,
  });
  assertSemReciboNaUi(result.display);
  assert.equal(result.display.valor, 0);
});

// CASO D — motor BIC zero com AppData
withBicOfficial(() => {
  const data = miniDataMotorZero();
  const motor = resolverInicioCardMotorFromAppData(data, COOPERADO, COOP);
  assert.equal(motor.valor, 0);
  const result = resolverCardInicioEndurecido({
    data,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    apresentacaoConsolidada: true,
    carregandoFinanceiro: false,
    prevLatch: null,
    persistido: null,
  });
  assert.equal(result.display.valor, 0);
  assertSemReciboNaUi(result.display);
});

// CASO E — BIC OFF preserva legado recibo na UI (modo recibo)
withBicOff(() => {
  const legacy = {
    mesLabel: "Set/2026",
    valor: 0,
    valorRecibo: 123.42,
    aguardandoAssinatura: true,
  };
  const modos = resolveCooperadoInicioValorReceberCardModos(legacy, true);
  assert.equal(modos.modoRecibo, true);
  assert.equal(modos.acao, "Assinar recibo");
  const filtrado = filtrarInicioCardPersistidoLeituraBic(persistido(legacy));
  assert.ok(filtrado);
  assert.deepEqual(filtrado!.display, legacy);
});

console.log("OK — cooperado inicio card BIC recibo legado (casos A–E)");
