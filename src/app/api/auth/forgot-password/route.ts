import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authRateLimited,
  authUnavailable,
  clientIp,
  ensureAuthInfrastructure,
} from "@/lib/security/authRoutes";
import { getAppBaseUrl } from "@/lib/security/appUrl";
import { rateLimitPasswordReset } from "@/lib/security/rateLimit";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import { createPasswordResetToken } from "@/lib/supabase/passwordResetTokens";
import { isPasswordResetTableReady } from "@/lib/supabase/passwordResetSchema";
import { findAppUserByEmail, isAppUsersTableReady, logSecurityEvent } from "@/lib/supabase/usersAuth";

const GENERIC_OK = {
  ok: true,
  message:
    "Se o e-mail estiver cadastrado como cooperado, você receberá um link para redefinir a senha.",
};

export async function POST(request: Request) {
  const blocked = ensureAuthInfrastructure(request);
  if (blocked) return blocked;

  if (!rateLimitPasswordReset(request)) return authRateLimited();

  const body = await request.json().catch(() => null);
  const email = normalizeAuthEmail(String(body?.email ?? ""));

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin()!;
  if (!(await isAppUsersTableReady(supabase))) {
    return authUnavailable();
  }
  if (!(await isPasswordResetTableReady(supabase))) {
    return NextResponse.json(
      {
        error: "Recuperação de senha indisponível. Execute APPLY_PASSWORD_RESET.sql no Supabase.",
        code: "PASSWORD_RESET_TABLE_MISSING",
      },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  const user = await findAppUserByEmail(supabase, email);

  if (user?.active && user.role === "cooperado") {
    try {
      const token = await createPasswordResetToken(supabase, user.id, ip);
      const resetUrl = `${getAppBaseUrl(request)}/redefinir-senha?token=${encodeURIComponent(token)}`;
      const sent = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });

      if (!sent.ok) {
        console.error("[forgot-password] email failed:", sent.error);
      } else {
        await logSecurityEvent(supabase, {
          action: "auth.forgot_password.request",
          userId: user.id,
          userEmail: user.email,
          cooperativaCnpj: user.cooperativa_cnpj ?? undefined,
          ip,
          metadata: sent.dev ? { devMode: true } : undefined,
        });
      }
    } catch (err) {
      console.error("[forgot-password]", err);
    }
  } else {
    await logSecurityEvent(supabase, {
      action: "auth.forgot_password.ignored",
      userEmail: email,
      ip,
      metadata: { reason: user ? `role_${user.role}` : "not_found" },
    });
  }

  return NextResponse.json(GENERIC_OK);
}
