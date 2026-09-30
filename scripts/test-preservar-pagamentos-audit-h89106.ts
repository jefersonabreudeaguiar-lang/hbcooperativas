/**
 * H8.9.106 — monotonicidade de confirmação + audit em lote (sem Supabase/Storage real).
 * Uso: npx tsx scripts/test-preservar-pagamentos-audit-h89106.ts
 */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pagamentoIdsPotencialmenteRegressivos,
  preservarPagamentosConfirmados,
} from "../src/services/pagamentoRegistroMerge.ts";
import { aplicarPreservacaoPagamentosConfirmadosNoOperacionalComAudit } from "../src/services/pagamentoIntegridadeService.ts";
import { fetchPagamentoConfirmacaoAuditEvidenceBatch } from "../src/lib/supabase/cooperativeAuditStorage.ts";
import type { PagamentoCooperadoRegistro } from "../src/types/index.ts";

function pagamento(
  id: string,
  status: PagamentoCooperadoRegistro["status"],
  extra?: Partial<PagamentoCooperadoRegistro>
): PagamentoCooperadoRegistro {
  return {
    id,
    cooperativaId: "coop-test",
    cooperadoId: "cooperado-a",
    mesReferencia: "2026-08",
    valorBruto: 1000,
    descontoCooperativa: 50,
    descontosExtras: [],
    valorLiquido: 950,
    fichaIds: ["f1"],
    notaPedidoIds: ["np1"],
    status,
    pagoPor: "responsavel",
    pagoEm: "2026-08-15T12:00:00.000Z",
    createdAt: "2026-08-15T12:00:00.000Z",
    ...extra,
  };
}

let passed = 0;

