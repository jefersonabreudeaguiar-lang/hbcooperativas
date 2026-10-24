/**
 * Comunicado mercado NF — aceite na nuvem (não repetir a cada login).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? __dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

assert.match(read("src/app/api/credit/mercado/route.ts"), /needsMercadoNfAvisoAck/);
assert.match(read("src/app/api/credit/mercado/route.ts"), /accept_nf_aviso/);
assert.match(read("src/lib/supabase/contaCoopStorage.ts"), /PARTNER_NF_AVISO_ACKED/);
assert.match(read("src/lib/supabase/contaCoopStorage.ts"), /partner_nf_aviso_ack_version/);
assert.match(read("src/components/hb-credit/MercadoHbCreditNfDispensadaAviso.tsx"), /acceptMercadoNfAvisoComunicado/);

console.log("OK: mercado NF aviso ack contrato");
