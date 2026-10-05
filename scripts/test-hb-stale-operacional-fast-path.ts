/**
 * Fast-path HB stale guard — fingerprint igual → sem load de notas.
 * npx tsx scripts/test-hb-stale-operacional-fast-path.ts
 */
import assert from "node:assert/strict";
import {
  hbOperacionalCreditBaseFingerprint,
  detectMaterialAuthoritativeCreditBaseChange,
} from "../src/modules/hb-credit/engine/operationalAuthoritativeCreditBaseChange";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";

const base: OperacionalSyncPayload = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  pagamentosCooperado: [{ id: "p1", cooperadoId: "c1", valor: 10, status: "confirmado" } as never],
  fichaCorrida: [{ id: "f1", cooperadoId: "c1", valor: 10, status: "pendente" } as never],
  mensalidades: [],
  descontos: [],
  arquivosMensais: [],
  comunicados: [],
  config: { descontoPadraoCooperativa: 5 },
};

const onlyUpdatedAt: OperacionalSyncPayload = {
  ...base,
  updatedAt: "2026-10-05T00:00:00.000Z",
  mensalidades: [{ id: "m1" } as never],
};

assert.equal(
  hbOperacionalCreditBaseFingerprint(base),
  hbOperacionalCreditBaseFingerprint(onlyUpdatedAt),
  "fingerprint ignora mensalidades/updatedAt"
);

const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { id: "coop-x" } }),
      }),
    }),
  }),
  storage: {
    listBuckets: async () => ({ data: [] }),
    from: () => ({
      download: async () => ({ data: null, error: { message: "skip" } }),
    }),
  },
} as never;

let loadCalled = false;
const orig = console.error;
console.error = (...args: unknown[]) => {
  if (String(args[0]).includes("loadAuthoritativeContext")) loadCalled = true;
};

async function main() {
  const result = await detectMaterialAuthoritativeCreditBaseChange(supabase, "62351750000165", onlyUpdatedAt, {
    existingOperacional: base,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.material, false, "fast-path material false");
  }
  console.log("test-hb-stale-operacional-fast-path: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