async function main() {
  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve(fn()).then(() => {
      passed += 1;
      console.log(`PASS — ${name}`);
    });
  }

  await test("1 — existing confirmado + incoming aguardando → confirmado", () => {
    const cloud = [pagamento("pg_a", "confirmado", { assinadoEm: "2026-08-20T10:00:00.000Z" })];
    const incoming = [pagamento("pg_a", "aguardando_confirmacao")];
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming);
    assert.equal(pagamentos[0]!.status, "confirmado");
  });

  await test("2 — existing confirmado + incoming sem assinatura → preservada", () => {
    const cloud = [
      pagamento("pg_b", "confirmado", {
        assinaturaCooperado: "data:image/png;base64,abc",
        assinadoEm: "2026-08-20T10:00:00.000Z",
      }),
    ];
    const incoming = [pagamento("pg_b", "aguardando_confirmacao")];
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming);
    assert.equal(pagamentos[0]!.assinaturaCooperado, "data:image/png;base64,abc");
  });

  await test("3 — existing aguardando + incoming aguardando sem audit → aguardando", () => {
    const cloud = [pagamento("pg_c", "aguardando_confirmacao")];
    const incoming = [pagamento("pg_c", "aguardando_confirmacao", { updatedAt: "2026-09-01" })];
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming);
    assert.equal(pagamentos[0]!.status, "aguardando_confirmacao");
  });

  await test("4 — existing aguardando + incoming aguardando + audit válido → confirmado", () => {
    const cloud = [pagamento("pg_d", "aguardando_confirmacao")];
    const incoming = [pagamento("pg_d", "aguardando_confirmacao")];
    const audit = new Map([
      ["pg_d", { pagamentoId: "pg_d", confirmedAt: "2026-09-21T22:51:19.306Z" }],
    ]);
    const { pagamentos, blockedDowngrades } = preservarPagamentosConfirmados(cloud, incoming, {
      auditConfirmacao: audit,
    });
    assert.equal(pagamentos[0]!.status, "confirmado");
    assert.equal(pagamentos[0]!.assinadoEm, "2026-09-21T22:51:19.306Z");
    assert.equal(blockedDowngrades.length, 1);
  });

  await test("5 — vários IDs: candidatos + audit map isolado por pagamento", () => {
    const cloud = [
      pagamento("pg_e1", "aguardando_confirmacao"),
      pagamento("pg_e2", "aguardando_confirmacao"),
    ];
    const incoming = [
      pagamento("pg_e1", "aguardando_confirmacao"),
      pagamento("pg_e2", "aguardando_confirmacao"),
    ];
    const candidates = pagamentoIdsPotencialmenteRegressivos(cloud, incoming);
    assert.deepEqual(candidates.sort(), ["pg_e1", "pg_e2"]);
    const audit = new Map([
      ["pg_e1", { pagamentoId: "pg_e1", confirmedAt: "2026-09-01T00:00:00.000Z" }],
    ]);
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming, { auditConfirmacao: audit });
    const byId = new Map(pagamentos.map((p) => [p.id, p]));
    assert.equal(byId.get("pg_e1")!.status, "confirmado");
    assert.equal(byId.get("pg_e2")!.status, "aguardando_confirmacao");
  });

  await test("6 — valor líquido não muda ao preservar por audit", () => {
    const cloud = [pagamento("pg_f", "aguardando_confirmacao", { valorLiquido: 8844.75 })];
    const incoming = [pagamento("pg_f", "aguardando_confirmacao", { valorLiquido: 8844.75 })];
    const audit = new Map([
      ["pg_f", { pagamentoId: "pg_f", confirmedAt: "2026-09-21T22:51:19.306Z" }],
    ]);
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming, { auditConfirmacao: audit });
    assert.equal(pagamentos[0]!.valorLiquido, 8844.75);
  });

  await test("7 — pagamentos diferentes não se misturam", () => {
    const cloud = [
      pagamento("pg_g1", "aguardando_confirmacao", { cooperadoId: "c1" }),
      pagamento("pg_g2", "aguardando_confirmacao", { cooperadoId: "c2" }),
    ];
    const incoming = [...cloud];
    const audit = new Map([
      ["pg_g1", { pagamentoId: "pg_g1", confirmedAt: "2026-09-01T00:00:00.000Z" }],
    ]);
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming, { auditConfirmacao: audit });
    const g1 = pagamentos.find((p) => p.id === "pg_g1")!;
    const g2 = pagamentos.find((p) => p.id === "pg_g2")!;
    assert.equal(g1.status, "confirmado");
    assert.equal(g2.status, "aguardando_confirmacao");
  });

  await test("8 — recibo/assinatura existentes preservados no merge audit", () => {
    const cloud = [
      pagamento("pg_h", "aguardando_confirmacao", {
        reciboHtml: "<p>recibo</p>",
        assinaturaCooperado: "data:image/png;base64,x",
      }),
    ];
    const incoming = [pagamento("pg_h", "aguardando_confirmacao")];
    const audit = new Map([
      ["pg_h", { pagamentoId: "pg_h", confirmedAt: "2026-09-21T22:51:19.306Z" }],
    ]);
    const { pagamentos } = preservarPagamentosConfirmados(cloud, incoming, { auditConfirmacao: audit });
    assert.equal(pagamentos[0]!.reciboHtml, "<p>recibo</p>");
    assert.equal(pagamentos[0]!.assinaturaCooperado, "data:image/png;base64,x");
  });

  await test("9 — fetch audit em lote: uma query .in() para todos os IDs", async () => {
    let inCalls = 0;
    let inValues: string[] = [];
    const mockSupabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in(_col: string, values: string[]) {
            inCalls += 1;
            inValues = values;
            return this;
          },
          order() {
            return Promise.resolve({
              data: inValues.map((id) => ({
                entity_id: id,
                action: "aprovar",
                summary: "Cooperado confirmou pagamento e assinou recibo (API).",
                occurred_at: "2026-09-21T22:51:19.306Z",
              })),
              error: null,
            });
          },
        };
      },
    } as unknown as SupabaseClient;

    const map = await fetchPagamentoConfirmacaoAuditEvidenceBatch(mockSupabase, "62351750000165", [
      "pg_x",
      "pg_y",
    ]);
    assert.equal(inCalls, 1);
    assert.deepEqual(inValues.sort(), ["pg_x", "pg_y"]);
    assert.equal(map.size, 2);
  });

  await test("10 — ComAudit async usa audit e não altera pg sem evidência", async () => {
    const mockSupabase = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    const slice = {
      pagamentosCooperado: [pagamento("pg_z", "aguardando_confirmacao")],
    };
    const out = await aplicarPreservacaoPagamentosConfirmadosNoOperacionalComAudit(
      mockSupabase,
      "62351750000165",
      slice,
      slice
    );
    assert.equal(out.payload.pagamentosCooperado[0]!.status, "aguardando_confirmacao");
  });

  console.log(`\n${passed} testes OK (H8.9.106 preservação monotônica + audit).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
