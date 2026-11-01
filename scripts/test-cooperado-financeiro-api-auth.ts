import assert from "node:assert/strict";
import { signAccessToken } from "../src/lib/security/jwt";
import { GET } from "../src/app/api/cooperado/financeiro/route";

async function main() {
  process.env.AUTH_SECRET = "test-only-financeiro-api-secret-never-production";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
  const url = "http://localhost/api/cooperado/financeiro?cooperadoId=other&cnpj=00000000000000";
  assert.equal((await GET(new Request(url))).status, 401, "sem cookie/JWT não retorna valores");
  assert.equal((await GET(new Request(url, { headers: { Authorization: "Bearer invalid" } }))).status, 401);
  const token = async (role: "cooperado" | "parceiro", cooperadoId?: string, cooperativaCnpj = "12345678000190") => signAccessToken({
    sub: "fixture-user", email: "fixture@example.test", name: "Fixture", role, cooperadoId, cooperativaCnpj,
  });
  assert.equal((await GET(new Request(url, { headers: { Authorization: `Bearer ${await token("parceiro", "fixture-coop")}` } }))).status, 403);
  assert.equal((await GET(new Request(url, { headers: { Authorization: `Bearer ${await token("cooperado")}` } }))).status, 403);
  assert.equal((await GET(new Request(url, { headers: { Authorization: `Bearer ${await token("cooperado", "fixture-coop", "invalid")}` } }))).status, 400);
  console.log("OK: resumo financeiro exige JWT válido, papel cooperado, identidade e CNPJ da sessão");
}
void main();
