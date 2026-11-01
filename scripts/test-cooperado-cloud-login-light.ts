import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { buildInlineCooperadoAppDataWarmScript } from "../src/lib/performance/cooperadoAppDataInlineWarm";

async function main() {
  const profile = {
    id: "login-test", email: "cooperado@example.test", name: "Cooperado",
    role: "cooperado", cooperadoId: "c-test", cooperativaId: "coop-test",
    cooperativaCnpj: "12345678000190",
  };
  let operationalReads = 0;
  let operationalWrites = 0;
  const values = new Map<string, string>();
  const frames: Array<() => void> = [];
  const idle: Array<() => void> = [];
  const storage = {
    getItem(key: string) {
      if (key.startsWith("coopeagriplla_data")) operationalReads++;
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (key.startsWith("coopeagriplla_data")) operationalWrites++;
      values.set(key, value);
    },
    removeItem(key: string) { values.delete(key); },
  };
  Object.assign(globalThis, {
    window: {
      addEventListener() {},
      matchMedia() { return { matches: false }; },
      requestAnimationFrame(fn: () => void) { frames.push(fn); },
    },
    localStorage: storage,
    sessionStorage: { getItem() { return null; }, removeItem() {}, setItem() {} },
    requestAnimationFrame() { return 1; },
    requestIdleCallback(fn: () => void) { idle.push(fn); return 1; },
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(url, "/api/auth/login");
      assert.equal(options.credentials, "include");
      assert.equal(options.method, "POST");
      return { ok: true, status: 200, json: async () => ({ user: profile }) };
    },
  });
  const { login, preloadAppData } = await import("../src/services/dataStore");
  const user = await login(profile.email, "test-password");
  assert.equal(user?.id, profile.id);
  assert.equal(user?.cooperadoId, profile.cooperadoId);
  assert.equal(operationalReads, 0, "autenticação não deve ler o operacional nem fotos");
  assert.equal(operationalWrites, 0, "autenticação não deve regravar o operacional");
  const session = JSON.parse(values.get("coopeagriplla_session")!);
  assert.equal(session.role, "cooperado");
  assert.equal(session.cooperativaCnpj, profile.cooperativaCnpj);
  assert.equal("password" in session, false);
  preloadAppData({ eager: true });
  assert.equal(operationalReads, 0, "eager cooperado aguarda pintura, inclusive no desktop");
  assert.equal(frames.length, 1);
  frames.shift()!();
  assert.equal(frames.length, 1);
  frames.shift()!();
  assert.equal(idle.length, 1);
  assert.equal(operationalReads, 0, "operacional continua fora dos dois primeiros frames");

  for (const pathname of ["/login", "/dashboard"]) {
    let reads = 0;
    runInNewContext(buildInlineCooperadoAppDataWarmScript(), {
      window: { location: { pathname } },
      localStorage: { getItem(key: string) {
        if (key === "coopeagriplla_session") return JSON.stringify(profile);
        if (key === "coopeagriplla_data") reads++;
        return null;
      } },
    });
    assert.equal(reads, 0, `${pathname}: head não bloqueia pintura lendo operacional`);
  }
  console.log("OK: login cooperado validado no servidor, sem leitura/escrita operacional ou senha na sessão; head leve");
}
void main();
