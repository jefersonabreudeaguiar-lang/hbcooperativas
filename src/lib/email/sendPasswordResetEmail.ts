import { PLATFORM_NAME } from "@/utils/constants";

export interface SendPasswordResetEmailInput {
  to: string;
  name: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput
): Promise<{ ok: true; dev?: boolean } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || `${PLATFORM_NAME} <onboarding@resend.dev>`;
  const subject = `Recuperação de senha — ${PLATFORM_NAME}`;
  const html = buildPasswordResetHtml(input.name, input.resetUrl);

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[password-reset] RESEND_API_KEY ausente — link de teste:", input.resetUrl);
      return { ok: true, dev: true };
    }
    return { ok: false, error: "Serviço de e-mail não configurado." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[password-reset] Resend error:", res.status, body);
    return { ok: false, error: "Não foi possível enviar o e-mail." };
  }

  return { ok: true };
}

function buildPasswordResetHtml(name: string, resetUrl: string): string {
  const safeName = name.trim() || "Cooperado";
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111827;background:#f9fafb;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#065f46;">${PLATFORM_NAME}</h1>
      <p style="margin:0 0 16px;">Olá, <strong>${escapeHtml(safeName)}</strong>.</p>
      <p style="margin:0 0 16px;">Recebemos um pedido para redefinir a senha da sua conta de cooperado.</p>
      <p style="margin:0 0 24px;">
        <a href="${resetUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">
          Redefinir senha
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">O link expira em 1 hora. Se você não solicitou, ignore este e-mail.</p>
      <p style="margin:0;font-size:12px;color:#9ca3af;word-break:break-all;">${escapeHtml(resetUrl)}</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
