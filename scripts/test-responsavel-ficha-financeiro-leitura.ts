/**
 * npx tsx scripts/test-responsavel-ficha-financeiro-leitura.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "@/types";
import {
  cooperativaCnpjDigitsFromAppData,
  pickResumoStaffFichaPagar,
  responsavelBadgeFilaPagarCount,
  responsavelFichaAppDataDomains,
} from "../src/lib/responsavel/responsavelFichaFinanceiroLeitura";

const COOP = "coop-1";
const CNPJ = "62351750000165";
const COOP_C = "c_resp";

function miniData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "X", cnpj: CNPJ, createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOP_C,
        cooperativaId: COOP,
        nomeCompleto: "Coop",
        cpf: "000",
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

assert.deepEqual(responsavelFichaAppDataDomains(false), ["financeiro", "shell", "notas"]);
assert.deepEqual(responsavelFichaAppDataDomains(true), ["financeiro", "shell"]);

assert.equal(cooperativaCnpjDigitsFromAppData(miniData(), COOP), CNPJ);

const consolidado = {
  valorLiquido: 100,
  resumo: {
    valorBruto: 100,
    descontoCooperativa: 0,
    descontosExtras: [],
    valorEntregas: 100,
    valorLiquido: 100,
    fichaIds: [],
  },
} as const;

const picked = pickResumoStaffFichaPagar({
  data: miniData(),
  cooperadoId: COOP_C,
  cooperativaId: COOP,
  mesesPendentesPagamento: ["2026-10"],
  resumoPagamentoConsolidado: consolidado.resumo,
  financeiroAberto: null,
  mesAtivo: "2026-10",
  fluxoReciboAssinatura: false,
});
assert.equal(picked?.valorLiquido, 100);

assert.equal(
  responsavelBadgeFilaPagarCount({
    cooperadosParaPagarCount: 5,
    aguardandoAssinaturaCount: 1,
    aguardandoVerificacaoCount: 0,
    cnpjDigits: "",
  }),
  6
);

console.log("test-responsavel-ficha-financeiro-leitura: OK");
