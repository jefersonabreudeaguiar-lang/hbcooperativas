import assert from "node:assert/strict";
import { tokenResponseForUser } from "../src/lib/security/authRoutes";
import { extractSessionTokenFromCookie } from "../src/lib/security/sessionCookie";
import { verifyAccessToken } from "../src/lib/security/jwt";
import type { AppUserRow } from "../src/lib/supabase/usersAuth";
import type { UserRole } from "../src/types";

async function main() {
const original = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "fixture-signing-key-not-a-real-credential-2026";
try {
  for (const role of ["admin", "responsavel", "tesoureiro", "contador", "cooperado", "parceiro"] as UserRole[]) {
    const user = { id: "fixture", email: "fixture@example.invalid", name: "Fixture", role,
      cooperativa_id: "fixture-coop", cooperado_id: role === "cooperado" ? "fixture-member" : null,
      cooperativa_cnpj: "99999999999999", active: true, totp_enabled_at: "2026-11-01T12:00:00Z" } as AppUserRow;
    const response = await tokenResponseForUser(user);
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    const token = extractSessionTokenFromCookie(new Request("https://fixture.invalid", { headers: { cookie } }));
    assert.ok(token);
    const claims = await verifyAccessToken(token);
    assert.ok(claims);
    assert.equal(claims.role, role);
    assert.equal(claims.mfaVerified, false, "Senha sem desafio não pode afirmar segunda etapa verificada");
  }
  console.log("PASS: emissão de sessão em seis perfis com cookie protegido, sem alegar MFA não verificado.");
} finally {
  if (original === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = original;
}
}
void main();
