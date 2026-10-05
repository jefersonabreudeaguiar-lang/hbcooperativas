/**
 * P0 cooperado entrega — fila publicação local + coordinator offline.
 * npx tsx scripts/test-pending-entrega-publish-p0.ts
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

const publish = read("src/services/pendingEntregaPublishService.ts");
const coord = read("src/services/cooperadoDeliveryQueueCoordinator.ts");
const notas = read("src/app/(app)/notas-pedido/NotasPedidoContent.tsx");
const provider = read("src/components/sync/CooperativaSyncProvider.tsx");

assert(publish.includes("coopeagriplla_pending_entrega_publish"), "storage key dedicada");
assert(publish.includes("finalizeNotaEntregaNaNuvem"), "reconcilia via finalize idempotente");
assert(publish.includes("unqueuePendingEntregaPublish"), "desenfileira após persist");
assert(publish.includes("MAX_ATTEMPTS"), "limite tentativas fila publish");

assert(coord.includes("COOPERADO_DELIVERY_QUEUE_FLUSH_EVENT"), "evento UI flush");
assert(coord.includes("syncOfflineDeliveryImages"), "mantém flush fotos offline");
assert(coord.includes("reconcilePendingEntregaPublish"), "reconcilia publish na manutenção");
assert(coord.includes('addEventListener("online"'), "online cooperado sobe fila");

assert(notas.includes("queuePendingEntregaPublish"), "anexar enfileira publish pendente");
assert(notas.includes("fotosOfflineFilaCount"), "indicador fila offline");
assert(notas.includes("publicacaoLocalPendente"), "indicador publish local");
assert(!notas.includes("Entrega já está na nuvem — aguarde a sincronização ou toque Enviar de novo"), "remove erro bloqueante pós-nuvem");

assert(provider.includes("runCooperadoDeliveryQueueMaintenance"), "sync provider mantém filas");
assert(provider.includes("ensureCooperadoDeliveryQueueOnlineListener"), "listener global cooperado");

console.log("test-pending-entrega-publish-p0.ts done.");
