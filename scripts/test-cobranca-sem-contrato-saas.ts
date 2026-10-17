/**
 * Contrato SaaS não trava o app; cobrança segue com PIX + confirmação no admin.
 * npx tsx scripts/test-cobranca-sem-contrato-saas.ts
 */
import assert from "node:assert/strict";
import type { AppData, Cooperativa } from "../src/types/index.ts";
import {
  contratoServicoAssinado,
  precisaAssinarContratoServico,
  getPainelCobrancaSaasResponsavel,
  ensureCobrancaPeriodoAtualSaas,
  responsavelInformouPagamentoSaas,
  confirmarPagamentoCobrancaSaas,
} from "../src/services/cobrancaSaasService.ts";

const COOP = "coop-1";

function dataBase(): AppData {
  return {
    config: { descontoPadraoCooperativa: 5 },
    cooperativas: [
      {
        id: COOP,
        nome: "Coop",
        cnpj: "62351750000165",
        active: true,
        cobrancaSaas: undefined,
      } as Cooperativa,
    ],
    cooperados: [
      {
        id: "c-1",
        nomeCompleto: "A",
        cooperativaId: COOP,
        status: "ativo",
        createdAt: "2026-01-10T00:00:00.000Z",
        chavePix: "a@test",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    livroCaixa: [],
    mensalidades: [],
  } as unknown as AppData;
}

assert.equal(precisaAssinarContratoServico(undefined), false);
assert.equal(contratoServicoAssinado(undefined), true);
assert.equal(precisaAssinarContratoServico(dataBase().cooperativas[0]), false);

const gerada = ensureCobrancaPeriodoAtualSaas(dataBase(), COOP);
assert.equal(gerada.ok, true);
const painel = getPainelCobrancaSaasResponsavel(gerada.data, COOP);
assert.ok(painel);
assert.equal(painel.precisaContrato, false);
assert.ok(painel.pixChave.length > 0);
assert.ok(painel.valorTotal > 0);

const informado = responsavelInformouPagamentoSaas(gerada.data, COOP, "Responsavel");
assert.equal(informado.ok, true, informado.error);
assert.equal(
  getPainelCobrancaSaasResponsavel(informado.data, COOP)?.aguardandoConfirmacao,
  true
);

const confirmado = confirmarPagamentoCobrancaSaas(informado.data, COOP, "Criador");
assert.equal(confirmado.ok, true, confirmado.error);
const depois = getPainelCobrancaSaasResponsavel(confirmado.data, COOP);
assert.equal(depois?.statusMes, "em_dia");

console.log("ok: cobrança sem contrato SaaS — PIX + confirmação admin");
