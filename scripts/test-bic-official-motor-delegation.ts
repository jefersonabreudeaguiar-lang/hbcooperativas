/**
 * App oficial: motores públicos delegam ao BIC quando NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL=true.
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { isBicCentralReadAuthorityEnabled } from "../src/lib/bic/bicCentralReadAuthority";
import {
  getValorQuantoVouReceber,
  getValorQuantoVouReceberMotorLegado,
  getResumoQuantoVouReceberCooperado,
} from "../src/services/cooperadoEntregasService";

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";

assert.equal(isBicCentralReadAuthorityEnabled(), true, "BIC official deve estar ativo no teste");

const COOP = "coop-bic";
const COOPADO = "c1";
const MES = "2026-09";

function base(overrides: Partial<AppData> = {}): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPADO,
        cooperativaId: COOP,
        nomeCompleto: "Test",
        cpfCnpj: "1",
        telefone: "",
        endereco: "",
        comunidade: "",
        chavePix: "x",
        pixValido: true,
        ativo: true,
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    descontos: [],
    comunicados: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
    ...overrides,
  } as AppData;
}

const data = base({
  fichaCorrida: [
    {
      id: "f1",
      cooperadoId: COOPADO,
      cooperativaId: COOP,
      mesReferencia: MES,
      valorLiquido: 150,
      valorBruto: 150,
      valorDesconto: 0,
      status: "pendente",
      descricao: "Entrega teste",
    },
  ],
});

const legado = getValorQuantoVouReceberMotorLegado(data, COOPADO, COOP);
assert.equal(legado.valor, 150, "legado: valor ficha aberto");

const bic = getValorQuantoVouReceber(data, COOPADO, COOP);
assert.equal(bic.valorRecibo, 0, "público BIC não promove valorRecibo");
assert.equal(bic.aguardandoAssinatura, false, "público BIC sem aguardando assinatura");
assert.equal(bic.valor, 150, "público BIC = valor ficha aberto");

const dataRecibo = base({
  pagamentosCooperado: [
    {
      id: "pg1",
      cooperadoId: COOPADO,
      cooperativaId: COOP,
      mesReferencia: MES,
      valorLiquido: 99,
      status: "aguardando_confirmacao",
      mesesReferencia: [MES],
    },
  ],
});

const legadoRecibo = getValorQuantoVouReceberMotorLegado(dataRecibo, COOPADO, COOP);
assert.ok(legadoRecibo.valorRecibo > 0 || legadoRecibo.aguardandoAssinatura, "legado expõe recibo");
const bicRecibo = getValorQuantoVouReceber(dataRecibo, COOPADO, COOP);
assert.equal(bicRecibo.valor, 0, "BIC sem ficha aberta = 0, não valorRecibo");
assert.equal(bicRecibo.valorRecibo, 0);

const painel = getResumoQuantoVouReceberCooperado(data, COOPADO, COOP);
assert.equal(painel.estado, "a_receber", "painel BIC estado a_receber");
assert.equal(painel.valorDestaque, 150, "painel BIC valorDestaque = ficha");
assert.equal(painel.tituloValor, "Total a receber");

console.log("BIC official motor delegation: OK");
