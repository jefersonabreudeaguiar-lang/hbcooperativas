import type { AsaasConfig } from "@/lib/asaas/config";
import type {
  AsaasCustomer,
  AsaasCustomerInput,
  AsaasPayment,
  AsaasPaymentInput,
  AsaasPixQrCode,
} from "@/lib/asaas/types";

async function asaasRequest<T>(
  config: AsaasConfig,
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
      ...(init?.headers ?? {}),
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
    const msg =
      errObj?.errors?.map((e) => e.description).filter(Boolean).join("; ") ||
      errObj?.message ||
      text ||
      `Erro Asaas HTTP ${res.status}`;
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
