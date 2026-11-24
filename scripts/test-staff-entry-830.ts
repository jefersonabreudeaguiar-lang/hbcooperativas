import assert from "node:assert/strict";
import { fetchNotasFromStorage } from "../src/lib/supabase/notasStorage";

async function main() {
  let downloads = 0, lists = 0, listError = false, failDownload = false;
  let changed = false, omitVersion = false, count = 459;
  const client = { storage: { from: () => ({
    list: async () => {
      lists++;
      return { error: listError ? { message: "offline" } : null, data: Array.from({ length: count }, (_, i) => ({
        name: `${i}.json`, id: `object-${i}`, updated_at: changed && i === 0 ? "2026-11-23T11:00:00Z" : "2026-11-23T10:00:00Z",
        metadata: omitVersion ? {} : { eTag: changed && i === 0 ? "changed" : "original" },
      })) };
    },
    download: async (path: string) => {
      downloads++;
      return { error: failDownload ? { message: "offline" } : null, data: new Blob([JSON.stringify({
        id: path.split("/").pop()!.replace(".json", ""), status: "pago", updatedAt: "2026-11-23", valor: changed ? 20 : 10,
      })]) };
    },
  }) } } as never;
  const cnpj = "62351750000165";
  const first = await fetchNotasFromStorage(client, cnpj, true);
  assert.equal(first.length, 459); assert.equal(downloads, 459);
  first[0].status = "rascunho";
  const second = await fetchNotasFromStorage(client, cnpj, true);
  assert.equal(downloads, 459, "459 versões confirmadas dispensam 459 downloads repetidos");
  assert.equal(lists, 2, "cada consulta confere a listagem atual na nuvem");
  assert.ok(second.every((n) => n.status === "pago"), "o consumidor não altera a cópia protegida");
  changed = true;
  await fetchNotasFromStorage(client, cnpj, true);
  assert.equal(downloads, 460, "objeto alterado é baixado novamente");
  count = 458;
  assert.equal((await fetchNotasFromStorage(client, cnpj, true)).length, 458, "arquivo removido não reaparece");
  listError = true;
  await assert.rejects(fetchNotasFromStorage(client, cnpj, true), /listar/);
  listError = false; count = 1; omitVersion = true;
  await fetchNotasFromStorage(client, cnpj, true);
  await fetchNotasFromStorage(client, cnpj, true);
  assert.equal(downloads, 462, "sem versão verificável não há reaproveitamento");
  omitVersion = false;
  await fetchNotasFromStorage(client, "11111111000111", true);
  assert.equal(downloads, 463, "CNPJs não compartilham objetos");
  failDownload = true;
  await assert.rejects(fetchNotasFromStorage(client, "22222222000122", true), /ler/);
  failDownload = false;
  assert.equal((await fetchNotasFromStorage(client, "22222222000122", true)).length, 1, "falha não entra na memória de versões");
  console.log("PASS: 459 downloads evitados após listagem atual, atualização, exclusão, erro, cópia imutável, isolamento e ausência de eTag.");
}
void main();
