import { uploadOperacionalSync, type OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { preservarCotasIngresso } from "../src/services/cotaIngressoMerge";
import assert from "node:assert/strict";
import { emptyInitialData } from "../src/mock/data";
import type { AppData, ArquivoMensalCooperado } from "../src/types";
import { inferAppDataDomainsTouched } from "../src/lib/performance/appDataDomainNotify";
import { getResumoPagamentoConsolidadoCooperado, setCotaIngressoCooperado, mergeArquivosMensaisFromCloud, overlayContaCoopDescontosLocalAposReplace } from "../src/services/notaPedidoService";
import { valorAPagarCooperadoEmAberto } from "../src/lib/responsavel/responsavelGestaoLeitura";
import { alinharCatalogoSnapshotStaff } from "../src/lib/staff/staffGestaoPainelLeitura";
import { cooperadoFinanceiroScopedData } from "../src/lib/cooperado/cooperadoFinanceiroScopedData";

const data = {
  ...structuredClone(emptyInitialData),
  cooperativas: [{ id: "coop", nome: "Coop", cnpj: "00000000000191", mensalidadeConfig: { valorPadrao: 0 } }],
  cooperados: [{ id: "c", cooperativaId: "coop", nomeCompleto: "Teste", status: "ativo" }],
  config: { ...emptyInitialData.config, descontoPadraoCooperativa: 0 },
  fichaCorrida: ["2026-09", "2026-10"].map((mes, i) => ({ id: `f${i}`, notaPedidoId: `n${i}`, cooperadoId: "c", cooperativaId: "coop", mesReferencia: mes, status: "pendente", valorBruto: 500, valorLiquido: 500, descontos: 0 })),
  notasPedido: ["2026-09", "2026-10"].map((mes, i) => ({ id: `n${i}`, cooperadoId: "c", cooperativaId: "coop", mesReferencia: mes, status: "conferida", valorBruto: 500, valorLiquido: 500, itens: [], createdAt: `${mes}-01T00:00:00Z` })),
} as unknown as AppData;
const changed = { ...data, valoresAvulsosReceber: [
  { id: "debit", cooperadoId: "c", cooperativaId: "coop", mesReferencia: "2026-11", natureza: "debito", valor: 200, motivo: "Adiantamento", status: "pendente", dataLancamento: "2026-11-01" },
  { id: "credit", cooperadoId: "c", cooperativaId: "coop", mesReferencia: "2026-11", natureza: "credito", valor: 50, motivo: "Acerto", status: "pendente", dataLancamento: "2026-11-01" },
] } as AppData;
assert.deepEqual(inferAppDataDomainsTouched(data, changed), ["financeiro"], "Avulsos atualizam a tela financeira sem atualizar todo o menu");
const summary = getResumoPagamentoConsolidadoCooperado(changed, "c", ["2026-09", "2026-10"], "coop");
assert.equal(summary.valorLiquido, 850);
assert.equal(summary.descontosExtras.filter(d => d.referenciaId === "debit").length, 1);
assert.equal(valorAPagarCooperadoEmAberto(changed, "c", "coop").total, 850);
const paid = setCotaIngressoCooperado(changed, "c", "coop", "2026-10", true);
const local = paid.arquivosMensais[0];
const stale = { ...local, cotaIngressoPaga: false, cotaIngressoUpdatedAt: undefined, updatedAt: "2099-01-01T00:00:00Z" } as ArquivoMensalCooperado;
assert.equal(mergeArquivosMensaisFromCloud(paid, [local], [stale])[0].cotaIngressoPaga, true, "Outra edição não desfaz a cota paga");
assert.equal(overlayContaCoopDescontosLocalAposReplace(paid, [local], [stale])[0].cotaIngressoPaga, true);
assert.equal(overlayContaCoopDescontosLocalAposReplace(paid, [local], [])[0].cotaIngressoPaga, true, "Pull anterior à gravação não apaga a confirmação");
const reversal = { ...local, cotaIngressoPaga: false, cotaIngressoUpdatedAt: "2099-01-01T00:00:00Z" };
assert.equal(mergeArquivosMensaisFromCloud(paid, [local], [reversal])[0].cotaIngressoPaga, false, "Correção explícita posterior continua possível");
assert.equal(preservarCotasIngresso([local], [stale])[0].cotaIngressoPaga, true, "Servidor preserva a cota contra aparelho antigo");
assert.equal(preservarCotasIngresso([local], [])[0].cotaIngressoPaga, true, "Servidor preserva confirmação omitida no payload");
assert.equal(preservarCotasIngresso([local], [reversal])[0].cotaIngressoPaga, false);
const restored = mergeArquivosMensaisFromCloud(paid, [local], [stale])[0];
assert.equal(mergeArquivosMensaisFromCloud(paid, [restored], [reversal])[0].cotaIngressoPaga, false, "Merge anterior mantém a data da alteração da cota");
const visible = alinharCatalogoSnapshotStaff(data, paid);
assert.equal(visible.valoresAvulsosReceber.length, 2);
assert.equal(visible.arquivosMensais[0].cotaIngressoPaga, true);
assert.equal(valorAPagarCooperadoEmAberto(visible, "c", "coop").total, 850);
assert.equal(cooperadoFinanceiroScopedData(changed, "c", "coop"), cooperadoFinanceiroScopedData(changed, "c", "coop"), "Reutiliza cálculo por snapshot");
assert.notEqual(cooperadoFinanceiroScopedData(changed, "c", "coop"), cooperadoFinanceiroScopedData(paid, "c", "coop"));
console.log("PASS: débito/crédito aplicados uma vez, resumo responsável, atualização seletiva, cota preservada no merge/replace e cache por snapshot.");

async function serverPath() {
  let uploaded: OperacionalSyncPayload | null = null;
  const fake = { storage: { listBuckets: async () => ({data: []}), createBucket: async () => ({}), from: () => ({ upload: async (_path: string, body: string) => { uploaded = JSON.parse(body); return {error: null}; } }) } } as unknown as SupabaseClient;
  const existing = {...paid} as unknown as OperacionalSyncPayload;
  const incoming = {...paid, arquivosMensais: [stale]} as unknown as OperacionalSyncPayload;
  const result = await uploadOperacionalSync(fake, "00000000000191", incoming, {existingOperacional: existing, skipPagamentoConfirmadoProtection: true});
  assert.equal(result.ok, true);
  assert.equal((uploaded as unknown as OperacionalSyncPayload).arquivosMensais[0].cotaIngressoPaga, true, "Caminho normal da API preserva a cota antes do upload");
  console.log("PASS: gravação simulada do servidor não rebaixa cota paga, sem rede ou dados reais.");
}
void serverPath();
