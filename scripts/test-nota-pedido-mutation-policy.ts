import assert from "node:assert/strict";
import { podeCooperadoEnviarNota } from "../src/lib/security/notaPedidoMutationPolicy.ts";

const pending = { cooperadoId: "m1", status: "aguardando_conferencia" as const };

assert.equal(podeCooperadoEnviarNota("m1", pending), true, "permite publicar a própria nota pendente");
assert.equal(podeCooperadoEnviarNota("m2", pending), false, "impede publicar nota de outro cooperado");
assert.equal(podeCooperadoEnviarNota(undefined, pending), false, "exige cooperado autenticado");
assert.equal(
  podeCooperadoEnviarNota("m1", { ...pending, status: "conferida" }),
  false,
  "cooperado não define nota como conferida"
);
assert.equal(
  podeCooperadoEnviarNota("m1", pending, { cooperadoId: "m1", status: "aguardando_conferencia" }),
  true,
  "permite atualizar própria entrega aguardando conferência"
);
assert.equal(
  podeCooperadoEnviarNota("m1", pending, { cooperadoId: "m1", status: "rejeitada" }),
  true,
  "permite reenviar própria entrega rejeitada"
);
assert.equal(
  podeCooperadoEnviarNota("m1", pending, { cooperadoId: "m1", status: "conferida" }),
  false,
  "impede alterar entrega já conferida"
);
assert.equal(
  podeCooperadoEnviarNota("m1", pending, { cooperadoId: "m2", status: "aguardando_conferencia" }),
  false,
  "impede atualizar entrega pertencente a outro cooperado"
);

console.log("OK test-nota-pedido-mutation-policy (7 cenários)");
