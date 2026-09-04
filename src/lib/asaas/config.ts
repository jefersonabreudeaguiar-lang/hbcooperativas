export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  webhookToken: string | null;
  sandbox: boolean;
}

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY?.trim());
}

export function getAsaasConfig(): AsaasConfig | null {
  const apiKey = process.env.ASAAS_API_KEY?.trim();
  if (!apiKey) return null;

  const sandbox = process.env.ASAAS_SANDBOX === "true" || apiKey.includes("_sandbox") || apiKey.startsWith("$aact_");
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
