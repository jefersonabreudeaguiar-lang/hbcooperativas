/**
 * Validação do pipeline de imagens (Node — sem canvas/DOM).
 * Compressão real roda no browser; aqui validamos regras e migração legado.
 * npm run test:image-pipeline
 */
import type { NotaPedido } from "../src/types";
import {
  validateImageFile,
  estimateMemoryCost,
  migrateLegacyBase64Images,
  MAX_IMAGE_BYTES,
  WARN_IMAGE_BYTES,
} from "../src/services/imagePipelineService";

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    return;
  }
  passed += 1;
}

function run() {
  console.log("=== test-image-pipeline (Node) ===\n");

  const jpeg = new File([new Uint8Array(1024)], "foto.jpg", { type: "image/jpeg" });
  const v = validateImageFile(jpeg);
  assert("accept jpeg", v.ok === true);

  const badMime = new File([new Uint8Array(100)], "x.gif", { type: "image/gif" });
  assert("reject gif", validateImageFile(badMime).ok === false);

  const huge = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.jpg", { type: "image/jpeg" });
  const vHuge = validateImageFile(huge);
  assert("reject >20MB", vHuge.ok === false);
  assert("reject message friendly", (vHuge.error ?? "").includes("20 MB"));

  const warn = new File([new Uint8Array(WARN_IMAGE_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
  const vWarn = validateImageFile(warn);
  assert("warn large file", vWarn.ok === true && !!vWarn.warning);

  const cost = estimateMemoryCost(warn);
  assert("estimateMemoryCost > file.size", cost > warn.size);

  const nota: NotaPedido = {
    id: "n-1",
    cooperativaId: "coop-1",
    cooperadoId: "c-1",
    instanciaId: "i-1",
    fotosPedido: ["data:image/jpeg;base64,abc123"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const migrated = migrateLegacyBase64Images(nota);
  assert("migrate legacy base64", (migrated.fotosMeta?.length ?? 0) === 1);
  assert("legacy status local_pending", migrated.fotosMeta?.[0]?.status === "local_pending");

  const alreadyMeta = migrateLegacyBase64Images({ ...migrated, fotosMeta: migrated.fotosMeta });
  assert("skip migrate when fotosMeta exists", alreadyMeta.fotosMeta?.length === 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("OK — regras de validação e migração legado.");
}

run();
