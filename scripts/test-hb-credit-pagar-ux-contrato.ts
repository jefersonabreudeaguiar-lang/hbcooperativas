/**
 * Pagamento HB cooperado — comprovante e não bloquear UI no sync local.
 * npm run test:hb-credit-pagar-ux
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const pagar = read("src/app/(app)/minha-conta-coop/pagar/page.tsx");
const api = read("src/services/creditApiService.ts");
const comprovante = read("src/components/hb-credit/HbCreditPaymentComprovante.tsx");
const shareImg = read("src/lib/hb-credit/hbCreditReceiptShareImage.ts");

assert.match(pagar, /HbCreditPaymentComprovante/, "tela de sucesso usa comprovante");
assert.match(pagar, /Confirmando pagamento/, "overlay durante authorize");
assert.match(pagar, /storeHbCreditPaymentReceipt/, "persiste comprovante na sessão");

assert.match(api, /runAuthorizeCreditPaymentLocalRefreshInBackground/, "sync local não bloqueia retorno");
assert.match(api, /void runAuthorizeCreditPaymentLocalRefreshInBackground/, "sync em background");

assert.match(comprovante, /Compartilhar comprovante/, "ação de compartilhar");
assert.match(comprovante, /renderHbCreditReceiptPngBlob/, "compartilha via PNG canvas");
assert.match(shareImg, /renderHbCreditReceiptPngBlob/, "gera PNG sem html2canvas");
assert.ok(!/import\s*\(\s*["']html2canvas["']\s*\)/.test(shareImg), "sem captura DOM html2canvas");
assert.match(shareImg, /files: \[file\]/, "share nativo com arquivo de imagem");

console.log("OK: contrato pagar HB + comprovante");
