import assert from "node:assert/strict";
import { enviarImagensResponsavel, type EnvioImagensResponsavel } from "../src/services/responsavelImagensEntregaService";
import type { NotaPedido } from "../src/types";

async function main() {
  const envio: EnvioImagensResponsavel = { enviadas: 0, nota: { id: "stable", cooperadoId: "owner", status: "rascunho" } as NotaPedido };
  const uploads: number[] = [];
  let published = 0;
  await assert.rejects(enviarImagensResponsavel(envio, 3, async (i, nota) => {
    assert.equal(nota.status, "rascunho"); assert.equal(nota.cooperadoId, "owner");
    uploads.push(i); if (i === 1) throw new Error("offline");
  }, async () => { published++; }, () => {}), /offline/);
  assert.equal(published, 0, "falha de imagem não publica entrega parcial");
  assert.equal(envio.enviadas, 1);
  await assert.rejects(enviarImagensResponsavel(envio, 3, async i => { uploads.push(i); }, async nota => {
    published++; assert.equal(nota.status, "aguardando_conferencia"); assert.equal(nota.fotosEnviadasCount, 3);
    throw new Error("publicação falhou");
  }, () => {}), /publicação falhou/);
  assert.deepEqual(uploads, [0, 1, 1, 2], "retomada não reenvia imagens confirmadas");
  const final = await enviarImagensResponsavel(envio, 3, async () => { assert.fail("não reenvia após falha de publicação"); }, async nota => {
    published++; assert.equal(nota.id, "stable");
  }, () => {});
  assert.equal(final.status, "aguardando_conferencia");
  assert.equal(final.fotoNaNuvem, true);
  assert.equal(envio.nota.status, "rascunho", "estado original só avança após publicação confirmada");
  assert.equal(published, 2);
  await assert.rejects(enviarImagensResponsavel(envio, 0, async () => {}, async () => {}, () => {}), /pelo menos/);
  console.log("OK: imagens → rascunho → fila; falha parcial e retry sem duplicação; identidade preservada");
}
void main();
