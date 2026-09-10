import { isDistributedRateLimitConfigured } from "@/lib/security/distributedRateLimit";
import { isStaffMfaEnforced, isStaffMfaFeatureEnabled } from "@/lib/security/staffAccessPolicy";
import { isApiSecurityEnforced } from "@/lib/security/env";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export interface SecurityStackHealth {
  checkedAt: string;
  apiSecurityEnforced: boolean;
  supabaseConfigured: boolean;
  distributedRateLimit: boolean;
  staffMfaFeatureEnabled: boolean;
  staffMfaPolicyEnforced: boolean;
  cronSecretConfigured: boolean;
  reconciliationCoopConfigured: boolean;
  authSecretConfigured: boolean;
  fieldEncryptionConfigured: boolean;
  crons: Array<{ path: string; schedule: string; description: string }>;
  recommendations: string[];
}

export function buildSecurityStackHealth(env: NodeJS.ProcessEnv = process.env): SecurityStackHealth {
  const recommendations: string[] = [];

  if (!env.AUTH_SECRET?.trim()) {
    recommendations.push("Defina AUTH_SECRET em produção.");
  }
  if (!isDistributedRateLimitConfigured(env)) {
    recommendations.push("Configure UPSTASH_REDIS_REST_URL/TOKEN para rate limit distribuído.");
  }
  if (!env.CRON_SECRET?.trim()) {
    recommendations.push("Defina CRON_SECRET para crons de reconciliação e cobrança.");
  }
  if (!env.HB_RECONCILIATION_COOP_CNPJ?.trim() && !env.HB_HOBELISCO_PROBE_COOP_CNPJ?.trim()) {
    recommendations.push("Defina HB_RECONCILIATION_COOP_CNPJ para cron diário de crédito.");
  }
  if (!env.FIELD_ENCRYPTION_KEY?.trim() && isStaffMfaFeatureEnabled()) {
    recommendations.push("Defina FIELD_ENCRYPTION_KEY (32+ chars) para cifrar segredos MFA.");
  }
  if (!recommendations.some((r) => r.includes("Cloudflare"))) {
    recommendations.push("Configure WAF/CDN na borda (ex.: Cloudflare) — fora do app.");
  }

  return {
    checkedAt: new Date().toISOString(),
    apiSecurityEnforced: isApiSecurityEnforced(),
    supabaseConfigured: isSupabaseConfigured(),
    distributedRateLimit: isDistributedRateLimitConfigured(env),
    staffMfaFeatureEnabled: isStaffMfaFeatureEnabled(),
    staffMfaPolicyEnforced: isStaffMfaEnforced(env),
    cronSecretConfigured: Boolean(env.CRON_SECRET?.trim()),
    reconciliationCoopConfigured: Boolean(
      env.HB_RECONCILIATION_COOP_CNPJ?.trim() || env.HB_HOBELISCO_PROBE_COOP_CNPJ?.trim()
    ),
    authSecretConfigured: Boolean(env.AUTH_SECRET?.trim()),
    fieldEncryptionConfigured: Boolean(env.FIELD_ENCRYPTION_KEY?.trim() && env.FIELD_ENCRYPTION_KEY.length >= 32),
    crons: [
      {
        path: "/api/cron/hb-asaas-charges",
        schedule: "0 10 * * *",
        description: "PIX / cobranças Asaas",
      },
      {
        path: "/api/cron/credit-reconciliation",
        schedule: "0 6 * * *",
        description: "Reconciliação read-only HB Créditos",
      },
      {
        path: "/api/cron/hobelisco-credit-watch",
        schedule: "*/15 * * * *",
        description: "Hobelisco Credit Watch (se flag ON)",
      },
    ],
    recommendations,
  };
}
