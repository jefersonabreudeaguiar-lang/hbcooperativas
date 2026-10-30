/** BIC deve manter dados financeiros dentro da cooperativa solicitada. */
import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { resolveLeituraFinanceiraCooperadoCore } from "../src/lib/bic/bicLeituraPorta.ts";
import { fichaPertenceCooperado, notaPertenceCooperado } from "../src/services/cooperadoCloudService.ts";

process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL = "false";
process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
process.env.NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE = "false";

const base: AppData = {
  cooperativas: ["a", "b"].map((id) => ({ id, nome: id, cnpj: "", createdAt: "", updatedAt: "" })),
  cooperados: ["a", "b"].map((id) => ({
    id: `member-${id}`, cooperativaId: id, nomeCompleto: id, cpfCnpj: "1", telefone: "",
    endereco: "", comunidade: "", chavePix: "", pixValido: true, ativo: true, createdAt: "", updatedAt: "",
  })),
  users: [], notasPedido: [],
  fichaCorrida: [
    { id: "f-a", cooperadoId: "member-a", cooperativaId: "a", mesReferencia: "2026-08", valorLiquido: 25, valorBruto: 25, valorDesconto: 0, status: "pendente", descricao: "A" },
    { id: "f-b-cross", cooperadoId: "member-a", cooperativaId: "b", mesReferencia: "2026-10", valorLiquido: 60, valorBruto: 60, valorDesconto: 0, status: "pendente", descricao: "foreign A" },
    { id: "f-b", cooperadoId: "member-b", cooperativaId: "b", mesReferencia: "2026-09", valorLiquido: 125, valorBruto: 125, valorDesconto: 0, status: "pendente", descricao: "B" },
    { id: "f-a-cross", cooperadoId: "member-b", cooperativaId: "a", mesReferencia: "2026-10", valorLiquido: 40, valorBruto: 40, valorDesconto: 0, status: "pendente", descricao: "foreign B" },
  ],
  pagamentosCooperado: [], arquivosMensais: [], mensalidades: [], descontos: [], comunicados: [],
  config: { descontoPadraoCooperativa: 0 }, auditLog: [],
} as AppData;

const onlyA = { ...base, cooperados: [base.cooperados[0]!], fichaCorrida: [base.fichaCorrida[0]!] } as AppData;
const onlyB = { ...base, cooperados: [base.cooperados[1]!], fichaCorrida: [base.fichaCorrida[2]!] } as AppData;
for (const [coop, cooperadoId, expected] of [["a", "member-a", onlyA], ["b", "member-b", onlyB]] as const) {
  const mixed = resolveLeituraFinanceiraCooperadoCore(base, cooperadoId, coop);
  const isolated = resolveLeituraFinanceiraCooperadoCore(expected, cooperadoId, coop);
  assert.equal(mixed.valorLiquido, isolated.valorLiquido, `tenant ${coop}: valor isolado`);
  assert.deepEqual(mixed.mesesResumo, isolated.mesesResumo, `tenant ${coop}: meses isolados`);
}
assert.equal(fichaPertenceCooperado(base, base.fichaCorrida[1]!, "member-a", "a"), false,
  "ficha com o mesmo cooperadoId não atravessa cooperativa");
assert.equal(notaPertenceCooperado(base, {
  cooperadoId: "member-a", cooperativaId: "b", divisaoEntrega: { participantes: [] },
}, "member-a", "a"), false, "nota com o mesmo cooperadoId não atravessa cooperativa");
console.log("OK test-bic-tenant-guard (2 tenants isolados)");
