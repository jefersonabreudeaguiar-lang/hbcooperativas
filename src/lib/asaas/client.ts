import type { AsaasConfig } from "@/lib/asaas/config";
import type {
  AsaasCustomer,
  AsaasCustomerInput,
  AsaasPayment,
  AsaasPaymentInput,
  AsaasPixQrCode,
} from "@/lib/asaas/types";

const ASAAS_USER_AGENT = "HB-Cooperativas/1.0";

function formatAsaasHttpError(status: number, msg: string, config: AsaasConfig): string {
  if (status !== 401) return msg;
  const envHint = config.sandbox ? "sandbox (api-sandbox.asaas.com)" : "produção (api.asaas.com)";
  const keyOk = config.apiKey.startsWith("$aact_");
  const prefix = keyOk
    ? `Chave ou ambiente Asaas inválido (${envHint}).`
    : `ASAAS_API_KEY sem o prefixo "$" (use aspas no .env: ASAAS_API_KEY="$aact_prod_..."). Ambiente: ${envHint}.`;
  if (msg && !msg.startsWith("Erro Asaas HTTP")) {
    return `${prefix} ${msg}`;
  }
  return `${prefix} Verifique ASAAS_API_KEY e se ASAAS_SANDBOX/ASAAS_API_URL correspondem à chave.`;
}

async function asaasRequest<T>(
  config: AsaasConfig,
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      "User-Agent": ASAAS_USER_AGENT,
      access_token: config.apiKey,
    },
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errObj = json as { errors?: Array<{ description?: string }>; message?: string } | null;
    const rawMsg =
      errObj?.errors?.map((e) => e.description).filter(Boolean).join("; ") ||
      errObj?.message ||
      text ||
      `Erro Asaas HTTP ${res.status}`;
    const msg = formatAsaasHttpError(res.status, rawMsg, config);
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: json as T };
}

export async function createAsaasCustomer(
  config: AsaasConfig,
  input: AsaasCustomerInput
): Promise<{ ok: true; customer: AsaasCustomer } | { ok: false; error: string }> {
  const result = await asaasRequest<AsaasCustomer>(config, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 120),
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ""),
      email: input.email,
      phone: input.phone,
      externalReference: input.externalReference,
      notificationDisabled: true,
    }),
  });
  if (!result.ok) return result;
  return { ok: true, customer: result.data };
}

export async function createAsaasPixPayment(
  config: AsaasConfig,
  input: AsaasPaymentInput
): Promise<{ ok: true; payment: AsaasPayment } | { ok: false; error: string }> {
  const result = await asaasRequest<AsaasPayment>(config, "/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!result.ok) return result;
  return { ok: true, payment: result.data };
}

export async function getAsaasPixQrCode(
  config: AsaasConfig,
  paymentId: string
): Promise<{ ok: true; pix: AsaasPixQrCode } | { ok: false; error: string }> {
  const result = await asaasRequest<AsaasPixQrCode>(config, `/payments/${paymentId}/pixQrCode`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, pix: result.data };
}

export async function deleteAsaasPayment(
  config: AsaasConfig,
  paymentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await asaasRequest<AsaasPayment>(config, `/payments/${paymentId}`, {
    method: "DELETE",
  });
  if (!result.ok) return result;
  return { ok: true };
}

export async function getAsaasPayment(
  config: AsaasConfig,
  paymentId: string
): Promise<{ ok: true; payment: AsaasPayment } | { ok: false; error: string }> {
  const result = await asaasRequest<AsaasPayment>(config, `/payments/${paymentId}`, {
    method: "GET",
  });
  if (!result.ok) return result;
  return { ok: true, payment: result.data };
}

/** Teste leve de autenticação (admin) — não expõe a chave. */
export async function probeAsaasApiConnection(
  config: AsaasConfig
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const result = await asaasRequest<unknown>(config, "/customers?limit=1", { method: "GET" });
  if (result.ok) return { ok: true };
  return { ok: false, status: result.status, error: result.error };
}
