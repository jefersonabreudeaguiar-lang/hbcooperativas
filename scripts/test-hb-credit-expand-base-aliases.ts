/**
 * Crédito-base HB — réplica para ids alias/canônico do titular.
 * npx tsx scripts/test-hb-credit-expand-base-aliases.ts
 */
import assert from "node:assert/strict";
import type { AppData } from "@/types";
import { expandCreditosBaseMapCooperadoIds } from "../src/modules/hb-credit/engine/creditBaseAuthoritative";

const COOP = "coop-x";

function miniData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "T", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: "c_alias",
        cooperativaId: COOP,
        nomeCompleto: "Titular",
        cpfCnpj: "12345678901",
        status: "ativo",
        createdAt: "",
      },
      {
        id: "c_canon",
        cooperativaId: COOP,
        nomeCompleto: "Titular",
        cpfCnpj: "12345678901",
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

{
  const data = miniData();
  const expanded = expandCreditosBaseMapCooperadoIds(data, COOP, { c_canon: 10_000 });
  assert.equal(expanded.c_canon, 10_000);
  assert.equal(expanded.c_alias, 10_000);
}

console.log("OK — expandCreditosBaseMapCooperadoIds");
