/**
 * Política endurecida — card início não zera com sync se revisão operacional não mudou.
 */
import assert from "node:assert/strict";
import type { AppData } from "@/types";
import {
  aplicarPoliticaCardInicioEndurecida,
  aplicarSubstituicaoMonotonaDisplay,
  cooperadoMotorRevisionOperacional,
  cooperadoMotorTemObrigacaoReceber,
} from "../src/lib/cooperadoInicioCardPolicy";

const COOP = "coop-a";
const COOPERADO = "coop-user-1";

function miniData(overrides: Partial<AppData> = {}): AppData {
  const base = {
    cooperativas: [{ id: COOP, nome: "Test", cnpj: "00000000000191" }],
    cooperados: [{ id: COOPERADO, cooperativaId: COOP, nomeCompleto: "Test" }],
    pagamentosCooperado: [],
    fichaCorrida: [],
    notasPedido: [],
    config: { descontoPadraoCooperativa: 0 },
  } as unknown as AppData;
  return { ...base, ...overrides };
}

function main() {
  const motorComValor = {
    mesLabel: "Set/2026",
    valor: 150,
    valorRecibo: 0,
    aguardandoAssinatura: false,
  };
  const revA = "p:1:confirmado|f:1";

  let r = aplicarPoliticaCardInicioEndurecida(motorComValor, revA, null, {
    carregandoFinanceiro: false,
  });
  assert.equal(r.display.valor, 150);
  assert.equal(r.latch.hadPendencia, true);

  const motorMascaradoZero = { ...motorComValor, valor: 0 };
  r = aplicarPoliticaCardInicioEndurecida(motorMascaradoZero, revA, r.latch, {
    carregandoFinanceiro: true,
  });
  assert.equal(r.display.valor, 150, "sync não zera sem mudança operacional");
  assert.equal(r.atualizando, true);

  const revB = `${revA}|p:2:aguardando_confirmacao`;
  const motorQuitado = { mesLabel: "Set/2026", valor: 0, valorRecibo: 0, aguardandoAssinatura: false };
  r = aplicarPoliticaCardInicioEndurecida(motorQuitado, revB, r.latch, {
    carregandoFinanceiro: false,
    autorizaZerarValor: false,
  });
  assert.equal(r.display.valor, 150, "PIX aguardando não zera card — só pagamento confirmado (BIC)");

  const revC = `${revB}|p:2:confirmado`;
  r = aplicarPoliticaCardInicioEndurecida(motorQuitado, revC, r.latch, {
    carregandoFinanceiro: false,
    autorizaZerarValor: true,
  });
  assert.equal(r.display.valor, 0, "pagamento confirmado autoriza zerar");
  assert.equal(r.latch.hadPendencia, false);

  const anterior = { mesLabel: "Set", valor: 200, valorRecibo: 0, aguardandoAssinatura: false };
  const menor = { mesLabel: "Set", valor: 50, valorRecibo: 0, aguardandoAssinatura: false };
  assert.equal(aplicarSubstituicaoMonotonaDisplay(anterior, menor, true).valor, 200);
  assert.equal(aplicarSubstituicaoMonotonaDisplay(anterior, { ...anterior, valor: 250 }, true).valor, 250);
  assert.equal(aplicarSubstituicaoMonotonaDisplay(anterior, { mesLabel: "Set", valor: 0, valorRecibo: 0, aguardandoAssinatura: false }, true, { autorizaZerarValor: true }).valor, 0);
  assert.equal(
    aplicarSubstituicaoMonotonaDisplay(anterior, { mesLabel: "Set", valor: 0, valorRecibo: 0, aguardandoAssinatura: false }, true, {
      autorizaZerarValor: false,
    }).valor,
    200
  );

  assert.equal(
    cooperadoMotorTemObrigacaoReceber({ mesLabel: "x", valor: 0, valorRecibo: 10, aguardandoAssinatura: true }),
    false,
    "obrigação do card = valor líquido M6, não recibo legado"
  );

  const data = miniData();
  const revEmpty = cooperadoMotorRevisionOperacional(data, COOPERADO, COOP);
  assert.ok(typeof revEmpty === "string");

  console.log("OK — política card início endurecida");
}

main();
