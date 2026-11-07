import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { marcarPublicacaoPendente, confirmarPublicacaoPendente } from "../src/services/comunicadoPublicacaoPendente";

let data = marcarPublicacaoPendente({} as AppData, "coop-a", "tentativa-1", "recado-a");
data = JSON.parse(JSON.stringify(data));
assert.deepEqual(data.comunicadosPublicacaoPendente?.["coop-a"], { token: "tentativa-1", ids: ["recado-a"] });
data = marcarPublicacaoPendente(data, "coop-b", "outra-coop", "recado-b");
data = marcarPublicacaoPendente(data, "coop-a", "tentativa-2", "recado-novo");
assert.equal(confirmarPublicacaoPendente(data, "coop-a", "tentativa-1"), data, "resposta antiga não apaga edição feita durante o envio");
data = confirmarPublicacaoPendente(data, "coop-a", "tentativa-2");
assert.equal(data.comunicadosPublicacaoPendente?.["coop-a"], undefined);
assert.deepEqual(data.comunicadosPublicacaoPendente?.["coop-b"]?.ids, ["recado-b"]);
data = marcarPublicacaoPendente(data, "coop-a", "exclusao");
assert.deepEqual(data.comunicadosPublicacaoPendente?.["coop-a"]?.ids, [], "exclusão também mantém reenvio pendente");
console.log("PASS: recarga preserva fila; confirmação antiga e outra cooperativa não apagam pendências.");
