/**
 * Responsável: persistir snapshot vazio nunca apaga cadastro/notas/fichas/PIX.
 * npx tsx scripts/test-staff-gestao-nunca-zera-snapshot.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  deveAdiarReconciliarFichaAposLimpezaCacheStaff,
  resetStaffOperacionalColdHydrateForTests,
} from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import {
  medirRiquezaStaffGestao,
  preservarStaffGestaoContraWipe,
  resetStaffGestaoSnapshotGuardForTests,
  staffGestaoSnapshotPoorer,
} from "../src/lib/staff/staffGestaoSnapshotGuard.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

resetStaffGestaoSnapshotGuardForTests();
resetStaffOperacionalColdHydrateForTests();

const rico = {
  ...emptyInitialData,
  cooperados: [{ id: "c1", cooperativaId: "coop1", nomeCompleto: "A", status: "ativo" } as never],
  notasPedido: [{ id: "n1", cooperativaId: "coop1" } as never],
  fichaCorrida: Array.from({ length: 20 }, (_, i) => ({
    id: `f${i}`,
    cooperativaId: "coop1",
    status: "pendente",
  })),
  pagamentosCooperado: [{ id: "p1", cooperativaId: "coop1", status: "confirmado" } as never],
  livroCaixa: [{ id: "l1", cooperativaId: "coop1" } as never],
};

const vazio = { ...emptyInitialData };

assert.equal(staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(vazio), medirRiquezaStaffGestao(rico)), true);
assert.equal(staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(rico), medirRiquezaStaffGestao(vazio)), false);

const salvo = preservarStaffGestaoContraWipe(rico, vazio);
assert.equal(salvo.cooperados.length, 1, "não zera cooperados");
assert.equal(salvo.notasPedido.length, 1, "não zera notas");
assert.equal(salvo.fichaCorrida.length, 20, "não zera fichas");
assert.equal(salvo.pagamentosCooperado.length, 1, "não zera PIX");
assert.equal(salvo.livroCaixa.length, 1, "não zera livro");

const comPixNovo = {
  ...vazio,
  pagamentosCooperado: [
    { id: "p1", cooperativaId: "coop1", status: "confirmado" } as never,
    { id: "p2", cooperativaId: "coop1", status: "confirmado" } as never,
  ],
};
const fundido = preservarStaffGestaoContraWipe(rico, comPixNovo);
assert.ok(fundido.fichaCorrida.length >= 20);
assert.ok(fundido.pagamentosCooperado.some((p) => p.id === "p2"));

const lastroComManual = {
  ...emptyInitialData,
  cooperativas: [{ id: "coop1", cnpj: "62351750000165", nome: "Coop" } as never],
  cooperados: rico.cooperados,
  notasPedido: rico.notasPedido,
  fichaCorrida: rico.fichaCorrida,
  pagamentosCooperado: rico.pagamentosCooperado,
  livroCaixa: [
    { id: "pix1", cooperativaId: "coop1", origem: "pagamento_cooperado" } as never,
    { id: "man1", cooperativaId: "coop1", origem: "manual" } as never,
  ],
  livroCaixaOrigensCadastro: [
    { id: "cad1", cooperativaId: "coop1", nome: "Feira", createdAt: "2026-10-20T00:00:00.000Z" },
  ],
};
const pullSemManual = {
  ...lastroComManual,
  livroCaixa: [{ id: "pix1", cooperativaId: "coop1", origem: "pagamento_cooperado" } as never],
  livroCaixaOrigensCadastro: [],
};
assert.equal(
  staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(pullSemManual), medirRiquezaStaffGestao(lastroComManual)),
  true,
  "nuvem sem o lançamento manual é snapshot pobre"
);
const aposF5 = preservarStaffGestaoContraWipe(lastroComManual, pullSemManual);
assert.ok(
  aposF5.livroCaixa.some((l) => l.id === "man1"),
  "F5/pull não apaga lançamento manual que já estava no aparelho"
);
const lastroAntigo = {
  ...lastroComManual,
  livroCaixa: [{ id: "pix1", cooperativaId: "coop1", origem: "pagamento_cooperado" } as never],
};
const incomingComNovoManual = {
  ...lastroComManual,
  livroCaixa: [
    { id: "pix1", cooperativaId: "coop1", origem: "pagamento_cooperado" } as never,
    { id: "man2", cooperativaId: "coop1", origem: "credito_avulso" } as never,
  ],
};
const aposSalvar = preservarStaffGestaoContraWipe(lastroAntigo, incomingComNovoManual);
assert.ok(
  aposSalvar.livroCaixa.some((l) => l.id === "man2"),
  "lançamento novo entra no lastro e não some no Atualizar"
);
assert.ok(
  (aposF5.livroCaixaOrigensCadastro ?? []).some((o) => o.id === "cad1"),
  "F5/pull não apaga origem cadastrada"
);
const pullComExclusao = {
  ...pullSemManual,
  livroCaixaExcluidos: [{ id: "man1", cooperativaId: "coop1", excluidoEm: "2026-10-20T00:00:00.000Z" }],
};
const aposExcluir = preservarStaffGestaoContraWipe(lastroComManual, pullComExclusao);
assert.equal(
  aposExcluir.livroCaixa.some((l) => l.id === "man1"),
  false,
  "exclusão publicada continua valendo"
);

const lastroFila = {
  ...lastroComManual,
  notasPedido: [{ id: "n1", cooperativaId: "coop1", status: "aguardando_conferencia" } as never],
};
const incomingConferida = {
  ...pullSemManual,
  notasPedido: [{ id: "n1", cooperativaId: "coop1", status: "conferida" } as never],
};
const semRebaixar = preservarStaffGestaoContraWipe(lastroFila, incomingConferida);
assert.equal(
  semRebaixar.notasPedido.find((n) => n.id === "n1")?.status,
  "conferida",
  "lastro do F5 não rebaixa nota já lançada"
);

resetStaffOperacionalColdHydrateForTests();
assert.equal(
  deveAdiarReconciliarFichaAposLimpezaCacheStaff(rico as never, "coop1"),
  false,
  "com ficha local não esconde o painel"
);

const store = readFileSync(join(ROOT, "src/services/dataStore.ts"), "utf8");
assert.ok(store.includes("applyStaffGestaoWipeGuard"), "saveDataSafe recusa wipe");
assert.ok(store.includes("restoreStaffGestaoFromLastGoodIfNeeded"), "F5 reaplica lastro se o blob veio pobre");
assert.ok(store.includes("persistedAppDataBlobLooksHydrated"), "F5 detecta blob local rico");
assert.ok(store.includes("hydrateStaffGestaoFirstPaintFromLastro"), "F5 pinta lastro sem parsear o persist");
assert.ok(store.includes("reloadStaffGestaoPersistAfterFirstPaint"), "persist entra depois do primeiro quadro");

const guard = readFileSync(join(ROOT, "src/lib/staff/staffGestaoSnapshotGuard.ts"), "utf8");
assert.ok(guard.includes("hb-staff-gestao-lkg-v1"), "lastro sobrevive F5 no sessionStorage");
assert.ok(guard.includes("flushStaffGestaoLastGoodNow"), "lançamento grava lastro na hora");
assert.ok(guard.includes("immediate: livroOuOrigemCresceu"), "livro novo não espera debounce de 80ms");

const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
assert.ok(provider.includes("refreshData()"), "sync staff relê localStorage se a memória veio vazia");

console.log("OK — test-staff-gestao-nunca-zera-snapshot");
