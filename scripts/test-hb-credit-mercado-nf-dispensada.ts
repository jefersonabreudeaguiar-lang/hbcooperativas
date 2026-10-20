/**
 * A partir de 20/10/2026 o mercado não envia NF de cooperado.
 * npx tsx scripts/test-hb-credit-mercado-nf-dispensada.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA,
  HB_CREDIT_MERCADO_NF_AVISO_BOTAO,
  HB_CREDIT_MERCADO_NF_AVISO_CORPO,
  HB_CREDIT_MERCADO_NF_AVISO_TITULO,
  hbCreditMercadoNfAvisoAckKey,
  HB_CREDIT_MERCADO_NF_DISPENSADA_DESDE,
  isHbCreditMercadoNfDispensada,
} from "../src/lib/hb-credit/hbCreditMercadoNfPolicy.ts";
import { evaluatePartnerFiscalSettlementGate } from "../src/lib/supabase/hbCreditFiscalNotesStorage.ts";

const root = join(import.meta.dirname ?? __dirname, "..");

assert.equal(isHbCreditMercadoNfDispensada(), true);
assert.equal(HB_CREDIT_MERCADO_NF_DISPENSADA_DESDE, "2026-10-20");
assert.match(HB_CREDIT_MERCADO_NF_AVISO_TITULO, /20 de outubro de 2026/);
assert.match(HB_CREDIT_MERCADO_NF_AVISO_CORPO, /dispensam o envio de notas fiscais/i);
assert.match(HB_CREDIT_MERCADO_NF_AVISO_CORPO, /autorizando a movimentação financeira/i);
assert.equal(HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA, "Agradece a Direção HB Coop.");
assert.equal(HB_CREDIT_MERCADO_NF_AVISO_BOTAO, "Li e confirmo");
assert.match(hbCreditMercadoNfAvisoAckKey("p1", "62.351.750/0001-65"), /62351750000165:p1$/);

const gate = evaluatePartnerFiscalSettlementGate({
  mesReferencia: "2026-10",
  partnerId: "p1",
  totalVendas: 2,
  totalVendasCents: 10000,
  conferidas: 0,
  totalConferidasCents: 0,
  pendentesAnexo: 2,
  aguardandoConferencia: 0,
  correcaoPedida: 0,
});
assert.equal(gate.ready, true, "NF pendente não pode travar o recebimento");
assert.equal(gate.message, null);

const vazio = evaluatePartnerFiscalSettlementGate({
  mesReferencia: "2026-10",
  partnerId: "p1",
  totalVendas: 0,
  totalVendasCents: 0,
  conferidas: 0,
  totalConferidasCents: 0,
  pendentesAnexo: 0,
  aguardandoConferencia: 0,
  correcaoPedida: 0,
});
assert.equal(vazio.ready, false);

const mercado = readFileSync(join(root, "src/app/(app)/mercado-parceiro/MercadoParceiroContent.tsx"), "utf8");
assert.match(mercado, /MercadoHbCreditNfDispensadaAviso/);
assert.match(mercado, /!isHbCreditMercadoNfDispensada\(\) && <ContaCoopFiscalNotesMercadoPanel/);

const aviso = readFileSync(
  join(root, "src/components/hb-credit/MercadoHbCreditNfDispensadaAviso.tsx"),
  "utf8"
);
assert.match(aviso, /HB_CREDIT_MERCADO_NF_AVISO_ASSINATURA/);
assert.match(aviso, /HB_CREDIT_MERCADO_NF_AVISO_BOTAO/);
assert.match(aviso, /localStorage\.setItem/);
assert.doesNotMatch(aviso, /setTimeout|setInterval/);

const termo = readFileSync(join(root, "src/config/termoUsoMercadoContaCoop.ts"), "utf8");
assert.match(termo, /não precisa enviar notas fiscais em nome do cooperado/);
assert.doesNotMatch(termo, /mercado deve anexar e manter regularizadas as notas fiscais das vendas/);

console.log("ok: mercado HB — NF de cooperado dispensada; compra liberada para receber");
