/**
 * Onda 1.3 — PIX/recibo confirmado pelo responsável → cooperado assina → motor e snapshot coerentes.
 * npx tsx scripts/test-cooperado-recibo-assinatura-apos-confirmado.ts
 */
import assert from "node:assert/strict";
import type { AppData, FichaCorrida } from "../src/types/index.ts";
import {
  registrarPagamentoCooperado,
  finalizarPagamentoCooperadoConfirmado,
  getPagamentoPendenteAssinaturaReciboCooperado,
} from "../src/services/notaPedidoService.ts";
import { getValorQuantoVouReceberMotorLegado } from "../src/services/cooperadoEntregasService.ts";
import { buildCooperadoFinanceiroUiSnapshot } from "../src/services/cooperadoFinanceiroUiSnapshot.ts";
import { mesclarAssinaturaReciboPagamentoConfirmado } from "../src/services/pagamentoIntegridadeService.ts";
import { mergePagamentoCooperadoRecord } from "../src/services/pagamentoRegistroMerge.ts";

const COOP = "coop-recibo-assin";
const COOPERADO = "c_recibo";

function withBicOfficial<T>(fn: () => T): T {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
  process.env.NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK = "true";
  return fn();
}

function base(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Coop Recibo",
        cpfCnpj: "1",
        status: "ativo",
        createdAt: "",
        updatedAt: "",
      },
    ],
    users: [],
    notasPedido: [],
    fichaCorrida: [
      {
        id: "fc1",
        cooperativaId: COOP,
        cooperadoId: COOPERADO,
        notaPedidoId: "np1",
        mesReferencia: "2026-09",
        descricao: "Entrega",
        valorBruto: 80,
        descontos: 0,
        valorLiquido: 80,
        saldoAcumulado: 80,
        status: "pendente",
        itens: [],
        createdAt: "",
        updatedAt: "",
      } as FichaCorrida,
    ],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [],
    produtosInstituicao: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  } as AppData;
}

let data = registrarPagamentoCooperado(base(), COOPERADO, "2026-09", "Responsável");
const pg = data.pagamentosCooperado[data.pagamentosCooperado.length - 1]!;
assert.equal(pg.status, "confirmado");
assert.ok(!pg.assinaturaCooperado?.trim());

const antesMotor = getValorQuantoVouReceberMotorLegado(data, COOPERADO, COOP);
assert.equal(antesMotor.aguardandoAssinatura, true);
assert.ok(antesMotor.valorRecibo > 0);
assert.ok(getPagamentoPendenteAssinaturaReciboCooperado(data, COOPERADO, "2026-09"));

withBicOfficial(() => {
  const snapAntes = buildCooperadoFinanceiroUiSnapshot({
    data,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    opts: { dataReady: true },
  });
  assert.equal(snapAntes.podeAssinarRecibo, true, "BIC: pagamento confirmado sem assinatura → pode assinar");
});

data = finalizarPagamentoCooperadoConfirmado(data, pg.id, {
  assinaturaDataUrl: "data:image/png;base64,assinatura-teste",
});

const pgDepois = data.pagamentosCooperado.find((p) => p.id === pg.id)!;
assert.ok(pgDepois.assinaturaCooperado?.includes("base64"));
assert.ok(pgDepois.assinadoEm);

const depoisMotor = getValorQuantoVouReceberMotorLegado(data, COOPERADO, COOP);
assert.equal(depoisMotor.aguardandoAssinatura, false);
assert.equal(getPagamentoPendenteAssinaturaReciboCooperado(data, COOPERADO, "2026-09"), undefined);

withBicOfficial(() => {
  const snapDepois = buildCooperadoFinanceiroUiSnapshot({
    data,
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    opts: { dataReady: true },
  });
  assert.equal(snapDepois.podeAssinarRecibo, false);
  assert.equal(snapDepois.podeExibirBannerRecibo, false);
});

const cloudSemAssinatura = { ...pgDepois, assinaturaCooperado: undefined, assinadoEm: undefined, updatedAt: "2099-01-01T00:00:00.000Z" };
const localComAssinatura = pgDepois;
assert.ok(
  mergePagamentoCooperadoRecord(localComAssinatura, cloudSemAssinatura).assinaturaCooperado?.includes("base64"),
  "merge pull preserva assinatura local"
);

const mescladoNuvem = mesclarAssinaturaReciboPagamentoConfirmado(
  { ...pgDepois, assinaturaCooperado: undefined, assinadoEm: undefined },
  pgDepois
);
assert.ok(mescladoNuvem?.assinaturaCooperado?.includes("base64"), "mescla assinatura em pagamento já confirmado");

console.log("test-cooperado-recibo-assinatura-apos-confirmado: OK");
