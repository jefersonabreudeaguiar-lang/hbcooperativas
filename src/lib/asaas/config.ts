export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  webhookToken: string | null;
  sandbox: boolean;
}

function detectAsaasSandbox(apiKey: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.ASAAS_SANDBOX?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") return true;
  if (explicit === "false" || explicit === "0" || explicit === "no") return false;
  if (apiKey.includes("_hmlg_") || apiKey.includes("_sandbox")) return true;
  if (apiKey.includes("_prod_")) return false;
  return false;
}

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY?.trim());
}

export function getAsaasConfig(): AsaasConfig | null {
  const apiKey = process.env.ASAAS_API_KEY?.trim();
  if (!apiKey) return null;

  const sandbox = detectAsaasSandbox(apiKey);
  const baseUrl =
    process.env.ASAAS_API_URL?.trim() ||
    (sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3");

  return {
    apiKey,
    baseUrl,
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() || null,
    sandbox,
  };
}

export function getAsaasSetupInfo(): {
  configured: boolean;
  sandbox: boolean;
  webhookUrl: string;
  webhookTokenConfigured: boolean;
} {
  const config = getAsaasConfig();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return {
    configured: Boolean(config),
    sandbox: config?.sandbox ?? false,
    webhookUrl: appUrl ? `${appUrl}/api/webhooks/asaas` : "/api/webhooks/asaas",
    webhookTokenConfigured: Boolean(config?.webhookToken),
  };
}
