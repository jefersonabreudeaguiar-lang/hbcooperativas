import assert from "node:assert/strict";
import {
  cooperadoEnvioFotosEntregaEnabled,
  resolveCooperadoEnvioFotosPublicEnv,
} from "../src/lib/cooperado/cooperadoEnvioFotosEntrega.ts";

assert.equal(resolveCooperadoEnvioFotosPublicEnv(undefined), "0");
assert.equal(resolveCooperadoEnvioFotosPublicEnv("0"), "0");
assert.equal(resolveCooperadoEnvioFotosPublicEnv("1"), "1");

const prevFotos = process.env.NEXT_PUBLIC_COOPERADO_ENVIO_FOTOS_ENTREGA;
const prevV2 = process.env.NEXT_PUBLIC_V2_HB_ONLY;
process.env.NEXT_PUBLIC_COOPERADO_ENVIO_FOTOS_ENTREGA = "0";
process.env.NEXT_PUBLIC_V2_HB_ONLY = "0";
assert.equal(cooperadoEnvioFotosEntregaEnabled(), false);
process.env.NEXT_PUBLIC_COOPERADO_ENVIO_FOTOS_ENTREGA = "1";
assert.equal(cooperadoEnvioFotosEntregaEnabled(), true);
process.env.NEXT_PUBLIC_V2_HB_ONLY = "1";
assert.equal(cooperadoEnvioFotosEntregaEnabled(), false);
if (prevFotos === undefined) delete process.env.NEXT_PUBLIC_COOPERADO_ENVIO_FOTOS_ENTREGA;
else process.env.NEXT_PUBLIC_COOPERADO_ENVIO_FOTOS_ENTREGA = prevFotos;
if (prevV2 === undefined) delete process.env.NEXT_PUBLIC_V2_HB_ONLY;
else process.env.NEXT_PUBLIC_V2_HB_ONLY = prevV2;

console.log("ok: cooperado envio fotos entrega flag");
