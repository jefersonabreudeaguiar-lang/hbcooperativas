import assert from "node:assert/strict";
import { GET } from "../src/app/api/auth/schema-status/route";

async function main() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let reply = () => new Response("[]", { headers: { "content-type": "application/json" } });
  let requests = 0;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /^https:\/\/schema-test\.supabase\.co\//);
    requests += 1;
    return reply();
  };
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await (await GET()).json()).appUsersTableOk, false);
    assert.equal(requests, 0);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://schema-test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key-not-a-real-credential";
    assert.equal((await (await GET()).json()).appUsersTableOk, true);

    for (const code of ["42501", "PGRST301"]) {
      reply = () => new Response(JSON.stringify({ code, message: "internal fixture detail" }), {
        status: 403, headers: { "content-type": "application/json" },
      });
      const response = await GET();
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.appUsersTableOk, false, "Falha de permissão nunca pode indicar autenticação pronta");
      assert.equal(body.code, "APP_USERS_UNAVAILABLE");
      assert.equal(JSON.stringify(body).includes("internal fixture detail"), false);
    }
    reply = () => new Response(JSON.stringify({ code: "PGRST205", message: "app_users missing" }), {
      status: 404, headers: { "content-type": "application/json" },
    });
    assert.equal((await (await GET()).json()).code, "APP_USERS_MISSING");
    console.log("PASS: conexão real simulada; ausência de configuração, sucesso, permissão negada, chave inválida e tabela ausente.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}
void main();
