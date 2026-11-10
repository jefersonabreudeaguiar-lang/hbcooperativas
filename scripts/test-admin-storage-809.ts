import assert from "node:assert/strict";
import type { AppData } from "../src/types";
import { measureBrowserStorageLimits } from "../src/services/platformAdminService";

const data = { cooperativas: [], cooperados: [], users: [], notasPedido: [], mensalidades: [], auditLog: [] } as unknown as AppData;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    get localStorage() {
      throw new DOMException("Storage disabled", "SecurityError");
    },
  },
});
try {
  const snapshot = measureBrowserStorageLimits(data);
  assert.equal(snapshot.status, "atencao");
  assert.match(snapshot.statusLabel, /não permitiu medir/);
} finally {
  Reflect.deleteProperty(globalThis, "window");
}
