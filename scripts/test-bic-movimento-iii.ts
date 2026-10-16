/**
 * Concerto BIC — Movimento III (staff, admin, revision watch).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isBicLeituraPortaAtiva } from "../src/lib/bic/bicLeituraPortaGating.ts";
import { staffMesPrincipalQuantoVouReceber } from "../src/lib/bic/bicStaffLeituraCooperado.ts";
import { leituraAdminSomaValorLiquidoCooperados } from "../src/lib/bic/bicLeituraPorta.ts";
import type { AppData } from "../src/types";

function envOn(): void {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
  process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
  process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE = "false";
  process.env.NEXT_PUBLIC_BIC_LEITURA_PORTA = "true";
  process.env.NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF = "true";
  process.env.NEXT_PUBLIC_BIC_LEITURA_PORTA_ADMIN = "true";
}

envOn();
assert.equal(isBicLeituraPortaAtiva("staff"), true);
assert.equal(isBicLeituraPortaAtiva("admin"), true);

const COOP = "coop-iii";
const C = "c-iii";
const MES = "2026-09";

const data = {
  cooperativas: [{ id: COOP, nome: "C", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
  cooperados: [
    {
      id: C,
      cooperativaId: COOP,
      nomeCompleto: "T",
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
  fichaCorrida: [
    {
      id: "f1",
      cooperadoId: C,
      cooperativaId: COOP,
      mesReferencia: MES,
      valorLiquido: 77,
      valorBruto: 77,
      valorDesconto: 0,
      status: "pendente",
      descricao: "e",
    },
  ],
  pagamentosCooperado: [],
  arquivosMensais: [],
  mensalidades: [],
  descontos: [],
  comunicados: [],
  config: { descontoPadraoCooperativa: 5 },
  auditLog: [],
} as AppData;

const mes = staffMesPrincipalQuantoVouReceber(data, C, COOP);
assert.ok(mes.length >= 4, "mes principal staff");

const soma = leituraAdminSomaValorLiquidoCooperados(data, [{ id: C, cooperativaId: COOP }]);
assert.ok(soma >= 77 - 0.02, "soma admin porta");

const watch = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/bic/bicRevisionWatch.ts"),
  "utf8"
);
assert.ok(watch.includes("watchBicCooperativaCloudRevision"));

const staffApp = readFileSync(
  join(
    import.meta.dirname ?? __dirname,
    "../src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx"
  ),
  "utf8"
);
assert.ok(staffApp.includes("staffMesPrincipalQuantoVouReceber"));

console.log("OK test-bic-movimento-iii");
