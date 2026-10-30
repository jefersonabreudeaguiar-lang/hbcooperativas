/** A porta BIC deve preservar o mesmo isolamento por cooperativa da leitura central. */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { leituraCooperadoFinanceira } from "../src/lib/bic/bicLeituraPorta.ts";

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL = "false";
process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE = "false";
process.env.NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO = "true";

const mkData = (includeForeign: boolean): AppData => ({
  cooperativas: ["owner", "other"].map((id) => ({ id, nome: id, cnpj: "", createdAt: "", updatedAt: "" })),
  cooperados: [{ id: "member", cooperativaId: "owner", nomeCompleto: "M", cpfCnpj: "1", telefone: "", endereco: "", comunidade: "", chavePix: "", pixValido: true, ativo: true, createdAt: "", updatedAt: "" }],
  users: [], notasPedido: [],
  fichaCorrida: [
    { id: "own", cooperadoId: "member", cooperativaId: "owner", mesReferencia: "2026-08", valorLiquido: 25, valorBruto: 25, valorDesconto: 0, status: "pendente", descricao: "A" },
    ...(includeForeign ? [{ id: "foreign", cooperadoId: "member", cooperativaId: "other", mesReferencia: "2026-09", valorLiquido: 125, valorBruto: 125, valorDesconto: 0, status: "pendente", descricao: "B" }] : []),
  ],
  pagamentosCooperado: [], arquivosMensais: [], mensalidades: [], descontos: [], comunicados: [],
  config: { descontoPadraoCooperativa: 0 }, auditLog: [],
} as AppData);

const mixed = leituraCooperadoFinanceira(mkData(true), "member", "owner");
const isolated = leituraCooperadoFinanceira(mkData(false), "member", "owner");
assert.equal(mixed.meta.viaPorta, true, "facade: porta BIC ativa no cenário de teste");
assert.equal(mixed.value.valorLiquido, isolated.value.valorLiquido, "facade: valor isolado");
assert.deepEqual(mixed.value.mesesResumo, isolated.value.mesesResumo, "facade: meses isolados");
console.log("OK test-bic-facade-tenant (porta cooperado isolada)");
