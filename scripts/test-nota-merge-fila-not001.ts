/**
 * NOT-001 — merge de notas (tabela/storage/nuvem) preserva itens quando meta recente veio vazia.
 */
import assert from "node:assert/strict";
import type { NotaPedido } from "@/types";
import { mergeNotaComFotos } from "@/utils/fotoEntrega";
import {
  isNotaRelancamentoPayload,
  notaElegivelParaFilaConferenciaResponsavel,
} from "@/utils/notaStatus";
import { mergeNotasSources } from "@/lib/supabase/notasStorage";

function baseNota(overrides: Partial<NotaPedido> = {}): NotaPedido {
  return {
    id: "n_test",
    cooperadoId: "c1",
    cooperativaId: "coop1",
    mesReferencia: "2026-09",
    numeroNota: "100",
    instituicaoId: "i1",
    status: "aguardando_conferencia",
    itens: [{ produtoId: "p1", quantidade: 10, valorUnitario: 5, valorTotal: 50 }],
    valorBruto: 50,
    valorDesconto: 0,
    valorLiquido: 50,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  } as NotaPedido;
}

// 1) Nota normal — merge preserva itens
{
  const local = baseNota();
  const cloud = baseNota({
    updatedAt: "2026-09-02T12:00:00.000Z",
    itens: [],
    valorBruto: 0,
    valorLiquido: 0,
    fotoNaNuvem: true,
    fotosEnviadasCount: 1,
  });
  const m = mergeNotaComFotos(local, cloud);
  assert.equal(m.itens?.length, 1);
  assert.equal(m.valorLiquido, 50);
  assert.equal(m.fotoNaNuvem, true);
}

// 2) Múltiplas fotos — une fotos e mantém itens
{
  const a = baseNota({ fotosPedido: ["a1"], fotosEnviadasCount: 1 });
  const b = baseNota({
    updatedAt: "2026-09-03T12:00:00.000Z",
    itens: [],
    valorLiquido: 0,
    fotosPedido: ["b1", "b2"],
    fotosEnviadasCount: 2,
  });
  const m = mergeNotaComFotos(a, b);
  assert.ok((m.fotosEnviadasCount ?? 0) >= 2);
  assert.equal(m.valorLiquido, 50);
}

// 3) Reenvio pós-rejeição — payload completo prevalece
{
  const reenvio = baseNota({
    status: "aguardando_conferencia",
    updatedAt: "2026-09-04T12:00:00.000Z",
    itens: [{ produtoId: "p2", quantidade: 3, valorUnitario: 10, valorTotal: 30 }],
    valorLiquido: 30,
  });
  const stale = baseNota({
    status: "rejeitada",
    updatedAt: "2026-09-01T10:00:00.000Z",
    itens: [],
    valorLiquido: 0,
  });
  const m = mergeNotaComFotos(stale, reenvio);
  assert.equal(m.status, "aguardando_conferencia");
  assert.equal(m.valorLiquido, 30);
}

// 4) Relançamento intencional — mantém payload zerado
{
  const conferida = baseNota({
    status: "conferida",
    updatedAt: "2026-09-01T10:00:00.000Z",
    conferidaPor: "Resp",
    valorLiquido: 50,
  });
  const relanc = baseNota({
    status: "aguardando_conferencia",
    updatedAt: "2026-09-05T12:00:00.000Z",
    itens: [],
    valorBruto: 0,
    valorLiquido: 0,
    conferidaPor: undefined,
  });
  assert.ok(isNotaRelancamentoPayload(relanc));
  const m = mergeNotaComFotos(conferida, relanc);
  assert.equal(m.status, "aguardando_conferencia");
  assert.equal(m.valorLiquido, 0);
  assert.equal((m.itens ?? []).length, 0);
}

// 5) mergeNotasSources — parcial vazio não destrói tabela completa
{
  const table = [baseNota({ id: "n1" })];
  const storage = [
    baseNota({
      id: "n1",
      updatedAt: "2026-09-06T12:00:00.000Z",
      itens: [],
      valorLiquido: 0,
      fotoNaNuvem: true,
    }),
  ];
  const merged = mergeNotasSources(table, storage);
  assert.equal(merged[0]?.valorLiquido, 50);
}

// 6) Nota incompleta sem foto — ainda elegível por status (rastreável); merge não inventa valor
{
  const vazia = baseNota({ itens: [], valorLiquido: 0, valorBruto: 0, fotoNaNuvem: false });
  assert.equal(notaElegivelParaFilaConferenciaResponsavel(vazia), true);
}

// 7) merge: completo + vazio → completo vence
{
  const completo = baseNota({ updatedAt: "2026-09-01T10:00:00.000Z" });
  const vazio = baseNota({
    updatedAt: "2026-09-10T10:00:00.000Z",
    itens: [],
    valorLiquido: 0,
    fotosMeta: [{ status: "uploaded" as const, storagePath: "x" }],
  });
  const m = mergeNotaComFotos(completo, vazio);
  assert.equal(m.valorLiquido, 50);
  assert.ok(m.fotosMeta?.length);
}

console.log("OK — test-nota-merge-fila-not001");
