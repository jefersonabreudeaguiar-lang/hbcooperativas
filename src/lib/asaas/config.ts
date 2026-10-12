import { normalizeAppBaseUrl } from "@/lib/security/secureOriginUrl";

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  webhookToken: string | null;
  sandbox: boolean;
}

const ASAAS_PRODUCTION_BASE = "https://api.asaas.com/v3";
const ASAAS_SANDBOX_BASE = "https://api-sandbox.asaas.com/v3";

/** Normaliza ASAAS_API_KEY (trim, aspas, $ perdido em .env sem aspas). */
export function normalizeAsaasApiKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let key = raw.replace(/\r/g, "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (/^aact_(prod|hmlg)_/i.test(key)) {
    key = `$${key}`;
  }
  return key.length > 0 ? key : null;
}

export function getAsaasKeyDiagnostics(config: AsaasConfig | null): {
  keyLength: number;
  keyPreview: string | null;
  baseUrl: string | null;
  placeholderSuspect: boolean;
  tooShort: boolean;
} {
  if (!config) {
    return { keyLength: 0, keyPreview: null, baseUrl: null, placeholderSuspect: false, tooShort: true };
  }
  const key = config.apiKey;
  const lower = key.toLowerCase();
  const placeholderSuspect =
    /sua_chave|placeholder|exemplo|your_api|xxx|teste123/i.test(lower) || lower === "$aact_prod_sua_chave";
  return {
    keyLength: key.length,
    keyPreview: key.length >= 12 ? `${key.slice(0, 16)}…` : key,
    baseUrl: config.baseUrl,
    placeholderSuspect,
    tooShort: key.length < 40,
  };
}

function detectAsaasSandbox(apiKey: string, env: NodeJS.ProcessEnv = process.env): boolean {
  // Prefixo da chave prevalece sobre ASAAS_SANDBOX (evita prod + sandbox URL → HTTP 401).
  if (apiKey.includes("_hmlg_") || apiKey.includes("_sandbox")) return true;
  if (apiKey.includes("_prod_")) return false;

  const explicit = env.ASAAS_SANDBOX?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") return true;
  if (explicit === "false" || explicit === "0" || explicit === "no") return false;
  return false;
}

function normalizeAsaasBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function urlLooksSandbox(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes("sandbox") || lower.includes("hmlg");
}

function resolveAsaasBaseUrl(sandbox: boolean, env: NodeJS.ProcessEnv = process.env): string {
  const defaultUrl = sandbox ? ASAAS_SANDBOX_BASE : ASAAS_PRODUCTION_BASE;
  const custom = env.ASAAS_API_URL?.trim();
  if (!custom) return defaultUrl;

  const normalized = normalizeAsaasBaseUrl(custom);
  const customSandbox = urlLooksSandbox(normalized);
  if (customSandbox !== sandbox) {
    return defaultUrl;
  }
  return normalized;
}

export function isAsaasConfigured(): boolean {
  return Boolean(normalizeAsaasApiKey(process.env.ASAAS_API_KEY));
}

export function getAsaasConfig(): AsaasConfig | null {
  const apiKey = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);
  if (!apiKey) return null;

  const sandbox = detectAsaasSandbox(apiKey);
  const baseUrl = resolveAsaasBaseUrl(sandbox);

  return {
    apiKey,
    baseUrl,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
    sandbox,
  };
}

export function getAsaasKeyKind(config: AsaasConfig | null): "prod" | "hmlg" | "unknown" | null {
  if (!config) return null;
  if (config.apiKey.includes("_prod_")) return "prod";
  if (config.apiKey.includes("_hmlg_")) return "hmlg";
  return "unknown";
}

export function getAsaasSetupInfo(): {
  configured: boolean;
  sandbox: boolean;
  apiKeyFormatOk: boolean;
  apiKeyKind: "prod" | "hmlg" | "unknown" | null;
  webhookUrl: string;
  webhookTokenConfigured: boolean;
} {
  const config = getAsaasConfig();
  const appUrl = normalizeAppBaseUrl((process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, ""));
  return {
    configured: Boolean(config),
    sandbox: config?.sandbox ?? false,
    apiKeyFormatOk: Boolean(config?.apiKey.startsWith("$aact_")),
    apiKeyKind: getAsaasKeyKind(config),
    webhookUrl: appUrl ? `${appUrl}/api/webhooks/asaas` : "/api/webhooks/asaas",
    webhookTokenConfigured: Boolean(config?.webhookToken),
  };
}
