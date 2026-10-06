/**
 * FASE 1.1 — envio cooperado: publicação na nuvem com confirmação SQL.
 * npx tsx scripts/test-cooperado-entrega-fase-1_1.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const cloud = read("src/services/notaPedidoCloudService.ts");
const notas = read("src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx");
const publish = read("src/services/pendingEntregaPublishService.ts");

assert(cloud.includes("confirmNotaEntregaPublicadaNaNuvem"), "confirma meta SQL exportada");
assert(cloud.includes("publicarEntregaCooperadoNaNuvem"), "publicação cooperado exportada");
assert(
  cloud.includes('tableMeta.status !== "rascunho"'),
  "confirmação exige status ≠ rascunho"
);

assert(notas.includes("publicarEntregaCooperadoNaNuvem"), "cooperado usa publicar com confirmação");
assert(notas.includes("confirmNotaEntregaPublicadaNaNuvem"), "cooperado revalida meta antes da UI");
assert(
  !notas.includes("await finalizeNotaEntregaNaNuvem(cnpj, notaFinalLocal"),
  "remove segundo finalize fire-and-forget"
);
assert(notas.includes("setAnexarSucesso(true)"), "sucesso UI permanece após confirmação");
assert(
  notas.indexOf("confirmNotaEntregaPublicadaNaNuvem") < notas.indexOf("setAnexarSucesso(true)"),
  "confirmação nuvem ocorre antes do sucesso na UI"
);

assert(publish.includes("finalizeNotaEntregaNaNuvem"), "fila offline ainda republica idempotente");

console.log("test-cooperado-entrega-fase-1_1.ts done.");
