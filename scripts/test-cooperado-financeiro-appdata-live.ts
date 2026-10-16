/**
 * APPDATA_LIVE desliga autoridade BIC na UI e força paridade legado na entrada única.
 */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { isBicCentralReadAuthorityEnabled } from "../src/lib/bic/bicCentralReadAuthority.ts";
import { cooperadoLeituraFinanceiraExibicao } from "../src/lib/cooperado/cooperadoLeituraFinanceiraExibicao.ts";
import { leituraFinanceiraParidadeCooperado } from "../src/lib/cooperado/cooperadoFinanceiroParidadeUniversal.ts";
import { buildCooperadoFinanceiroUiSnapshot } from "../src/services/cooperadoFinanceiroUiSnapshot.ts";

const COOP = "coop-live";
const COOPERADO = "c-live";

function base(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Live",
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
  } as AppData;
}

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE = "true";

assert.equal(isBicCentralReadAuthorityEnabled(), false);

const data = base();
const viaEntrada = cooperadoLeituraFinanceiraExibicao(data, COOPERADO, COOP);
const direto = leituraFinanceiraParidadeCooperado(data, COOPERADO, COOP);
assert.equal(viaEntrada.valorLiquido, direto.valorLiquido);

const snap = buildCooperadoFinanceiroUiSnapshot({
  data,
  cooperadoId: COOPERADO,
  cooperativaId: COOP,
  opts: { dataReady: true },
});
assert.equal(snap.autoridade, "LEGADO");

console.log("OK test-cooperado-financeiro-appdata-live");
